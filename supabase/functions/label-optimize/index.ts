/**
 * Label Layout Optimizer — Band-Based Constrained Optimization Solver (v2)
 * 
 * Architecture: Pure deterministic math. No AI for arithmetic.
 * 
 * Core insight: A run's frame count defines a "band" of valid slot quantities.
 * Items are split into portions that fit bands, then bands fill runs completely.
 * Blank slots only appear on the last run of the entire plan.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface LabelItem {
  id: string;
  name: string;
  quantity: number;
}

interface Dieline {
  columns_across: number;
  rows_around: number;
  label_width_mm: number;
  label_height_mm: number;
  roll_width_mm: number;
  vertical_gap_mm?: number;
  bleed_top_mm?: number;
  bleed_bottom_mm?: number;
}

interface SlotAssignment {
  item_id: string;
  quantity_in_slot: number;
}

interface SolverRun {
  slot_assignments: SlotAssignment[];
  reasoning: string;
}

interface SolverLayout {
  runs: SolverRun[];
  overall_reasoning: string;
  estimated_waste_percent: number;
  trade_offs?: {
    blank_slots_available?: number;
    blank_slot_note?: string;
    roll_size_note?: string;
    overrun_warnings?: string[];
  };
}

interface SplitItem {
  originalId: string;
  originalName: string;
  quantity: number;
  splitIndex: number;
  totalSplits: number;
}

interface RunBucket {
  slots: SplitItem[];
  slotQtys: number[];
}

interface Band {
  frames: number;
  actual: number;  // frames * lpf
  min: number;     // actual - maxOverrun
  max: number;     // actual
}

interface ScoredLayout {
  runs: RunBucket[];
  score: number;
  strategyName: string;
  breakdown: {
    runCountPenalty: number;
    blankSlotPenalty: number;
    totalOverrun: number;
    splitPenalty: number;
    remainderPenalty: number;
  };
}

// ─── Physics ─────────────────────────────────────────────────────────────────

function calcLabelsPerSlotPerFrame(dieline: Dieline): number {
  const MAX_FRAME_LENGTH_MM = 960;
  const bleedVertical = (dieline.bleed_top_mm || 0) + (dieline.bleed_bottom_mm || 0);
  const templateHeightMm = dieline.label_height_mm * dieline.rows_around +
    (dieline.vertical_gap_mm || 0) * (dieline.rows_around - 1) +
    bleedVertical;
  const templatesPerFrame = Math.max(1, Math.floor(MAX_FRAME_LENGTH_MM / templateHeightMm));
  return dieline.rows_around * templatesPerFrame;
}

// ─── Band Math ───────────────────────────────────────────────────────────────

/**
 * Compute the band for a given quantity.
 * Band = [actual - maxOverrun, actual] where actual = ceil(qty/lpf) * lpf
 */
function computeBand(qty: number, lpf: number, maxOverrun: number): Band {
  if (qty <= 0) return { frames: 0, actual: 0, min: 0, max: 0 };
  const frames = Math.ceil(qty / lpf);
  const actual = frames * lpf;
  return {
    frames,
    actual,
    min: Math.max(1, actual - maxOverrun),
    max: actual,
  };
}

/**
 * Check if a quantity fits within a band.
 */
function fitsInBand(qty: number, band: Band): boolean {
  return qty >= band.min && qty <= band.max;
}

/**
 * Check if two quantities are band-compatible (can share a run).
 */
function areBandCompatible(q1: number, q2: number, lpf: number, maxOverrun: number): boolean {
  const maxQ = Math.max(q1, q2);
  const band = computeBand(maxQ, lpf, maxOverrun);
  return fitsInBand(Math.min(q1, q2), band);
}

/**
 * Get overrun for each slot quantity given the run's actual output.
 */
function getRunOverruns(slotQtys: number[], lpf: number): number[] {
  const filled = slotQtys.filter(q => q > 0);
  if (filled.length === 0) return slotQtys.map(() => 0);
  const maxQty = Math.max(...filled);
  const frames = Math.ceil(maxQty / lpf);
  const actual = frames * lpf;
  return slotQtys.map(q => q > 0 ? actual - q : 0);
}

// ─── Splitting ───────────────────────────────────────────────────────────────

/**
 * Split an item's quantity into N roughly equal portions.
 */
