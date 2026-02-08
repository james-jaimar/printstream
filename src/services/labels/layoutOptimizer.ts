/**
 * AI Layout Optimization Engine for HP Indigo Label Printing
 * 
 * Uses bin-packing algorithm to arrange label items across slots
 * on a roll, minimizing waste and maximizing print efficiency.
 */

import { 
  LABEL_PRINT_CONSTANTS, 
  DEFAULT_OPTIMIZATION_WEIGHTS,
  type LabelItem, 
  type LabelDieline,
  type LayoutOption,
  type ProposedRun,
  type SlotAssignment,
  type OptimizationWeights 
} from '@/types/labels';

interface LayoutInput {
  items: LabelItem[];
  dieline: LabelDieline;
  weights?: OptimizationWeights;
}

interface SlotConfig {
  slotsPerFrame: number;
  labelsPerSlot: number; // labels per meter in this slot
}

/**
 * Calculate how many labels fit per meter of roll for a given dieline
 */
function calculateLabelsPerMeter(dieline: LabelDieline): number {
  const labelHeightWithGap = dieline.label_height_mm + dieline.vertical_gap_mm;
  const labelsPerFrame = Math.floor(LABEL_PRINT_CONSTANTS.MAX_FRAME_LENGTH_MM / labelHeightWithGap);
  const labelsPerMeter = labelsPerFrame / LABEL_PRINT_CONSTANTS.METERS_PER_FRAME;
  return labelsPerMeter * dieline.columns_across; // multiply by columns
}

/**
 * Calculate meters needed to print a quantity of labels
 */
function calculateMetersForQuantity(quantity: number, dieline: LabelDieline): number {
  const labelsPerMeter = calculateLabelsPerMeter(dieline);
  return Math.ceil(quantity / labelsPerMeter) * LABEL_PRINT_CONSTANTS.METERS_PER_FRAME;
}

/**
 * Calculate frames needed for a given number of meters
 */
function calculateFrames(meters: number): number {
  return Math.ceil(meters / LABEL_PRINT_CONSTANTS.METERS_PER_FRAME);
}

/**
 * First-Fit Decreasing bin-packing algorithm
 * Assigns items to runs trying to fill each run before starting new ones
 */
function firstFitDecreasing(
  items: LabelItem[],
  dieline: LabelDieline
): ProposedRun[] {
  const slotsPerFrame = dieline.columns_across;
  const labelsPerMeter = calculateLabelsPerMeter(dieline);
  
  // Sort items by quantity descending (FFD principle)
  const sortedItems = [...items].sort((a, b) => b.quantity - a.quantity);
  
  const runs: ProposedRun[] = [];
  const remainingQuantities = new Map<string, number>();
  
  // Initialize remaining quantities
  sortedItems.forEach(item => {
    remainingQuantities.set(item.id, item.quantity);
  });
  
  let runNumber = 1;
  
  // Keep creating runs until all items are assigned
  while (Array.from(remainingQuantities.values()).some(q => q > 0)) {
    const slotAssignments: SlotAssignment[] = [];
    let maxMetersInRun = 0;
    
    // Try to fill each slot
    for (let slot = 0; slot < slotsPerFrame; slot++) {
      // Find the item with the largest remaining quantity that fits
      let bestItem: LabelItem | null = null;
      let bestQuantity = 0;
      
      for (const item of sortedItems) {
        const remaining = remainingQuantities.get(item.id) || 0;
        if (remaining > 0 && remaining > bestQuantity) {
          bestItem = item;
          bestQuantity = remaining;
        }
      }
      
      if (bestItem && bestQuantity > 0) {
        // Calculate how many labels can fit in this slot for this run
        // We want runs to be balanced, so limit to a reasonable frame count
        const targetMeters = Math.max(
          maxMetersInRun,
          calculateMetersForQuantity(Math.min(bestQuantity, 10000), dieline) / slotsPerFrame
        );
        
        const labelsInSlotPerMeter = labelsPerMeter / slotsPerFrame;
        const quantityInSlot = Math.min(
          bestQuantity,
          Math.ceil(targetMeters * labelsInSlotPerMeter)
        );
        
        if (quantityInSlot > 0) {
          slotAssignments.push({
            slot,
            item_id: bestItem.id,
            quantity_in_slot: quantityInSlot
          });
          
          remainingQuantities.set(
            bestItem.id, 
            (remainingQuantities.get(bestItem.id) || 0) - quantityInSlot
          );
          
          const metersForSlot = quantityInSlot / labelsInSlotPerMeter;
          maxMetersInRun = Math.max(maxMetersInRun, metersForSlot);
        }
      }
    }
    
    if (slotAssignments.length === 0) break;
    
    const meters = Math.ceil(maxMetersInRun * 100) / 100;
    const frames = calculateFrames(meters);
    
    runs.push({
      run_number: runNumber++,
      slot_assignments: slotAssignments,
      meters,
      frames
    });
  }
  
  return runs;
}

