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

import { LABEL_PRINT_CONSTANTS, DEFAULT_OPTIMIZATION_WEIGHTS, INK_CONFIG_SPEEDS } from '@/types/labels';
import type { 
  LabelItem, 
  LabelDieline, 
  LabelInkConfig,
  LayoutOption, 
  ProposedRun, 
  SlotAssignment,
  OptimizationWeights 
} from '@/types/labels';

const { MAX_FRAME_LENGTH_MM, MAKE_READY_FIRST_MIN, MAKE_READY_SUBSEQUENT_MIN } = LABEL_PRINT_CONSTANTS;

export interface LayoutInput {
  items: LabelItem[];
  dieline: LabelDieline;
  weights?: OptimizationWeights;
  inkConfig?: LabelInkConfig;
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
  
  // Single template height (one complete dieline layout)
  const bleedVertical = (dieline.bleed_top_mm || 0) + (dieline.bleed_bottom_mm || 0);
  const templateHeightMm = dieline.label_height_mm * dieline.rows_around + 
                           dieline.vertical_gap_mm * (dieline.rows_around - 1) +
                           bleedVertical;
  
  // Stack multiple complete templates within the 960mm max frame length
  const templatesPerFrame = Math.max(1, Math.floor(MAX_FRAME_LENGTH_MM / templateHeightMm));
  const frameHeightMm = templateHeightMm * templatesPerFrame;
  
  // Labels per slot = rows_around * templates stacked
  const labelsPerSlotPerFrame = dieline.rows_around * templatesPerFrame;
  const labelsPerFrame = totalSlots * labelsPerSlotPerFrame;
  
  const framesPerMeter = 1000 / frameHeightMm;
  
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
  // Total meters = frames / framesPerMeter (exact frame height based)
  return Math.round((frames / config.framesPerMeter) * 100) / 100;
}

/**
 * Calculate production time in minutes.
 * Make-ready is a single 20-min setup per order (all runs share one setup).
 * The 10-min subsequent setup applies between different orders on the same
 * substrate and is handled at the scheduling/planning level, not here.
 */
export function calculateProductionTime(runs: ProposedRun[], inkConfig?: LabelInkConfig): number {
  const speed = INK_CONFIG_SPEEDS[inkConfig || 'CMYK'];
  const totalMeters = runs.reduce((sum, r) => sum + r.meters, 0);
  const printTimeMinutes = totalMeters / speed;
  const makeReadyMinutes = MAKE_READY_FIRST_MIN; // single setup for entire order
  return Math.ceil(makeReadyMinutes + printTimeMinutes);
}

/**
 * Calculate print-only time for a single run (no make-ready).
 * Used when storing per-run durations in the database.
 */