function splitItemInto(item: LabelItem, n: number): SplitItem[] {
  if (n <= 1) {
    return [{ originalId: item.id, originalName: item.name, quantity: item.quantity, splitIndex: 0, totalSplits: 1 }];
  }
  const base = Math.floor(item.quantity / n);
  const remainder = item.quantity % n;
  const parts: SplitItem[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({
      originalId: item.id,
      originalName: item.name,
      quantity: base + (i < remainder ? 1 : 0),
      splitIndex: i,
      totalSplits: n,
    });
  }
  return parts;
}

/**
 * Split an item into portions that each fit a target band.
 * Returns portions sized to land within [band.min, band.max].
 */
function splitItemToBand(item: LabelItem, targetBand: Band): SplitItem[] {
  if (item.quantity <= 0) return [];
  
  // If item already fits the band, no split needed
  if (fitsInBand(item.quantity, targetBand)) {
    return [{ originalId: item.id, originalName: item.name, quantity: item.quantity, splitIndex: 0, totalSplits: 1 }];
  }
  
  // How many portions of size ~targetBand.max do we need?
  const portionSize = targetBand.max; // aim for max of band
  const n = Math.ceil(item.quantity / portionSize);
  return splitItemInto(item, n);
}

// ─── Band-Based Solver ──────────────────────────────────────────────────────

/**
 * Given a list of portions, group them into bands and build runs.
 * Each run has exactly totalSlots slots (padded with blanks if needed on last run).
 */
function buildRunsFromPortions(
  portions: SplitItem[],
  totalSlots: number,
  lpf: number,
  maxOverrun: number
): RunBucket[] {
  if (portions.length === 0) return [];

  // Sort portions descending by quantity
  const sorted = [...portions].sort((a, b) => b.quantity - a.quantity);

  // Group into bands: portions that can share a run
  // Use a greedy approach: for each portion, find an existing band group it fits,
  // or create a new band group.
  interface BandGroup {
    band: Band;
    portions: SplitItem[];
  }

  const bandGroups: BandGroup[] = [];

  for (const portion of sorted) {
    let placed = false;

    for (const group of bandGroups) {
      // Check if this portion fits the group's band
      if (fitsInBand(portion.quantity, group.band)) {
        group.portions.push(portion);
        placed = true;
        break;
      }

      // Check if adding this portion would create a valid expanded band
      const allQtys = [...group.portions.map(p => p.quantity), portion.quantity];
      const maxQ = Math.max(...allQtys);
      const newBand = computeBand(maxQ, lpf, maxOverrun);
      if (allQtys.every(q => fitsInBand(q, newBand))) {
        group.band = newBand;
        group.portions.push(portion);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const band = computeBand(portion.quantity, lpf, maxOverrun);
      bandGroups.push({ band, portions: [portion] });
    }
  }

  // Now build runs from band groups
  const runs: RunBucket[] = [];

  for (const group of bandGroups) {
    // Each band group produces ceil(portions / totalSlots) runs
    const groupPortions = [...group.portions]; // don't mutate original
    while (groupPortions.length > 0) {
      const runSlots = groupPortions.splice(0, totalSlots);
      runs.push({
        slots: runSlots,
        slotQtys: runSlots.map(s => s.quantity),
      });
    }
  }

  return runs;
}

// ─── Candidate Strategies ────────────────────────────────────────────────────

/**
 * Strategy 1: No splitting — each item as one portion.
 */
function strategyNoSplit(items: LabelItem[]): SplitItem[] {
  return items.map(i => ({
    originalId: i.id, originalName: i.name, quantity: i.quantity, splitIndex: 0, totalSplits: 1
  }));
}

/**
 * Strategy 2: Split largest item into totalSlots portions.
 */
function strategySplitLargest(items: LabelItem[], totalSlots: number): SplitItem[] {
  const sorted = [...items].sort((a, b) => b.quantity - a.quantity);
  const portions: SplitItem[] = [];
  // Split the largest into totalSlots pieces
  portions.push(...splitItemInto(sorted[0], totalSlots));
  // Rest as-is
  for (let i = 1; i < sorted.length; i++) {
    portions.push(...splitItemInto(sorted[i], 1));
  }
  return portions;
}

/**
 * Strategy 3: Split all items toward the median quantity.
 */
function strategySplitToMedian(items: LabelItem[], totalSlots: number, lpf: number, maxOverrun: number): SplitItem[] {
  if (items.length < 2) return strategyNoSplit(items);
  
  const sorted = [...items].sort((a, b) => b.quantity - a.quantity);
  const medianQty = sorted[Math.floor(sorted.length / 2)].quantity;
  if (medianQty <= 0) return strategyNoSplit(items);

  const targetBand = computeBand(medianQty, lpf, maxOverrun);
  const portions: SplitItem[] = [];

  for (const item of items) {
    if (item.quantity > targetBand.max) {
      // Split to fit target band
      const n = Math.ceil(item.quantity / targetBand.max);
      portions.push(...splitItemInto(item, n));
    } else {
      portions.push(...splitItemInto(item, 1));
    }
  }
  return portions;
}

/**
 * Strategy 4: Split items to match their nearest neighbor's band.
 * For each item from largest to smallest, if it doesn't share a band
 * with the next item, try splitting to create compatibility.
 */
function strategySplitToNeighbors(items: LabelItem[], lpf: number, maxOverrun: number): SplitItem[] {
  if (items.length < 2) return strategyNoSplit(items);

  const sorted = [...items].sort((a, b) => b.quantity - a.quantity);
  const portions: SplitItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    // Find the next smaller item
    const nextItem = sorted[i + 1];
    
    if (!nextItem) {
      // Last item, no neighbor to match
      portions.push(...splitItemInto(item, 1));
      continue;
    }

    // Check if they're already compatible
    if (areBandCompatible(item.quantity, nextItem.quantity, lpf, maxOverrun)) {
      portions.push(...splitItemInto(item, 1));
      continue;
    }

    // Try splitting this item so pieces land near nextItem's band
    const nextBand = computeBand(nextItem.quantity, lpf, maxOverrun);
    if (nextBand.max > 0) {
      const n = Math.ceil(item.quantity / nextBand.max);
      if (n > 1 && n <= 8) { // reasonable split count
        const splits = splitItemInto(item, n);
        // Verify splits actually fit the target band
        if (splits.every(s => fitsInBand(s.quantity, nextBand))) {
          portions.push(...splits);
          continue;
        }
      }
    }

    // Can't match neighbor, keep as-is
    portions.push(...splitItemInto(item, 1));
  }
  return portions;
}

