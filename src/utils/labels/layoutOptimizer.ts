/**
 * Label Layout Optimizer
 * Bin-packing algorithm for multi-label impositions on HP Indigo rolls
 * 
 * RULES:
 * 1. Every slot in a frame MUST be filled — no empty slots allowed.
 *    If fewer unique items than slots, duplicate items across remaining slots.
 * 2. Quantities can be split across multiple runs (e.g. 1500 → 1000 + 500).
 * 3. The run length (frames) is determined by the slot with the MOST labels.
 *    All other slots print for the same length, so their actual output may
 *    exceed the requested quantity — that overage is waste.
 * 4. Minimize total waste (meters printed minus meters needed).
 * 5. Fewer runs = less changeover time = better.
 */

import { LABEL_PRINT_CONSTANTS, DEFAULT_OPTIMIZATION_WEIGHTS } from '@/types/labels';
import type { 
  LabelItem, 
  LabelDieline, 
  LayoutOption, 
  ProposedRun, 
  SlotAssignment,
  OptimizationWeights 
} from '@/types/labels';

const { MAX_FRAME_LENGTH_MM, METERS_PER_FRAME, FRAME_CHANGEOVER_MINUTES, SETUP_TIME_MINUTES } = LABEL_PRINT_CONSTANTS;

export interface LayoutInput {
  items: LabelItem[];
  dieline: LabelDieline;
  weights?: OptimizationWeights;
}

export interface SlotConfig {
  totalSlots: number;
  labelsPerFrame: number;       // total labels across all slots per frame
  labelsPerSlotPerFrame: number; // labels in ONE slot per frame
  framesPerMeter: number;
}

/**
 * Calculate slot configuration from dieline
 */
export function getSlotConfig(dieline: LabelDieline): SlotConfig {
  const totalSlots = dieline.columns_across;
  const labelsPerSlotPerFrame = dieline.rows_around;
  const labelsPerFrame = totalSlots * labelsPerSlotPerFrame;
  const frameHeightMm = dieline.label_height_mm * dieline.rows_around + 
                        dieline.vertical_gap_mm * (dieline.rows_around - 1);
  const framesPerMeter = Math.floor(1000 / frameHeightMm);
  
  return { totalSlots, labelsPerFrame, labelsPerSlotPerFrame, framesPerMeter };
}

/**
 * Calculate how many frames needed for a given quantity in ONE slot
 */
export function calculateFramesForSlot(quantity: number, config: SlotConfig): number {
  return Math.ceil(quantity / config.labelsPerSlotPerFrame);
}

/**
 * Calculate meters needed for a number of frames
 */
export function calculateMeters(frames: number, config: SlotConfig): number {
  return Math.round((frames / config.framesPerMeter) * 100) / 100;
}

/**
 * Calculate production time in minutes
 */
export function calculateProductionTime(runs: ProposedRun[]): number {
  const totalFrames = runs.reduce((sum, r) => sum + r.frames, 0);
  const changeoverTime = Math.max(0, runs.length - 1) * FRAME_CHANGEOVER_MINUTES;
  const printTime = totalFrames * (10 / 60); // ~10 seconds per frame
  return Math.ceil(SETUP_TIME_MINUTES + changeoverTime + printTime);
}

/**
 * Score a layout option based on weighted criteria
 */
export function scoreLayout(
  option: Omit<LayoutOption, 'overall_score'>,
  weights: OptimizationWeights
): number {
  return (
    option.material_efficiency_score * weights.material_efficiency +
    option.print_efficiency_score * weights.print_efficiency +
    option.labor_efficiency_score * weights.labor_efficiency
  );
}

// ─── STRATEGY HELPERS ────────────────────────────────────────────────

/**
 * Fill ALL slots in a run. If fewer items than slots, duplicate items
 * round-robin to ensure no empty slots.
 */
function fillAllSlots(
  itemSlots: { item_id: string; quantity: number }[],
  totalSlots: number
): SlotAssignment[] {
  if (itemSlots.length === 0) return [];
  
  const assignments: SlotAssignment[] = [];
  for (let s = 0; s < totalSlots; s++) {
    // Round-robin: reuse items if fewer items than slots
    const source = itemSlots[s % itemSlots.length];
    assignments.push({
      slot: s,
      item_id: source.item_id,
      quantity_in_slot: source.quantity,
    });
  }
  return assignments;
}

// ─── SLOT BALANCING ─────────────────────────────────────────────────

/**
 * Balance slot quantities within a run. If max/min ratio exceeds 1.10 (10%),
 * split into a balanced run (capped at min qty) and remainder runs.
 */
