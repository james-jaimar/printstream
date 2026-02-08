/**
 * Label Layout Optimizer
 * Bin-packing algorithm for multi-label impositions on HP Indigo rolls
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
  labelsPerFrame: number;
  framesPerMeter: number;
}

/**
 * Calculate slot configuration from dieline
 */
export function getSlotConfig(dieline: LabelDieline): SlotConfig {
  const totalSlots = dieline.columns_across;
  const labelsPerFrame = dieline.columns_across * dieline.rows_around;
  const frameHeightMm = dieline.label_height_mm * dieline.rows_around + 
                        dieline.vertical_gap_mm * (dieline.rows_around - 1);
  const framesPerMeter = Math.floor(1000 / frameHeightMm);
  
  return { totalSlots, labelsPerFrame, framesPerMeter };
}

/**
 * Calculate how many frames needed for a given quantity in a slot configuration
 */
export function calculateFramesNeeded(
  quantity: number,
  slotsUsed: number,
  config: SlotConfig
): number {
  const labelsPerFrame = slotsUsed * config.labelsPerFrame / config.totalSlots;
  return Math.ceil(quantity / labelsPerFrame);
}

/**
 * Calculate meters needed for a number of frames
 */
export function calculateMeters(frames: number, config: SlotConfig): number {
  return frames / config.framesPerMeter;
}

/**
 * Calculate production time in minutes
 */