/**
 * Strategy 5: Split every item into exactly totalSlots portions.
 * This guarantees each item fills one complete run.
 */
function strategySplitAll(items: LabelItem[], totalSlots: number): SplitItem[] {
  const portions: SplitItem[] = [];
  for (const item of items) {
    if (item.quantity > 0) {
      portions.push(...splitItemInto(item, totalSlots));
    }
  }
  return portions;
}

/**
 * Strategy 6: Split large items into 2 portions (conservative).
 */
function strategySplit2(items: LabelItem[], lpf: number): SplitItem[] {
  const portions: SplitItem[] = [];
  for (const item of items) {
    if (item.quantity > lpf * 2) {
      portions.push(...splitItemInto(item, 2));
    } else {
      portions.push(...splitItemInto(item, 1));
    }
  }
  return portions;
}

/**
 * Strategy 7: Band-merge — try to split items so maximum number of portions
 * share the same band, creating fully-filled runs.
 */
function strategyBandMerge(items: LabelItem[], totalSlots: number, lpf: number, maxOverrun: number): SplitItem[] {
  if (items.length < 2) return strategyNoSplit(items);

  const sorted = [...items].sort((a, b) => b.quantity - a.quantity);
  const portions: SplitItem[] = [];

  // Find the most common "achievable" band by trying each item's band
  // and seeing how many others could be split to fit it
  let bestBand: Band | null = null;
  let bestFitCount = 0;

  for (const item of sorted) {
    const band = computeBand(item.quantity, lpf, maxOverrun);
    let fitCount = 0;
    for (const other of sorted) {
      if (fitsInBand(other.quantity, band)) {
        fitCount++;
      } else if (other.quantity > band.max) {
        // Could split to fit
        const n = Math.ceil(other.quantity / band.max);
        const portionSize = Math.floor(other.quantity / n);
        if (fitsInBand(portionSize, band)) fitCount++;
      }
    }
    if (fitCount > bestFitCount) {
      bestFitCount = fitCount;
      bestBand = band;
    }
  }

  if (!bestBand) return strategyNoSplit(items);

  // Split items to fit the best band
  for (const item of sorted) {
    if (fitsInBand(item.quantity, bestBand)) {
      portions.push(...splitItemInto(item, 1));
    } else if (item.quantity > bestBand.max) {
      const n = Math.ceil(item.quantity / bestBand.max);
      portions.push(...splitItemInto(item, n));
    } else {
      // Too small for the band — keep as-is, will go in separate band
      portions.push(...splitItemInto(item, 1));
    }
  }
  return portions;
}