function balanceSlotQuantities(
  assignments: SlotAssignment[],
  config: SlotConfig,
  startRunNumber: number
): ProposedRun[] {
  // Get unique item quantities (ignore duplicated round-robin slots)
  const uniqueItems = new Map<string, number>();
  for (const a of assignments) {
    if (!uniqueItems.has(a.item_id) || a.quantity_in_slot > (uniqueItems.get(a.item_id) || 0)) {
      uniqueItems.set(a.item_id, a.quantity_in_slot);
    }
  }
  
  const quantities = [...uniqueItems.values()];
  const minQty = Math.min(...quantities);
  const maxQty = Math.max(...quantities);
  
  // Already balanced or single-item — return as-is
  if (minQty <= 0 || maxQty / minQty <= 1.10) {
    const maxFrames = Math.max(
      ...assignments.map(a => calculateFramesForSlot(a.quantity_in_slot, config))
    );
    return [{
      run_number: startRunNumber,
      slot_assignments: assignments,
      meters: calculateMeters(maxFrames, config),
      frames: maxFrames,
    }];
  }
  
  // Cap all slots at minQty for Run A (balanced run)
  const cappedAssignments: SlotAssignment[] = assignments.map(a => ({
    ...a,
    quantity_in_slot: Math.min(a.quantity_in_slot, minQty),
  }));
  
  const cappedFrames = calculateFramesForSlot(minQty, config);
  const runA: ProposedRun = {
    run_number: startRunNumber,
    slot_assignments: cappedAssignments,
    meters: calculateMeters(cappedFrames, config),
    frames: cappedFrames,
  };
  
  // Build remainder assignments for items that had more than minQty
  const remainderItemSlots: { item_id: string; quantity: number }[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    if (seen.has(a.item_id)) continue;
    seen.add(a.item_id);
    const remainder = a.quantity_in_slot - minQty;
    if (remainder > 0) {
      remainderItemSlots.push({ item_id: a.item_id, quantity: remainder });
    }
  }
  
  if (remainderItemSlots.length === 0) return [runA];
  
  // Recursively balance the remainder
  const remainderAssignments = fillAllSlots(remainderItemSlots, config.totalSlots);
  const remainderRuns = balanceSlotQuantities(remainderAssignments, config, startRunNumber + 1);
  
  return [runA, ...remainderRuns];
}

// ─── STRATEGY 1: GANGED (all items in one run) ──────────────────────

function createGangedRuns(items: LabelItem[], config: SlotConfig): ProposedRun[] {
  // Assign each item to a slot; if more items than slots, only take first N
  const itemSlots = items.slice(0, config.totalSlots).map(item => ({
    item_id: item.id,
    quantity: item.quantity,
  }));
  
  const assignments = fillAllSlots(itemSlots, config.totalSlots);
  
  // Balance the slot quantities — may produce multiple runs
  return balanceSlotQuantities(assignments, config, 1);
}

// ─── STRATEGY 2: INDIVIDUAL (one item per run, fills all slots) ─────

function createSingleItemRun(
  item: LabelItem,
  runNumber: number,
  config: SlotConfig
): ProposedRun {
  // Fill ALL slots with the same item (Smart Slot Filling)
  const qtyPerSlot = Math.ceil(item.quantity / config.totalSlots);
  let remaining = item.quantity;
  
  const assignments: SlotAssignment[] = [];
  for (let s = 0; s < config.totalSlots; s++) {
    const qty = Math.min(qtyPerSlot, remaining);
    assignments.push({
      slot: s,
      item_id: item.id,
      quantity_in_slot: qty,
    });
    remaining -= qty;
  }
  
  // Run length = frames needed for the slot with the most labels
  const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
  const frames = calculateFramesForSlot(maxSlotQty, config);
  
  return {
    run_number: runNumber,
    slot_assignments: assignments,
    meters: calculateMeters(frames, config),
    frames,
  };
}

// ─── STRATEGY 3: OPTIMIZED (balanced ganging with quantity splitting) ─

function createOptimizedRuns(items: LabelItem[], config: SlotConfig): ProposedRun[] {
  const runs: ProposedRun[] = [];
  const remaining = new Map(items.map(i => [i.id, i.quantity]));
  let runNumber = 1;
  
  while ([...remaining.values()].some(q => q > 0)) {
    // Get items with remaining quantity, sorted by qty ascending for grouping
    const activeItems = items
      .filter(i => (remaining.get(i.id) || 0) > 0)
      .sort((a, b) => (remaining.get(a.id) || 0) - (remaining.get(b.id) || 0));
    
    if (activeItems.length === 0) break;
    
    // Group items with similar quantities (within 10% of each other)
    const gangItems: LabelItem[] = [activeItems[0]];
    const baseQty = remaining.get(activeItems[0].id) || 0;
    
    for (let i = 1; i < activeItems.length && gangItems.length < config.totalSlots; i++) {
      const itemQty = remaining.get(activeItems[i].id) || 0;
      // Accept items within 10% of the base quantity
      if (baseQty > 0 && itemQty / baseQty <= 1.10 && baseQty / itemQty <= 1.10) {
        gangItems.push(activeItems[i]);
      }
    }
    
    // If we couldn't find similar items, just take what's available
    if (gangItems.length < config.totalSlots && activeItems.length > gangItems.length) {
      for (const item of activeItems) {
        if (!gangItems.includes(item) && gangItems.length < config.totalSlots) {
          gangItems.push(item);
        }
      }
    }
    
    const itemSlots = gangItems.map(item => ({
      item_id: item.id,
      quantity: remaining.get(item.id) || 0,
    }));
    
    // Fill all slots (round-robin if fewer items than slots)
    const assignments = fillAllSlots(itemSlots, config.totalSlots);
    
    // Balance the slot quantities — may split into multiple runs
    const balancedRuns = balanceSlotQuantities(assignments, config, runNumber);
    
    // Deduct assigned quantities from remaining
    for (const run of balancedRuns) {
      const deducted = new Set<string>();
      for (const a of run.slot_assignments) {
        if (!deducted.has(a.item_id)) {
          remaining.set(a.item_id, Math.max(0, (remaining.get(a.item_id) || 0) - a.quantity_in_slot));
          deducted.add(a.item_id);
        }
      }
    }
    
    runs.push(...balancedRuns);
    runNumber = runs.length + 1;
  }
  
  return runs;
}