export function calculateRunPrintTime(run: ProposedRun, inkConfig?: LabelInkConfig): number {
  const speed = INK_CONFIG_SPEEDS[inkConfig || 'CMYK'];
  return Math.ceil(run.meters / speed);
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
  itemSlots: { item_id: string; quantity: number; needs_rotation?: boolean }[],
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
      quantity_in_slot: source.quantity, // placeholder, adjusted below
      needs_rotation: source.needs_rotation || false,
    });
  }
  
  // Count how many slots each item occupies
  const slotCounts = new Map<string, number>();
  for (const a of assignments) {
    slotCounts.set(a.item_id, (slotCounts.get(a.item_id) || 0) + 1);
  }
  
  // Divide quantity by slot count so total across slots = original quantity
  for (const a of assignments) {
    const count = slotCounts.get(a.item_id) || 1;
    a.quantity_in_slot = Math.ceil(a.quantity_in_slot / count);
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
  const remainderItemSlots: { item_id: string; quantity: number; needs_rotation?: boolean }[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    if (seen.has(a.item_id)) continue;
    seen.add(a.item_id);
    const remainder = a.quantity_in_slot - minQty;
    if (remainder > 0) {
      remainderItemSlots.push({ item_id: a.item_id, quantity: remainder, needs_rotation: a.needs_rotation });
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
    needs_rotation: item.needs_rotation || false,
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
      needs_rotation: item.needs_rotation || false,
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

// ─── STRATEGY 3: OPTIMIZED (level-matching with quantity splitting) ──

/**
 * Cluster quantities into natural levels.
 * Quantities within 10% of each other are merged into a single level
 * (using the most common value in the cluster as representative).
 */
function findQuantityLevels(quantities: number[]): number[] {
  if (quantities.length === 0) return [];
  
  const sorted = [...new Set(quantities)].sort((a, b) => b - a); // descending
  const levels: number[] = [];
  
  for (const qty of sorted) {
    // Check if this qty fits into an existing level (within 10%)
    const existingLevel = levels.find(l => 
      l > 0 && qty > 0 && Math.max(l, qty) / Math.min(l, qty) <= 1.10
    );
    if (!existingLevel) {
      levels.push(qty);
    }
  }
  
  return levels.sort((a, b) => b - a); // highest first
}

/**
 * Smart level-matching optimizer.
 * 
 * 1. Identify natural quantity levels from all items
 * 2. For each level (highest first), collect items with >= level remaining
 * 3. Assign them to runs at that level quantity, deducting from remaining
 * 4. Remainders naturally fall to lower levels
 * 5. Any leftover gets its own individual run
 */
function createOptimizedRuns(items: LabelItem[], config: SlotConfig): ProposedRun[] {
  const runs: ProposedRun[] = [];
  const remaining = new Map(items.map(i => [i.id, i.quantity]));
  let runNumber = 1;
  
  // 1. Find natural quantity levels
  const allQuantities = items.map(i => i.quantity);
  const levels = findQuantityLevels(allQuantities);
  
  // 2. Process each level, highest first
  for (const level of levels) {
    // Collect items that have enough remaining to contribute at this level
    let candidates = items.filter(i => (remaining.get(i.id) || 0) >= level);
    
    while (candidates.length > 0) {
      // Take up to totalSlots candidates for this run
      const batch = candidates.slice(0, config.totalSlots);
      
      const itemSlots = batch.map(item => ({
        item_id: item.id,
        quantity: level,
        needs_rotation: item.needs_rotation || false,
      }));
      
      // Fill all slots (round-robin if fewer items than slots)
      const assignments = fillAllSlots(itemSlots, config.totalSlots);
      
      const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
      const frames = calculateFramesForSlot(maxSlotQty, config);
      runs.push({
        run_number: runNumber++,
        slot_assignments: assignments,
        meters: calculateMeters(frames, config),
        frames,
      });
      
      // Deduct level from each batch item's remaining
      for (const item of batch) {
        remaining.set(item.id, Math.max(0, (remaining.get(item.id) || 0) - level));
      }
      
      // Re-check candidates for this level
      candidates = items.filter(i => (remaining.get(i.id) || 0) >= level);
    }
  }
  
  // 3. Handle any leftover remainders (quantities that didn't match any level)
  const leftovers = items.filter(i => (remaining.get(i.id) || 0) > 0);
  
  if (leftovers.length > 0) {
    // Try to gang leftovers together if they're similar
    const leftoverLevels = findQuantityLevels(leftovers.map(i => remaining.get(i.id) || 0));
    
    for (const level of leftoverLevels) {
      let candidates = leftovers.filter(i => (remaining.get(i.id) || 0) >= level);
      
      while (candidates.length > 0) {
        const batch = candidates.slice(0, config.totalSlots);
        const qty = Math.min(...batch.map(i => remaining.get(i.id) || 0));
        
        const itemSlots = batch.map(item => ({
          item_id: item.id,
          quantity: qty,
          needs_rotation: item.needs_rotation || false,
        }));
        
        const assignments = fillAllSlots(itemSlots, config.totalSlots);
        const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
        const frames = calculateFramesForSlot(maxSlotQty, config);
        
        runs.push({
          run_number: runNumber++,
          slot_assignments: assignments,
          meters: calculateMeters(frames, config),
          frames,
        });
        
        for (const item of batch) {
          remaining.set(item.id, Math.max(0, (remaining.get(item.id) || 0) - qty));
        }
        
        candidates = leftovers.filter(i => (remaining.get(i.id) || 0) >= level);
      }
    }
  }
  
  // 4. Final safety net: any still-remaining items get individual runs
  for (const item of items) {
    const rem = remaining.get(item.id) || 0;
    if (rem > 0) {
      const itemSlots = [{ item_id: item.id, quantity: rem, needs_rotation: item.needs_rotation || false }];
      const assignments = fillAllSlots(itemSlots, config.totalSlots);
      const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
      const frames = calculateFramesForSlot(maxSlotQty, config);
      
      runs.push({
        run_number: runNumber++,
        slot_assignments: assignments,
        meters: calculateMeters(frames, config),
        frames,
      });
      
      remaining.set(item.id, 0);
    }
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