// ─── Apply qtyPerRoll rounding ───────────────────────────────────────────────

function roundItemsToRoll(items: LabelItem[], qtyPerRoll: number): LabelItem[] {
  return items.map(i => ({
    ...i,
    quantity: Math.ceil(i.quantity / qtyPerRoll) * qtyPerRoll,
  }));
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreLayout(
  runs: RunBucket[],
  totalSlots: number,
  lpf: number,
  items: LabelItem[],
  qtyPerRoll: number | undefined,
  strategyName: string
): ScoredLayout {
  let runCountPenalty = runs.length * 100;
  let blankSlotPenalty = 0;
  let totalOverrun = 0;
  let splitPenalty = 0;
  let remainderPenalty = 0;

  // Blank slots — massive penalty on non-last runs
  for (let ri = 0; ri < runs.length; ri++) {
    const blanks = totalSlots - runs[ri].slots.length;
    if (ri < runs.length - 1) {
      blankSlotPenalty += blanks * 10000; // effectively forbidden
    } else {
      blankSlotPenalty += blanks * 10; // acceptable on last run
    }
  }

  // Total overrun
  for (const run of runs) {
    const overruns = getRunOverruns(run.slotQtys, lpf);
    totalOverrun += overruns.reduce((s, o) => s + o, 0);
  }

  // Split penalty: how many runs each original item appears in
  const itemRunMap = new Map<string, Set<number>>();
  runs.forEach((run, ri) => {
    for (const slot of run.slots) {
      if (!itemRunMap.has(slot.originalId)) itemRunMap.set(slot.originalId, new Set());
      itemRunMap.get(slot.originalId)!.add(ri);
    }
  });
  for (const [, runSet] of itemRunMap) {
    if (runSet.size > 1) splitPenalty += (runSet.size - 1) * 50;
  }

  // Remainder penalty (qtyPerRoll)
  if (qtyPerRoll && qtyPerRoll > 0) {
    const itemTotals = new Map<string, number>();
    for (const run of runs) {
      for (const slot of run.slots) {
        itemTotals.set(slot.originalId, (itemTotals.get(slot.originalId) || 0) + slot.quantity);
      }
    }
    for (const [, total] of itemTotals) {
      const rem = total % qtyPerRoll;
      if (rem > 0) {
        remainderPenalty += Math.min(rem, qtyPerRoll - rem) * 0.5;
      }
    }
  }

  const score = runCountPenalty + blankSlotPenalty + totalOverrun * 0.1 + splitPenalty + remainderPenalty;

  return {
    runs,
    score,
    strategyName,
    breakdown: { runCountPenalty, blankSlotPenalty, totalOverrun, splitPenalty, remainderPenalty },
  };
}

// ─── Main Solver ─────────────────────────────────────────────────────────────

function solveLayout(
  items: LabelItem[],
  totalSlots: number,
  lpf: number,
  maxOverrun: number,
  qtyPerRoll: number | undefined
): { layout: ScoredLayout; candidates: number } {
  const candidates: ScoredLayout[] = [];

  // Helper: generate portions → build runs → score
  const tryStrategy = (name: string, portions: SplitItem[], sourceItems: LabelItem[]) => {
    const runs = buildRunsFromPortions(portions, totalSlots, lpf, maxOverrun);
    if (runs.length > 0) {
      candidates.push(scoreLayout(runs, totalSlots, lpf, sourceItems, qtyPerRoll, name));
    }
  };

  // ─── Base strategies (original quantities) ───────────────────────
  tryStrategy("no-split", strategyNoSplit(items), items);
  tryStrategy("split-2", strategySplit2(items, lpf), items);
  tryStrategy("split-largest", strategySplitLargest(items, totalSlots), items);
  tryStrategy("split-median", strategySplitToMedian(items, totalSlots, lpf, maxOverrun), items);
  tryStrategy("split-neighbors", strategySplitToNeighbors(items, lpf, maxOverrun), items);
  tryStrategy("split-all", strategySplitAll(items, totalSlots), items);
  tryStrategy("band-merge", strategyBandMerge(items, totalSlots, lpf, maxOverrun), items);

  // ─── qtyPerRoll variants ─────────────────────────────────────────
  if (qtyPerRoll && qtyPerRoll > 0) {
    const rounded = roundItemsToRoll(items, qtyPerRoll);
    tryStrategy("rounded-no-split", strategyNoSplit(rounded), items);
    tryStrategy("rounded-split-2", strategySplit2(rounded, lpf), items);
    tryStrategy("rounded-split-largest", strategySplitLargest(rounded, totalSlots), items);
    tryStrategy("rounded-split-median", strategySplitToMedian(rounded, totalSlots, lpf, maxOverrun), items);
    tryStrategy("rounded-band-merge", strategyBandMerge(rounded, totalSlots, lpf, maxOverrun), items);
  }

  // Pick best
  candidates.sort((a, b) => a.score - b.score);

  const strategyLog = candidates.map(c => `${c.strategyName}=${c.score.toFixed(0)}`).join(', ');
  console.log(`[label-optimize] Strategy scores: ${strategyLog}`);

  return { layout: candidates[0], candidates: candidates.length };
}

// ─── Validation ──────────────────────────────────────────────────────────────

interface ValidationResult {
  warnings: string[];
  overrunViolations: string[];
  missingItems: string[];
}

function validateLayout(
  runs: RunBucket[],
  items: LabelItem[],
  totalSlots: number,
  lpf: number,
  maxOverrun: number
): ValidationResult {
  const warnings: string[] = [];
  const overrunViolations: string[] = [];
  const missingItems: string[] = [];

  // Check every item is assigned
  const itemTotals = new Map<string, number>();
  for (const run of runs) {
    for (const slot of run.slots) {
      itemTotals.set(slot.originalId, (itemTotals.get(slot.originalId) || 0) + slot.quantity);
    }
  }

  for (const item of items) {
    const assigned = itemTotals.get(item.id) || 0;
    if (assigned === 0) {
      missingItems.push(`MISSING: Item "${item.name}" (${item.id}) not assigned`);
    } else if (assigned < item.quantity) {
      warnings.push(`Item "${item.name}": assigned ${assigned} of ${item.quantity} (short by ${item.quantity - assigned})`);
    }
  }

  // Check overrun per slot
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const overruns = getRunOverruns(run.slotQtys, lpf);
    for (let j = 0; j < run.slots.length; j++) {
      if (overruns[j] > maxOverrun) {
        overrunViolations.push(
          `Run ${i + 1}, slot ${j + 1} ("${run.slots[j].originalName}"): qty ${run.slotQtys[j]}, overrun ${overruns[j]} > max ${maxOverrun}`
        );
      }
    }
  }

  return { warnings: [...warnings, ...missingItems], overrunViolations, missingItems };
}

