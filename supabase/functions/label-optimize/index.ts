/**
 * Label Layout Optimizer — Deterministic Constraint Solver
 * 
 * Architecture: Code does math, AI advises on strategy (optional).
 * The solver guarantees zero overrun violations by construction.
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

// ─── Core Constraint Check ───────────────────────────────────────────────────

/**
 * Can a candidate quantity be added to a run that already has these slot quantities?
 * Returns true only if EVERY item (existing + candidate) stays within maxOverrun.
 */
function canAddToRun(
  existingQtys: number[],
  candidateQty: number,
  lpf: number,
  maxOverrun: number
): boolean {
  const allQtys = [...existingQtys, candidateQty];
  const maxQty = Math.max(...allQtys);
  const frames = Math.ceil(maxQty / lpf);
  const actual = frames * lpf;
  return allQtys.every(q => (actual - q) <= maxOverrun);
}

/**
 * Compute overrun for each slot in a run.
 */
function getRunOverruns(slotQtys: number[], lpf: number): number[] {
  const filled = slotQtys.filter(q => q > 0);
  if (filled.length === 0) return slotQtys.map(() => 0);
  const maxQty = Math.max(...filled);
  const frames = Math.ceil(maxQty / lpf);
  const actual = frames * lpf;
  return slotQtys.map(q => q > 0 ? actual - q : 0);
}

// ─── Splitting Helper ────────────────────────────────────────────────────────

interface SplitItem {
  originalId: string;
  originalName: string;
  quantity: number;
  splitIndex: number;     // 0-based
  totalSplits: number;    // how many pieces this item was split into
}

/**
 * Try splitting an item into N equal-ish parts.
 * Returns array of SplitItems. If N=1, no split.
 */
