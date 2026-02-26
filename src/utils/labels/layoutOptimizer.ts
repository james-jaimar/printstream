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

/** Up to 50 labels at the end of a roll can be ignored (rounding from layout grid) */
export const ROLL_TOLERANCE = 50;

/** Default absolute max overrun per slot (label count) — beyond this, runs should be split */
export const DEFAULT_MAX_OVERRUN = 250;

export interface LayoutInput {
  items: LabelItem[];
  dieline: LabelDieline;
  weights?: OptimizationWeights;
  inkConfig?: LabelInkConfig;
  qtyPerRoll?: number;
  maxOverrun?: number;
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
  startRunNumber: number,
  maxOverrun: number = DEFAULT_MAX_OVERRUN
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
  if (minQty <= 0 || (maxQty - minQty) <= maxOverrun) {
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
  const remainderRuns = balanceSlotQuantities(remainderAssignments, config, startRunNumber + 1, maxOverrun);
  
  return [runA, ...remainderRuns];
}

// ─── STRATEGY 1: GANGED (all items in one run) ──────────────────────

function createGangedRuns(items: LabelItem[], config: SlotConfig, maxOverrun: number = DEFAULT_MAX_OVERRUN): ProposedRun[] {
  if (items.length <= config.totalSlots) {
    // All items fit in one run
    const itemSlots = items.map(item => ({
      item_id: item.id,
      quantity: item.quantity,
      needs_rotation: item.needs_rotation || false,
    }));
    
    const assignments = fillAllSlots(itemSlots, config.totalSlots);
    
    // Validate actual output doesn't exceed maxOverrun for any slot
    if (!validateRunOverrun(assignments, config, maxOverrun)) {
      // Round-robin created too much imbalance — fall back to balanced splitting
      return balanceSlotQuantities(assignments, config, 1, maxOverrun);
    }
    
    // Also check slot-to-slot balance
    return balanceSlotQuantities(assignments, config, 1, maxOverrun);
  }
  
  // More items than slots — group by quantity similarity and create multiple ganged runs
  const sorted = [...items].sort((a, b) => b.quantity - a.quantity);
  const runs: ProposedRun[] = [];
  let runNumber = 1;
  
  for (let i = 0; i < sorted.length; i += config.totalSlots) {
    const batch = sorted.slice(i, i + config.totalSlots);
    const itemSlots = batch.map(item => ({
      item_id: item.id,
      quantity: item.quantity,
      needs_rotation: item.needs_rotation || false,
    }));
    
    const assignments = fillAllSlots(itemSlots, config.totalSlots);
    const batchRuns = balanceSlotQuantities(assignments, config, runNumber, maxOverrun);
    runs.push(...batchRuns);
    runNumber = runs.length + 1;
  }
  
  return runs;
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

// ─── STRATEGY 3: OPTIMIZED (greedy grouping) ───────────────────────

/**
 * Validate that a run's actual output doesn't exceed any slot's requested
 * quantity by more than maxOverrun. This catches the round-robin imbalance
 * problem where e.g. 2 items across 5 slots creates a 3/2 split that
 * drives frames way above what the minority slots need.
 */
function validateRunOverrun(
  assignments: SlotAssignment[],
  config: SlotConfig,
  maxOverrun: number
): boolean {
  const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
  const frames = calculateFramesForSlot(maxSlotQty, config);
  const actualPerSlot = frames * config.labelsPerSlotPerFrame;

  for (const a of assignments) {
    if (a.quantity_in_slot > 0 && (actualPerSlot - a.quantity_in_slot) > maxOverrun) {
      return false;
    }
  }
  return true;
}

/**
 * Greedy grouping optimizer.
 * 
 * 1. Sort items by quantity descending
 * 2. Pick highest unassigned item as "anchor"
 * 3. Find all unassigned items within maxOverrun of anchor's quantity
 * 4. Take up to totalSlots compatible items, build a run
 * 5. Validate with validateRunOverrun; if invalid, shrink batch
 * 6. Repeat until all items assigned
 * 
 * Higher maxOverrun = more items compatible per anchor = fewer runs.
 * This is the correct intuitive behavior.
 */
function createOptimizedRuns(items: LabelItem[], config: SlotConfig, maxOverrun: number = DEFAULT_MAX_OVERRUN): ProposedRun[] {
  const runs: ProposedRun[] = [];
  let runNumber = 1;
  
  // Sort items by quantity descending
  const sorted = [...items].sort((a, b) => b.quantity - a.quantity);
  const unassigned = new Set(sorted.map((_, i) => i)); // indices into sorted
  
  while (unassigned.size > 0) {
    // Pick highest remaining as anchor
    let anchorIdx = -1;
    for (const idx of unassigned) {
      if (anchorIdx === -1 || sorted[idx].quantity > sorted[anchorIdx].quantity) {
        anchorIdx = idx;
      }
    }
    
    const anchor = sorted[anchorIdx];
    
    // Find all unassigned items within maxOverrun of anchor
    const compatible: number[] = [];
    for (const idx of unassigned) {
      if (Math.abs(sorted[idx].quantity - anchor.quantity) <= maxOverrun) {
        compatible.push(idx);
      }
    }
    
    // Sort compatible by quantity descending (closest to anchor first)
    compatible.sort((a, b) => sorted[b].quantity - sorted[a].quantity);
    
    // Try batch sizes from totalSlots down to 1
    let placed = false;
    
    for (let batchSize = Math.min(compatible.length, config.totalSlots); batchSize >= 1; batchSize--) {
      const batch = compatible.slice(0, batchSize);
      
      const itemSlots = batch.map(idx => ({
        item_id: sorted[idx].id,
        quantity: sorted[idx].quantity,
        needs_rotation: sorted[idx].needs_rotation || false,
      }));
      
      const assignments = fillAllSlots(itemSlots, config.totalSlots);
      
      // Check slot-to-slot balance
      const slotQtys = assignments.map(a => a.quantity_in_slot);
      const maxSlotQty = Math.max(...slotQtys);
      const minSlotQty = Math.min(...slotQtys.filter(q => q > 0));
      const slotImbalance = minSlotQty > 0 && (maxSlotQty - minSlotQty) > maxOverrun;
      
      // Check actual output overrun
      const actualOutputOk = validateRunOverrun(assignments, config, maxOverrun);
      
      if (!slotImbalance && actualOutputOk) {
        // Valid run — commit it
        const frames = calculateFramesForSlot(maxSlotQty, config);
        runs.push({
          run_number: runNumber++,
          slot_assignments: assignments,
          meters: calculateMeters(frames, config),
          frames,
        });
        
        // Remove batch items from unassigned
        for (const idx of batch) {
          unassigned.delete(idx);
        }
        placed = true;
        break;
      }
      
      // If batch of 1 still fails (shouldn't happen for single item), fall through
    }
    
    if (!placed) {
      // Fallback: create individual run for anchor
      runs.push(createSingleItemRun(anchor, runNumber++, config));
      unassigned.delete(anchorIdx);
    }
  }
  
  return runs;
}

// ─── STRATEGY 4: EQUAL-QUANTITY (cluster-based, zero intra-run waste) ──

interface DemandEntry {
  item_id: string;
  remaining: number;
  needs_rotation: boolean;
}

/**
 * Equal-Quantity clustering strategy.
 *
 * 1. Build a demand pool for every item.
 * 2. Identify natural quantity levels from the demand pool.
 * 3. For each level (descending), create runs where ALL slots share the same
 *    quantity_in_slot.  Items are split across levels as needed.
 * 4. Blank slots (qty 0) are allowed when fewer items than slots at a level.
 */
function createEqualQuantityRuns(
  items: LabelItem[],
  config: SlotConfig,
  maxOverrun: number = DEFAULT_MAX_OVERRUN
): ProposedRun[] {
  if (items.length === 0) return [];

  // 1. Build demand pool
  const demand: DemandEntry[] = items.map(i => ({
    item_id: i.id,
    remaining: i.quantity,
    needs_rotation: i.needs_rotation || false,
  }));

  // 2. Collect all unique quantity values as candidate levels
  const allQtys = items.map(i => i.quantity);
  const uniqueLevels = [...new Set(allQtys)].sort((a, b) => b - a); // descending

  const runs: ProposedRun[] = [];
  let runNumber = 1;

  // 3. Process each level
  for (const level of uniqueLevels) {
    if (level <= 0) continue;

    // Keep creating runs at this level while there are items that can contribute
    while (true) {
      // Find items with remaining >= level
      const eligible = demand.filter(d => d.remaining >= level);
      if (eligible.length === 0) break;

      // Take up to totalSlots items
      const batch = eligible.slice(0, config.totalSlots);

      const assignments: SlotAssignment[] = [];
      for (let s = 0; s < config.totalSlots; s++) {
        if (s < batch.length) {
          assignments.push({
            slot: s,
            item_id: batch[s].item_id,
            quantity_in_slot: level,
            needs_rotation: batch[s].needs_rotation,
          });
          // Deduct from demand
          batch[s].remaining -= level;
        } else {
          // Blank slot — duplicate an item from this batch with qty 0
          assignments.push({
            slot: s,
            item_id: batch[s % batch.length].item_id,
            quantity_in_slot: 0,
            needs_rotation: batch[s % batch.length].needs_rotation,
          });
        }
      }

      const frames = calculateFramesForSlot(level, config);
      runs.push({
        run_number: runNumber++,
        slot_assignments: assignments,
        meters: calculateMeters(frames, config),
        frames,
      });
    }
  }

  // 4. Handle any leftover remainders (quantities that didn't align to a level)
  const leftovers = demand.filter(d => d.remaining > 0);
  if (leftovers.length > 0) {
    // Group leftovers into runs, bumping to the max remainder in each batch
    while (leftovers.some(d => d.remaining > 0)) {
      const active = leftovers.filter(d => d.remaining > 0);
      if (active.length === 0) break;

      const batch = active.slice(0, config.totalSlots);
      const batchLevel = Math.max(...batch.map(d => d.remaining));

      const assignments: SlotAssignment[] = [];
      for (let s = 0; s < config.totalSlots; s++) {
        if (s < batch.length) {
          assignments.push({
            slot: s,
            item_id: batch[s].item_id,
            quantity_in_slot: batchLevel,
            needs_rotation: batch[s].needs_rotation,
          });
          batch[s].remaining = 0; // fully consumed (may bump up)
        } else {
          assignments.push({
            slot: s,
            item_id: batch[s % batch.length].item_id,
            quantity_in_slot: 0,
            needs_rotation: batch[s % batch.length].needs_rotation,
          });
        }
      }

      const frames = calculateFramesForSlot(batchLevel, config);
      runs.push({
        run_number: runNumber++,
        slot_assignments: assignments,
        meters: calculateMeters(frames, config),
        frames,
      });
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
  reasoning: string,
  qtyPerRoll?: number
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
  // Labor efficiency: fewer changeovers = better, penalize rewinding
  let laborEfficiency = 1 / (1 + runs.length * 0.15);
  
  if (qtyPerRoll && qtyPerRoll > 0) {
    const rewindingRuns = runs.filter(r => r.needs_rewinding);
    if (rewindingRuns.length > 0) {
      // Penalize proportionally to how many runs need manual rewinding
      const rewindPenalty = (rewindingRuns.length / runs.length) * 0.4;
      laborEfficiency = Math.max(0, laborEfficiency - rewindPenalty);
    }
  }
  
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
/**
 * Annotate runs with roll-awareness metadata and flag short rolls
 */
function annotateRunsWithRollInfo(
  runs: ProposedRun[],
  config: SlotConfig,
  qtyPerRoll?: number,
  maxOverrun: number = DEFAULT_MAX_OVERRUN
): ProposedRun[] {
  return runs.map(run => {
    // The ACTUAL output per slot = frames * labelsPerSlotPerFrame
    // In a ganged run, ALL slots print for the same number of frames
    const actualLabelsPerSlot = run.frames * config.labelsPerSlotPerFrame;
    
    if (!qtyPerRoll || qtyPerRoll <= 0) {
      return { ...run, actual_labels_per_slot: actualLabelsPerSlot };
    }
    
    // Only flag as short if genuinely under by more than tolerance
    const needsRewinding = actualLabelsPerSlot < (qtyPerRoll - ROLL_TOLERANCE);
    
    // Per-slot overrun warning
    const slotOverrunWarnings: string[] = [];
    for (const assignment of run.slot_assignments) {
      const overrun = actualLabelsPerSlot - assignment.quantity_in_slot;
      if (overrun > maxOverrun) {
        const overrunPercent = assignment.quantity_in_slot > 0 ? Math.round((overrun / assignment.quantity_in_slot) * 100) : 0;
        slotOverrunWarnings.push(
          `S${assignment.slot + 1}: +${overrun.toLocaleString()} overrun (${overrunPercent}%)`
        );
      }
    }
    
    return {
      ...run,
      actual_labels_per_slot: actualLabelsPerSlot,
      labels_per_output_roll: actualLabelsPerSlot,
      needs_rewinding: needsRewinding,
      consolidation_suggestion: slotOverrunWarnings.length > 0 
        ? `High overrun: ${slotOverrunWarnings.join(', ')}`
        : run.consolidation_suggestion,
    };
  });
}

/**
 * Create a "Roll-Optimized" layout by consolidating short runs into longer ones
 */
function createRollOptimizedRuns(
  baseRuns: ProposedRun[],
  items: LabelItem[],
  config: SlotConfig,
  qtyPerRoll: number
): { runs: ProposedRun[]; reasoning: string } | null {
  // Identify short runs (where any slot < qtyPerRoll)
  const shortRuns: ProposedRun[] = [];
  const longRuns: ProposedRun[] = [];
  
  for (const run of baseRuns) {
    // Use actual output (frames-based) for comparison, with tolerance
    const actualPerSlot = run.frames * config.labelsPerSlotPerFrame;
    if (actualPerSlot < (qtyPerRoll - ROLL_TOLERANCE)) {
      shortRuns.push(run);
    } else {
      longRuns.push(run);
    }
  }
  
  if (shortRuns.length === 0) return null; // Nothing to consolidate
  
  // Try to absorb short runs into long runs
  const consolidatedLongRuns = longRuns.map(r => ({
    ...r,
    slot_assignments: r.slot_assignments.map(a => ({ ...a })),
  }));
  const unconsolidated: ProposedRun[] = [];
  const consolidationNotes: string[] = [];
  
  for (const shortRun of shortRuns) {
    let absorbed = false;
    
    // Check each short run's items — can they be found in a long run?
    const shortItemIds = new Set(shortRun.slot_assignments.map(a => a.item_id));
    
    for (const longRun of consolidatedLongRuns) {
      const longItemIds = new Set(longRun.slot_assignments.map(a => a.item_id));
      
      // All short run items must exist in the long run
      const allItemsPresent = [...shortItemIds].every(id => longItemIds.has(id));
      if (!allItemsPresent) continue;
      
      // Absorb: add short run quantities to matching slots in the long run
      for (const shortSlot of shortRun.slot_assignments) {
        const matchingSlot = longRun.slot_assignments.find(a => a.item_id === shortSlot.item_id);
        if (matchingSlot) {
          matchingSlot.quantity_in_slot += shortSlot.quantity_in_slot;
        }
      }
      
      // Recalculate run metrics
      const maxSlotQty = Math.max(...longRun.slot_assignments.map(a => a.quantity_in_slot));
      longRun.frames = calculateFramesForSlot(maxSlotQty, config);
      longRun.meters = calculateMeters(longRun.frames, config);
      
      const totalShortLabels = shortRun.slot_assignments.reduce((s, a) => s + a.quantity_in_slot, 0);
      consolidationNotes.push(
        `Absorbed Run ${shortRun.run_number} (${totalShortLabels.toLocaleString()} labels) into Run ${longRun.run_number} — eliminates ${shortRun.slot_assignments.length} short rolls`
      );
      absorbed = true;
      break;
    }
    
    if (!absorbed) {
      // Can't absorb — keep it but add a suggestion
      const totalLabels = shortRun.slot_assignments.reduce((s, a) => s + a.quantity_in_slot, 0);
      unconsolidated.push({
        ...shortRun,
        consolidation_suggestion: `Cannot auto-consolidate (${totalLabels.toLocaleString()} labels) — items not in other runs. Manual rewind required.`,
      });
    }
  }
  
  const finalRuns = [...consolidatedLongRuns, ...unconsolidated]
    .map((r, i) => ({ ...r, run_number: i + 1 }));
  
  if (consolidationNotes.length === 0) return null;
  
  const reasoning = `Roll-optimized: ${consolidationNotes.join('. ')}. ` +
    (unconsolidated.length > 0 
      ? `${unconsolidated.length} run(s) could not be consolidated.`
      : 'All short rolls eliminated.');
  
  return { runs: finalRuns, reasoning };
}

export function generateLayoutOptions(input: LayoutInput): LayoutOption[] {
  const { items, dieline, weights = DEFAULT_OPTIMIZATION_WEIGHTS, qtyPerRoll, maxOverrun = DEFAULT_MAX_OVERRUN } = input;
  const config = getSlotConfig(dieline);
  const partialOptions: Omit<LayoutOption, 'overall_score'>[] = [];
  
  if (items.length === 0) return [];
  
  // Theoretical minimum (perfect efficiency baseline)
  const totalLabelsNeeded = items.reduce((sum, i) => sum + i.quantity, 0);
  const theoreticalMinFrames = Math.ceil(totalLabelsNeeded / config.labelsPerFrame);
  const theoreticalMinMeters = calculateMeters(theoreticalMinFrames, config);
  
  // Option 1: Ganged — all items ganged (balanced, may produce multiple runs)
  if (items.length <= config.totalSlots) {
    let gangedRuns = createGangedRuns(items, config, maxOverrun);
    gangedRuns = annotateRunsWithRollInfo(gangedRuns, config, qtyPerRoll, maxOverrun);
    partialOptions.push(createLayoutOption(
      'ganged-all',
      gangedRuns,
      config,
      theoreticalMinMeters,
      gangedRuns.length === 1
        ? 'All items ganged in a single balanced run — all slots filled'
        : `All items ganged, split into ${gangedRuns.length} balanced runs to minimize waste`,
      qtyPerRoll
    ));
  }
  
  // Option 2: Individual — one dedicated run per item (all slots filled with same item)
  let individualRuns = items.map((item, idx) => 
    createSingleItemRun(item, idx + 1, config)
  );
  individualRuns = annotateRunsWithRollInfo(individualRuns, config, qtyPerRoll, maxOverrun);
  partialOptions.push(createLayoutOption(
    'individual',
    individualRuns,
    config,
    theoreticalMinMeters,
    'Each item on its own run — all slots filled, maximum flexibility for quantity control',
    qtyPerRoll
  ));
  
  // Option 3: Optimized — balanced ganging with quantity splitting across runs
  if (items.length > 1) {
    let optimizedRuns = createOptimizedRuns(items, config, maxOverrun);
    optimizedRuns = annotateRunsWithRollInfo(optimizedRuns, config, qtyPerRoll, maxOverrun);
    if (optimizedRuns.length > 0) {
      partialOptions.push(createLayoutOption(
        'optimized',
        optimizedRuns,
        config,
        theoreticalMinMeters,
        'Balanced approach — items ganged where possible, quantities split across runs to minimize waste',
        qtyPerRoll
      ));
    }
    
    // Option 4: Roll-Optimized — consolidate short runs (only when qtyPerRoll is set)
    if (qtyPerRoll && qtyPerRoll > 0) {
      const rollOptResult = createRollOptimizedRuns(optimizedRuns, items, config, qtyPerRoll);
      if (rollOptResult) {
        const rollOptRuns = annotateRunsWithRollInfo(rollOptResult.runs, config, qtyPerRoll, maxOverrun);
        partialOptions.push(createLayoutOption(
          'roll-optimized',
          rollOptRuns,
          config,
          theoreticalMinMeters,
          rollOptResult.reasoning,
          qtyPerRoll
        ));
      }
    }
  }
  
  // Option 5: Equal-Quantity — all slots in each run share the same quantity
  if (items.length > 1) {
    let equalQtyRuns = createEqualQuantityRuns(items, config, maxOverrun);
    equalQtyRuns = annotateRunsWithRollInfo(equalQtyRuns, config, qtyPerRoll, maxOverrun);
    if (equalQtyRuns.length > 0) {
      partialOptions.push(createLayoutOption(
        'equal-qty',
        equalQtyRuns,
        config,
        theoreticalMinMeters,
        'Equal-quantity strategy — all slots in each run print the same quantity, eliminating intra-run waste',
        qtyPerRoll
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