// ─── Format Output ───────────────────────────────────────────────────────────

function formatSolverOutput(
  scored: ScoredLayout,
  items: LabelItem[],
  totalSlots: number,
  lpf: number,
  qtyPerRoll: number | undefined
): SolverLayout {
  const runs: SolverRun[] = scored.runs.map((run, ri) => {
    const slotAssignments: SlotAssignment[] = [];
    
    for (const slot of run.slots) {
      slotAssignments.push({
        item_id: slot.originalId,
        quantity_in_slot: slot.quantity,
      });
    }
    
    // Pad with blank slots
    while (slotAssignments.length < totalSlots) {
      slotAssignments.push({ item_id: "", quantity_in_slot: 0 });
    }

    const filled = run.slots.length;
    const blanks = totalSlots - filled;
    const overruns = getRunOverruns(run.slotQtys, lpf);
    const maxOvr = Math.max(...overruns, 0);
    const maxQty = Math.max(...run.slotQtys);
    const frames = Math.ceil(maxQty / lpf);

    const parts: string[] = [];
    parts.push(`${filled} filled slot(s), ${blanks} blank`);
    parts.push(`${frames} frames, max overrun ${maxOvr}`);
    
    const itemNames = [...new Set(run.slots.map(s => s.originalName))];
    parts.push(`Items: ${itemNames.join(', ')}`);

    const splits = run.slots.filter(s => s.totalSplits > 1);
    if (splits.length > 0) {
      parts.push(`Contains split portions`);
    }

    return {
      slot_assignments: slotAssignments,
      reasoning: parts.join('. '),
    };
  });

  // Calculate waste
  let totalActual = 0;
  let totalRequested = 0;
  for (const run of scored.runs) {
    const filled = run.slotQtys.filter(q => q > 0);
    if (filled.length === 0) continue;
    const maxQty = Math.max(...filled);
    const frames = Math.ceil(maxQty / lpf);
    const actual = frames * lpf;
    totalActual += actual * filled.length;
    totalRequested += run.slotQtys.reduce((s, q) => s + q, 0);
  }
  const wastePct = totalRequested > 0 ? Math.round(((totalActual - totalRequested) / totalActual) * 100 * 10) / 10 : 0;

  // Trade-offs
  const totalBlanks = scored.runs.reduce((s, r) => s + (totalSlots - r.slots.length), 0);
  const itemRunCounts = new Map<string, number>();
  scored.runs.forEach(run => {
    const ids = new Set(run.slots.map(s => s.originalId));
    for (const id of ids) {
      itemRunCounts.set(id, (itemRunCounts.get(id) || 0) + 1);
    }
  });
  const splitItems = [...itemRunCounts.entries()].filter(([, count]) => count > 1);

  const overrunWarnings: string[] = [];
  for (let ri = 0; ri < scored.runs.length; ri++) {
    const overruns = getRunOverruns(scored.runs[ri].slotQtys, lpf);
    for (let si = 0; si < overruns.length; si++) {
      if (overruns[si] > 0) {
        overrunWarnings.push(`Run ${ri + 1}, slot ${si + 1}: overrun ${overruns[si]}`);
      }
    }
  }

  const rollNote = qtyPerRoll
    ? `Target roll size: ${qtyPerRoll}. ${scored.breakdown.remainderPenalty > 0 ? 'Some items not on clean multiples.' : 'All items on clean multiples.'}`
    : 'No roll size preference set.';

  return {
    runs,
    overall_reasoning: `Band solver (${scored.strategyName}): ${runs.length} run(s), ${totalBlanks} blank slot(s), ${wastePct}% waste. `
      + `Score: ${scored.score.toFixed(0)} (runs=${scored.breakdown.runCountPenalty}, blanks=${scored.breakdown.blankSlotPenalty}, `
      + `overrun=${scored.breakdown.totalOverrun.toFixed(0)}, splits=${scored.breakdown.splitPenalty}, remainder=${scored.breakdown.remainderPenalty.toFixed(0)}). `
      + (splitItems.length > 0
        ? `${splitItems.length} item(s) split across multiple runs (may need rewind/join).`
        : 'No items split across runs.'),
    estimated_waste_percent: wastePct,
    trade_offs: {
      blank_slots_available: totalBlanks,
      blank_slot_note: totalBlanks > 0 ? `${totalBlanks} blank slot(s) used to maintain overrun compliance.` : 'All slots filled.',
      roll_size_note: rollNote,
      overrun_warnings: overrunWarnings,
    },
  };
}