// ─── SCORING & OPTION CREATION ──────────────────────────────────────

function createLayoutOption(
  id: string,
  runs: ProposedRun[],
  config: SlotConfig,
  theoreticalMinMeters: number,
  reasoning: string
): Omit<LayoutOption, 'overall_score'> {
  const totalMeters = runs.reduce((sum, r) => sum + r.meters, 0);
  const totalFrames = runs.reduce((sum, r) => sum + r.frames, 0);
  const wasteMeters = Math.max(0, totalMeters - theoreticalMinMeters);
  
  // Material efficiency: closer to theoretical minimum = better
  const materialEfficiency = totalMeters > 0 
    ? Math.max(0, 1 - (wasteMeters / totalMeters)) 
    : 0;
  // Print efficiency: fewer runs = better
  const printEfficiency = 1 / (1 + runs.length * 0.1);
  // Labor efficiency: fewer changeovers = better
  const laborEfficiency = 1 / (1 + runs.length * 0.15);
  
  return {
    id,
    runs,
    total_meters: totalMeters,
    total_frames: totalFrames,
    total_waste_meters: Math.round(wasteMeters * 100) / 100,
    material_efficiency_score: materialEfficiency,
    print_efficiency_score: printEfficiency,
    labor_efficiency_score: laborEfficiency,
    reasoning,
  };
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────

/**
 * Generate layout options using multiple strategies
 */
export function generateLayoutOptions(input: LayoutInput): LayoutOption[] {
  const { items, dieline, weights = DEFAULT_OPTIMIZATION_WEIGHTS } = input;
  const config = getSlotConfig(dieline);
  const partialOptions: Omit<LayoutOption, 'overall_score'>[] = [];
  
  if (items.length === 0) return [];
  
  // Theoretical minimum (perfect efficiency baseline)
  const totalLabelsNeeded = items.reduce((sum, i) => sum + i.quantity, 0);
  const theoreticalMinFrames = Math.ceil(totalLabelsNeeded / config.labelsPerFrame);
  const theoreticalMinMeters = calculateMeters(theoreticalMinFrames, config);
  
  // Option 1: Ganged — all items ganged (balanced, may produce multiple runs)
  if (items.length <= config.totalSlots) {
    const gangedRuns = createGangedRuns(items, config);
    partialOptions.push(createLayoutOption(
      'ganged-all',
      gangedRuns,
      config,
      theoreticalMinMeters,
      gangedRuns.length === 1
        ? 'All items ganged in a single balanced run — all slots filled'
        : `All items ganged, split into ${gangedRuns.length} balanced runs to minimize waste`
    ));
  }
  
  // Option 2: Individual — one dedicated run per item (all slots filled with same item)
  const individualRuns = items.map((item, idx) => 
    createSingleItemRun(item, idx + 1, config)
  );
  partialOptions.push(createLayoutOption(
    'individual',
    individualRuns,
    config,
    theoreticalMinMeters,
    'Each item on its own run — all slots filled, maximum flexibility for quantity control'
  ));
  
  // Option 3: Optimized — balanced ganging with quantity splitting across runs
  if (items.length > 1) {
    const optimizedRuns = createOptimizedRuns(items, config);
    if (optimizedRuns.length > 0) {
      partialOptions.push(createLayoutOption(
        'optimized',
        optimizedRuns,
        config,
        theoreticalMinMeters,
        'Balanced approach — items ganged where possible, quantities split across runs to minimize waste'
      ));
    }
  }
  
  // Score and sort
  const options: LayoutOption[] = partialOptions.map(opt => ({
    ...opt,
    overall_score: scoreLayout(opt, weights),
  }));
  
  return options.sort((a, b) => b.overall_score - a.overall_score);
}

/**
 * Format a layout option for display
 */
export function formatLayoutSummary(option: LayoutOption): string {
  return `${option.runs.length} run(s), ${option.total_meters.toFixed(1)}m total, ` +
         `${option.total_waste_meters.toFixed(1)}m waste, ` +
         `${Math.round(option.overall_score * 100)}% score`;
}