export function calculateProductionTime(runs: ProposedRun[]): number {
  const totalFrames = runs.reduce((sum, r) => sum + r.frames, 0);
  const changeoverTime = (runs.length - 1) * FRAME_CHANGEOVER_MINUTES;
  // Assume ~10 seconds per frame printing
  const printTime = totalFrames * (10 / 60);
  return SETUP_TIME_MINUTES + changeoverTime + printTime;
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

/**
 * Generate all possible slot assignments for items
 * Uses a greedy bin-packing approach
 */
function generateSlotAssignments(
  items: LabelItem[],
  totalSlots: number
): SlotAssignment[][] {
  const assignments: SlotAssignment[][] = [];
  
  // Sort items by quantity (largest first for better packing)
  const sortedItems = [...items].sort((a, b) => b.quantity - a.quantity);
  
  // Strategy 1: One item per run (baseline)
  const singleItemRuns = sortedItems.map(item => [{
    slot: 0,
    item_id: item.id,
    quantity_in_slot: item.quantity
  }]);
  assignments.push(...singleItemRuns.map(a => [a[0]]));
  
  // Strategy 2: Gang multiple items in one run
  if (items.length > 1 && totalSlots >= 2) {
    const gangedAssignment: SlotAssignment[] = [];
    let slotIndex = 0;
    const remainingQuantities = new Map(items.map(i => [i.id, i.quantity]));
    
    // Distribute items across slots proportionally
    for (const item of sortedItems) {
      if (slotIndex >= totalSlots) break;
      gangedAssignment.push({
        slot: slotIndex,
        item_id: item.id,
        quantity_in_slot: item.quantity
      });
      slotIndex++;
    }
    
    if (gangedAssignment.length > 1) {
      assignments.push(gangedAssignment);
    }
  }
  
  // Strategy 3: Split large quantities across multiple runs
  for (const item of sortedItems) {
    if (item.quantity > 1000) {
      const halfQty = Math.ceil(item.quantity / 2);
      assignments.push([
        { slot: 0, item_id: item.id, quantity_in_slot: halfQty },
      ]);
      assignments.push([
        { slot: 0, item_id: item.id, quantity_in_slot: item.quantity - halfQty },
      ]);
    }
  }
  
  return assignments;
}

/**
 * Generate layout options using bin-packing optimization
 */
export function generateLayoutOptions(input: LayoutInput): LayoutOption[] {
  const { items, dieline, weights = DEFAULT_OPTIMIZATION_WEIGHTS } = input;
  const config = getSlotConfig(dieline);
  const partialOptions: Omit<LayoutOption, 'overall_score'>[] = [];
  
  if (items.length === 0) return [];
  
  // Calculate theoretical minimum (perfect efficiency baseline)
  const totalLabelsNeeded = items.reduce((sum, i) => sum + i.quantity, 0);
  const theoreticalMinFrames = Math.ceil(totalLabelsNeeded / config.labelsPerFrame);
  const theoreticalMinMeters = calculateMeters(theoreticalMinFrames, config);
  
  // Option 1: Single run with all items ganged (if possible)
  if (items.length <= config.totalSlots) {
    const gangedRun = createGangedRun(items, config);
    const gangedOption = createLayoutOption(
      'ganged-all',
      [gangedRun],
      config,
      theoreticalMinMeters,
      'All items ganged in a single run - maximum efficiency'
    );
    partialOptions.push(gangedOption);
  }
  
  // Option 2: Individual runs per item
  const individualRuns = items.map((item, idx) => 
    createSingleItemRun(item, idx + 1, config)
  );
  const individualOption = createLayoutOption(
    'individual',
    individualRuns,
    config,
    theoreticalMinMeters,
    'Each item printed separately - maximum flexibility'
  );
  partialOptions.push(individualOption);
  
  // Option 3: Optimized split (large quantities split across runs)
  const largeItems = items.filter(i => i.quantity > 500);
  if (largeItems.length > 0 && items.length > 1) {
    const optimizedRuns = createOptimizedRuns(items, config);
    if (optimizedRuns.length > 0) {
      const optimizedOption = createLayoutOption(
        'optimized',
        optimizedRuns,
        config,
        theoreticalMinMeters,
        'Balanced approach - quantities optimized for minimal waste'
      );
      partialOptions.push(optimizedOption);
    }
  }
  
  // Score and sort options
  const options: LayoutOption[] = partialOptions.map(opt => ({
    ...opt,
    overall_score: scoreLayout(opt, weights)
  }));
  
  return options.sort((a, b) => b.overall_score - a.overall_score);
}

function createGangedRun(items: LabelItem[], config: SlotConfig): ProposedRun {
  const slotAssignments: SlotAssignment[] = items.map((item, idx) => ({
    slot: idx,
    item_id: item.id,
    quantity_in_slot: item.quantity
  }));
  
  // Find the item requiring most frames (determines run length)
  const maxFrames = Math.ceil(Math.max(
    ...items.map(item => 
      calculateFramesNeeded(item.quantity, 1, config)
    )
  ));
  
  return {
    run_number: 1,
    slot_assignments: slotAssignments,
    meters: calculateMeters(maxFrames, config),
    frames: maxFrames
  };
}

function createSingleItemRun(
  item: LabelItem, 
  runNumber: number, 
  config: SlotConfig
): ProposedRun {
  // Ensure frames is always an integer
  const frames = Math.ceil(calculateFramesNeeded(item.quantity, config.totalSlots, config));
  
  return {
    run_number: runNumber,
    slot_assignments: [{
      slot: 0,
      item_id: item.id,
      quantity_in_slot: item.quantity
    }],
    meters: calculateMeters(frames, config),
    frames
  };
}

function createOptimizedRuns(items: LabelItem[], config: SlotConfig): ProposedRun[] {
  const runs: ProposedRun[] = [];
  const remaining = new Map(items.map(i => [i.id, { ...i, remaining: i.quantity }]));
  let runNumber = 1;
  
  while ([...remaining.values()].some(i => i.remaining > 0)) {
    // Find items that can be ganged together (similar quantities)
    const activeItems = [...remaining.values()]
      .filter(i => i.remaining > 0)
      .slice(0, config.totalSlots);
    
    if (activeItems.length === 0) break;
    
    // Calculate optimal batch size based on smallest remaining quantity
    const minRemaining = Math.min(...activeItems.map(i => i.remaining));
    const batchSize = Math.min(minRemaining, 500); // Cap batch for flexibility
    
    const slotAssignments: SlotAssignment[] = activeItems.map((item, idx) => {
      const qtyInSlot = Math.min(item.remaining, batchSize);
      remaining.get(item.id)!.remaining -= qtyInSlot;
      return {
        slot: idx,
        item_id: item.id,
        quantity_in_slot: qtyInSlot
      };
    });
    
    const maxQty = Math.max(...slotAssignments.map(s => s.quantity_in_slot));
    // Ensure frames is always an integer
    const frames = Math.ceil(calculateFramesNeeded(maxQty, 1, config));
    
    runs.push({
      run_number: runNumber++,
      slot_assignments: slotAssignments,
      meters: calculateMeters(frames, config),
      frames
    });
  }
  
  return runs;
}

function createLayoutOption(
  id: string,
  runs: ProposedRun[],
  config: SlotConfig,
  theoreticalMinMeters: number,
  reasoning: string
): Omit<LayoutOption, 'overall_score'> {
  const totalMeters = runs.reduce((sum, r) => sum + r.meters, 0);
  const totalFrames = runs.reduce((sum, r) => sum + r.frames, 0);
  const wasteMeters = totalMeters - theoreticalMinMeters;
  
  // Calculate efficiency scores (0-1)
  const materialEfficiency = Math.max(0, 1 - (wasteMeters / totalMeters));
  const printEfficiency = 1 / (1 + runs.length * 0.1); // Fewer runs = better
  const laborEfficiency = 1 / (1 + runs.length * 0.15); // Fewer changeovers = better
  
  return {
    id,
    runs,
    total_meters: totalMeters,
    total_frames: totalFrames,
    total_waste_meters: Math.max(0, wasteMeters),
    material_efficiency_score: materialEfficiency,
    print_efficiency_score: printEfficiency,
    labor_efficiency_score: laborEfficiency,
    reasoning
  };
}

/**
 * Format a layout option for display
 */
export function formatLayoutSummary(option: LayoutOption): string {
  return `${option.runs.length} run(s), ${option.total_meters.toFixed(1)}m total, ` +
         `${option.total_waste_meters.toFixed(1)}m waste, ` +
         `${Math.round(option.overall_score * 100)}% score`;
}