/**
 * Best-Fit algorithm - tries to minimize waste per run
 */
function bestFit(
  items: LabelItem[],
  dieline: LabelDieline
): ProposedRun[] {
  const slotsPerFrame = dieline.columns_across;
  const labelsPerMeter = calculateLabelsPerMeter(dieline);
  
  const runs: ProposedRun[] = [];
  const remainingQuantities = new Map<string, number>();
  
  items.forEach(item => {
    remainingQuantities.set(item.id, item.quantity);
  });
  
  let runNumber = 1;
  
  while (Array.from(remainingQuantities.values()).some(q => q > 0)) {
    const slotAssignments: SlotAssignment[] = [];
    
    // Group items by similar quantities for better packing
    const itemsWithRemaining = items
      .filter(item => (remainingQuantities.get(item.id) || 0) > 0)
      .sort((a, b) => {
        const remA = remainingQuantities.get(a.id) || 0;
        const remB = remainingQuantities.get(b.id) || 0;
        return remB - remA;
      });
    
    // Take items that have similar quantities to minimize waste
    const targetQuantity = remainingQuantities.get(itemsWithRemaining[0]?.id) || 0;
    const selectedItems = itemsWithRemaining.filter(item => {
      const rem = remainingQuantities.get(item.id) || 0;
      return rem >= targetQuantity * 0.5; // Within 50% of target
    }).slice(0, slotsPerFrame);
    
    if (selectedItems.length === 0) {
      // Fallback: just take whatever's left
      selectedItems.push(...itemsWithRemaining.slice(0, slotsPerFrame));
    }
    
    let maxMetersInRun = 0;
    
    selectedItems.forEach((item, index) => {
      const remaining = remainingQuantities.get(item.id) || 0;
      const labelsInSlotPerMeter = labelsPerMeter / slotsPerFrame;
      
      // Calculate quantity for balanced run
      const baseQuantity = Math.min(remaining, targetQuantity);
      
      slotAssignments.push({
        slot: index,
        item_id: item.id,
        quantity_in_slot: baseQuantity
      });
      
      remainingQuantities.set(item.id, remaining - baseQuantity);
      
      const metersForSlot = baseQuantity / labelsInSlotPerMeter;
      maxMetersInRun = Math.max(maxMetersInRun, metersForSlot);
    });
    
    if (slotAssignments.length === 0) break;
    
    const meters = Math.ceil(maxMetersInRun * 100) / 100;
    const frames = calculateFrames(meters);
    
    runs.push({
      run_number: runNumber++,
      slot_assignments: slotAssignments,
      meters,
      frames
    });
  }
  
  return runs;
}

/**
 * Single-run-per-item strategy - simplest but potentially more waste
 */
function singleItemRuns(
  items: LabelItem[],
  dieline: LabelDieline
): ProposedRun[] {
  const slotsPerFrame = dieline.columns_across;
  const labelsPerMeter = calculateLabelsPerMeter(dieline);
  const labelsInSlotPerMeter = labelsPerMeter / slotsPerFrame;
  
  return items.map((item, index) => {
    // Fill all slots with the same item
    const slotAssignments: SlotAssignment[] = [];
    const quantityPerSlot = Math.ceil(item.quantity / slotsPerFrame);
    
    for (let slot = 0; slot < slotsPerFrame; slot++) {
      const remaining = item.quantity - (slot * quantityPerSlot);
      const quantityInSlot = Math.min(quantityPerSlot, Math.max(0, remaining));
      
      if (quantityInSlot > 0) {
        slotAssignments.push({
          slot,
          item_id: item.id,
          quantity_in_slot: quantityInSlot
        });
      }
    }
    
    const meters = Math.ceil(item.quantity / labelsPerMeter * 100) / 100;
    const frames = calculateFrames(meters);
    
    return {
      run_number: index + 1,
      slot_assignments: slotAssignments,
      meters,
      frames
    };
  });
}

/**
 * Calculate efficiency scores for a layout option
 */
function calculateScores(
  runs: ProposedRun[],
  items: LabelItem[],
  dieline: LabelDieline,
  weights: OptimizationWeights
): { material: number; print: number; labor: number; overall: number } {
  const slotsPerFrame = dieline.columns_across;
  const totalLabels = items.reduce((sum, item) => sum + item.quantity, 0);
  const labelsPerMeter = calculateLabelsPerMeter(dieline);
  
  const totalMeters = runs.reduce((sum, run) => sum + run.meters, 0);
  const totalFrames = runs.reduce((sum, run) => sum + run.frames, 0);
  
  // Material efficiency: how much of the printed material is used vs wasted
  const theoreticalMinMeters = totalLabels / labelsPerMeter;
  const materialEfficiency = Math.min(1, theoreticalMinMeters / totalMeters);
  
  // Print efficiency: fewer runs = better (less setup/changeover)
  const minPossibleRuns = Math.ceil(items.length / slotsPerFrame);
  const printEfficiency = Math.min(1, minPossibleRuns / runs.length);
  
  // Labor efficiency: how well slots are utilized across runs
  const totalSlotOpportunities = runs.length * slotsPerFrame;
  const usedSlots = runs.reduce((sum, run) => sum + run.slot_assignments.length, 0);
  const laborEfficiency = usedSlots / totalSlotOpportunities;
  
  // Weighted overall score
  const overall = 
    materialEfficiency * weights.material_efficiency +
    printEfficiency * weights.print_efficiency +
    laborEfficiency * weights.labor_efficiency;
  
  return {
    material: Math.round(materialEfficiency * 100),
    print: Math.round(printEfficiency * 100),
    labor: Math.round(laborEfficiency * 100),
    overall: Math.round(overall * 100)
  };
}