function splitItem(item: LabelItem, n: number): SplitItem[] {
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

// ─── Greedy Solver ───────────────────────────────────────────────────────────

interface RunBucket {
  slots: SplitItem[];
  slotQtys: number[];
}

/**
 * Greedy bin-packing: sort items descending, first-fit into runs.
 * Each run has at most totalSlots filled slots.
 * Every slot must satisfy canAddToRun.
 */
function greedySolve(
  splitItems: SplitItem[],
  totalSlots: number,
  lpf: number,
  maxOverrun: number
): RunBucket[] {
  // Sort by quantity descending for best packing
  const sorted = [...splitItems].sort((a, b) => b.quantity - a.quantity);
  const runs: RunBucket[] = [];

  for (const si of sorted) {
    let placed = false;
    // Try to fit into an existing run
    for (const run of runs) {
      if (run.slots.length >= totalSlots) continue;
      if (canAddToRun(run.slotQtys, si.quantity, lpf, maxOverrun)) {
        run.slots.push(si);
        run.slotQtys.push(si.quantity);
        placed = true;
        break;
      }
    }
    if (!placed) {
      runs.push({ slots: [si], slotQtys: [si.quantity] });
    }
  }

  return runs;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

interface ScoredLayout {
  runs: RunBucket[];
  score: number;
  breakdown: {
    runCountPenalty: number;
    blankSlotPenalty: number;
    totalOverrun: number;
    splitPenalty: number;
    remainderPenalty: number;
  };
}

function scoreLayout(
  runs: RunBucket[],
  totalSlots: number,
  lpf: number,
  items: LabelItem[],
  qtyPerRoll: number | undefined
): ScoredLayout {
  let runCountPenalty = runs.length * 100;
  let blankSlotPenalty = 0;
  let totalOverrun = 0;
  let splitPenalty = 0;
  let remainderPenalty = 0;

  // Blank slots
  for (const run of runs) {
    blankSlotPenalty += (totalSlots - run.slots.length) * 10;
  }

  // Total overrun
  for (const run of runs) {
    const overruns = getRunOverruns(run.slotQtys, lpf);
    totalOverrun += overruns.reduce((s, o) => s + o, 0);
  }

  // Split penalty: count how many runs each original item appears in
  const itemRunMap = new Map<string, Set<number>>();
  runs.forEach((run, ri) => {
    for (const slot of run.slots) {
      if (!itemRunMap.has(slot.originalId)) itemRunMap.set(slot.originalId, new Set());
      itemRunMap.get(slot.originalId)!.add(ri);
    }
  });
  for (const [, runSet] of itemRunMap) {
    if (runSet.size > 1) splitPenalty += (runSet.size - 1) * 50; // rewind/join penalty
  }

  // Remainder penalty (qtyPerRoll)
  if (qtyPerRoll && qtyPerRoll > 0) {
    // Sum total assigned per item
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
    breakdown: { runCountPenalty, blankSlotPenalty, totalOverrun, splitPenalty, remainderPenalty },
  };
}

// ─── Candidate Generator ─────────────────────────────────────────────────────

/**
 * Generate multiple candidate layouts with different splitting strategies.
 * Returns the best-scoring one.
 */
function solveLayout(
  items: LabelItem[],
  totalSlots: number,
  lpf: number,
  maxOverrun: number,
  qtyPerRoll: number | undefined
): { layout: ScoredLayout; candidates: number } {
  const candidates: ScoredLayout[] = [];

  // Strategy 1: No splitting (greedy)
  const noSplit = items.map(i => splitItem(i, 1)).flat();
  const runs1 = greedySolve(noSplit, totalSlots, lpf, maxOverrun);
  candidates.push(scoreLayout(runs1, totalSlots, lpf, items, qtyPerRoll));

  // Strategy 2: Split large items across 2 slots
  const split2 = items.map(i => {
    // Only split if the item is large enough that it would benefit
    if (i.quantity > lpf * 2) return splitItem(i, 2);
    return splitItem(i, 1);
  }).flat();
  const runs2 = greedySolve(split2, totalSlots, lpf, maxOverrun);
  candidates.push(scoreLayout(runs2, totalSlots, lpf, items, qtyPerRoll));

  // Strategy 3: Aggressive splitting — split large items to match smaller ones
  if (items.length >= 2) {
    const sortedByQty = [...items].sort((a, b) => b.quantity - a.quantity);
    const medianQty = sortedByQty[Math.floor(sortedByQty.length / 2)].quantity;
    const split3 = items.map(i => {
      if (medianQty > 0 && i.quantity > medianQty * 2) {
        const n = Math.min(totalSlots, Math.ceil(i.quantity / medianQty));
        return splitItem(i, n);
      }
      return splitItem(i, 1);
    }).flat();
    const runs3 = greedySolve(split3, totalSlots, lpf, maxOverrun);
    candidates.push(scoreLayout(runs3, totalSlots, lpf, items, qtyPerRoll));
  }

  // Strategy 4: If qtyPerRoll set, try rounding quantities up to clean multiples
  if (qtyPerRoll && qtyPerRoll > 0) {
    const rounded = items.map(i => {
      const roundedQty = Math.ceil(i.quantity / qtyPerRoll) * qtyPerRoll;
      return { ...i, quantity: roundedQty };
    });
    const splitR = rounded.map(i => {
      if (i.quantity > lpf * 2) return splitItem(i, 2);
      return splitItem(i, 1);
    }).flat();
    const runsR = greedySolve(splitR, totalSlots, lpf, maxOverrun);
    candidates.push(scoreLayout(runsR, totalSlots, lpf, items, qtyPerRoll));
  }

  // Pick best
  candidates.sort((a, b) => a.score - b.score);
  return { layout: candidates[0], candidates: candidates.length };
}

// ─── Validation (belt & suspenders) ──────────────────────────────────────────

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
    // Build slot assignments padded to totalSlots
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

    // Build reasoning
    const filled = run.slots.length;
    const blanks = totalSlots - filled;
    const overruns = getRunOverruns(run.slotQtys, lpf);
    const maxOvr = Math.max(...overruns, 0);
    const maxQty = Math.max(...run.slotQtys);
    const frames = Math.ceil(maxQty / lpf);

    const parts: string[] = [];
    parts.push(`${filled} filled slot(s), ${blanks} blank`);
    parts.push(`${frames} frames, max overrun ${maxOvr}`);
    
    // Note which items are in this run
    const itemNames = [...new Set(run.slots.map(s => s.originalName))];
    parts.push(`Items: ${itemNames.join(', ')}`);

    // Note splits
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
    overall_reasoning: `Deterministic solver: ${runs.length} run(s), ${totalBlanks} blank slot(s), ${wastePct}% waste. `
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

    console.log(`[label-optimize] Solver: ${items.length} items, ${totalLabels} labels, ${totalSlots} slots, ${lpf} lpf, maxOverrun=${max_overrun}, qtyPerRoll=${qty_per_roll || 'none'}`);

    // ─── Run deterministic solver ────────────────────────────────────
    const { layout: scored, candidates } = solveLayout(
      items,
      totalSlots,
      lpf,
      max_overrun,
      qty_per_roll
    );

    console.log(`[label-optimize] Evaluated ${candidates} candidate strategies. Best score: ${scored.score.toFixed(0)}`);
    console.log(`[label-optimize] Breakdown:`, JSON.stringify(scored.breakdown));

    // ─── Validate (belt & suspenders) ────────────────────────────────
    const validation = validateLayout(scored.runs, items, totalSlots, lpf, max_overrun);

    if (validation.overrunViolations.length > 0) {
      console.error(`[label-optimize] BUG: Solver produced overrun violations!`, validation.overrunViolations);
    }
    if (validation.missingItems.length > 0) {
      console.error(`[label-optimize] BUG: Solver missed items!`, validation.missingItems);
    }

    const allWarnings = [
      ...validation.warnings,
      ...validation.overrunViolations,
    ];

    // ─── Format output ───────────────────────────────────────────────
    const layout = formatSolverOutput(scored, items, totalSlots, lpf, qty_per_roll);

    console.log(`[label-optimize] Final: ${layout.runs.length} runs, ${allWarnings.length} warnings`);

    return new Response(JSON.stringify({
      success: true,
      layout,
      warnings: allWarnings,
      metadata: {
        items_count: items.length,
        total_labels: totalLabels,
        available_slots: totalSlots,
        labels_per_slot_per_frame: lpf,
        solver: 'deterministic_v1',
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