// ─── HTTP Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items, dieline, max_overrun = 250, qty_per_roll } = await req.json();

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No items provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const totalSlots = dieline.columns_across;
    const lpf = calcLabelsPerSlotPerFrame(dieline);
    const totalLabels = items.reduce((sum: number, i: LabelItem) => sum + i.quantity, 0);

    console.log(`[label-optimize] Band Solver v2: ${items.length} items, ${totalLabels} labels, ${totalSlots} slots, ${lpf} lpf, maxOverrun=${max_overrun}, qtyPerRoll=${qty_per_roll || 'none'}`);

    const { layout: scored, candidates } = solveLayout(
      items, totalSlots, lpf, max_overrun, qty_per_roll
    );

    console.log(`[label-optimize] Evaluated ${candidates} strategies. Best: "${scored.strategyName}" score=${scored.score.toFixed(0)}`);
    console.log(`[label-optimize] Breakdown:`, JSON.stringify(scored.breakdown));

    const validation = validateLayout(scored.runs, items, totalSlots, lpf, max_overrun);

    if (validation.overrunViolations.length > 0) {
      console.error(`[label-optimize] BUG: Overrun violations!`, validation.overrunViolations);
    }
    if (validation.missingItems.length > 0) {
      console.error(`[label-optimize] BUG: Missing items!`, validation.missingItems);
    }

    const allWarnings = [...validation.warnings, ...validation.overrunViolations];

    const layout = formatSolverOutput(scored, items, totalSlots, lpf, qty_per_roll);

    console.log(`[label-optimize] Final: ${layout.runs.length} runs, ${allWarnings.length} warnings, strategy="${scored.strategyName}"`);

    return new Response(JSON.stringify({
      success: true,
      layout,
      warnings: allWarnings,
      metadata: {
        items_count: items.length,
        total_labels: totalLabels,
        available_slots: totalSlots,
        labels_per_slot_per_frame: lpf,
        solver: 'band_solver_v2',
        strategy_used: scored.strategyName,
        candidates_evaluated: candidates,
        score: scored.score,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("label-optimize error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Optimization failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