/**
 * Generate reasoning text for a layout option
 */
function generateReasoning(
  runs: ProposedRun[],
  items: LabelItem[],
  scores: { material: number; print: number; labor: number; overall: number }
): string {
  const totalLabels = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalMeters = runs.reduce((sum, run) => sum + run.meters, 0);
  const totalFrames = runs.reduce((sum, run) => sum + run.frames, 0);
  
  const parts: string[] = [];
  
  parts.push(`${runs.length} run${runs.length !== 1 ? 's' : ''} printing ${totalLabels.toLocaleString()} labels`);
  parts.push(`${totalMeters.toFixed(1)}m of substrate (${totalFrames} frames)`);
  
  if (scores.material >= 90) {
    parts.push('Excellent material utilization');
  } else if (scores.material >= 75) {
    parts.push('Good material efficiency');
  } else {
    parts.push('Some material waste expected');
  }
  
  if (runs.length === 1) {
    parts.push('Single-run simplicity');
  } else if (scores.labor >= 85) {
    parts.push('Well-balanced slot usage');
  }
  
  return parts.join('. ') + '.';
}

/**
 * Main optimization function - generates multiple layout options
 */
export function generateLayoutOptions(input: LayoutInput): LayoutOption[] {
  const { items, dieline, weights = DEFAULT_OPTIMIZATION_WEIGHTS } = input;
  
  if (items.length === 0) {
    return [];
  }
  
  const strategies = [
    { name: 'Balanced', fn: firstFitDecreasing },
    { name: 'Minimal Waste', fn: bestFit },
    { name: 'Simple', fn: singleItemRuns },
  ];
  
  const options: LayoutOption[] = strategies.map((strategy, index) => {
    const runs = strategy.fn(items, dieline);
    const scores = calculateScores(runs, items, dieline, weights);
    
    const totalMeters = runs.reduce((sum, run) => sum + run.meters, 0);
    const totalFrames = runs.reduce((sum, run) => sum + run.frames, 0);
    const labelsPerMeter = calculateLabelsPerMeter(dieline);
    const theoreticalMinMeters = items.reduce((sum, item) => sum + item.quantity, 0) / labelsPerMeter;
    
    return {
      id: `layout-${strategy.name.toLowerCase().replace(/\s+/g, '-')}-${index}`,
      runs,
      total_meters: Math.round(totalMeters * 100) / 100,
      total_frames: totalFrames,
      total_waste_meters: Math.round((totalMeters - theoreticalMinMeters) * 100) / 100,
      material_efficiency_score: scores.material,
      print_efficiency_score: scores.print,
      labor_efficiency_score: scores.labor,
      overall_score: scores.overall,
      reasoning: generateReasoning(runs, items, scores)
    };
  });
  
  // Sort by overall score descending
  return options.sort((a, b) => b.overall_score - a.overall_score);
}

/**
 * Get estimated production time for a layout option
 */
export function estimateProductionTime(option: LayoutOption): number {
  const setupTime = LABEL_PRINT_CONSTANTS.SETUP_TIME_MINUTES;
  const changeoverTime = (option.runs.length - 1) * LABEL_PRINT_CONSTANTS.FRAME_CHANGEOVER_MINUTES;
  const printTime = option.total_frames * 0.5; // ~30 seconds per frame average
  
  return Math.ceil(setupTime + changeoverTime + printTime);
}

/**
 * Validate that a layout covers all required quantities
 */
export function validateLayout(
  option: LayoutOption, 
  items: LabelItem[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const assignedQuantities = new Map<string, number>();
  
  // Sum up assigned quantities per item
  option.runs.forEach(run => {
    run.slot_assignments.forEach(slot => {
      const current = assignedQuantities.get(slot.item_id) || 0;
      assignedQuantities.set(slot.item_id, current + slot.quantity_in_slot);
    });
  });
  
  // Check each item has correct quantity
  items.forEach(item => {
    const assigned = assignedQuantities.get(item.id) || 0;
    if (assigned < item.quantity) {
      errors.push(`${item.name}: Missing ${item.quantity - assigned} labels`);
    } else if (assigned > item.quantity) {
      errors.push(`${item.name}: Over-assigned by ${assigned - item.quantity} labels`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}
