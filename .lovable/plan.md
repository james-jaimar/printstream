

# Hybrid Solver: Code Does Math, AI Does Strategy

## The Problem

The AI consistently fails to produce overrun-compliant layouts. This is not a prompt issue — LLMs are sequence predictors, not constraint solvers. Under multi-step integer arithmetic with hard limits, they drift. The expert advice confirms: **algorithm first, AI second**.

## Architecture

```text
BEFORE:  Items → AI (does all math + strategy) → validate → retry → hope
AFTER:   Items → Deterministic Solver (guarantees valid runs) → AI Advisor (optional, finishing preferences) → validate (belt & suspenders)
```

## The Solver Algorithm

All in `supabase/functions/label-optimize/index.ts`. No new files.

### Core function: `canAddToRun(runSlotQtys[], candidateQty, lpf, maxOverrun) → boolean`

```typescript
function canAddToRun(existingQtys: number[], candidateQty: number, lpf: number, maxOverrun: number): boolean {
  const allQtys = [...existingQtys, candidateQty];
  const maxQty = Math.max(...allQtys);
  const frames = Math.ceil(maxQty / lpf);
  const actual = frames * lpf;
  return allQtys.every(q => (actual - q) <= maxOverrun);
}
```

This checks ALL items in the run against the frame output — not just pairwise.

### Main solver: `solveLayout(items, totalSlots, lpf, maxOverrun, qtyPerRoll?) → runs[]`

1. Sort items by quantity descending
2. For each item, try to fit into an existing run (first-fit):
   - Run must have fewer than `totalSlots` filled slots
   - `canAddToRun()` must return true for ALL existing items in that run
3. If no run fits, create a new run
4. For large items that would benefit, split across multiple slots within a run (e.g., 5000 across 2 slots = 2500+2500) to allow other items to share the run
5. Pad each run to exactly `totalSlots` with blank slots (item_id="", quantity_in_slot=0)
6. If `qtyPerRoll` is set, round slot quantities up to clean multiples where it doesn't violate overrun

### Splitting logic

Before the greedy assignment, check if an item's quantity is so large that it would prevent ANY other item from sharing its run. If so, split it across multiple slots within one run (e.g., 5300 across 3 slots ≈ 1767 each), which lowers the "max qty" in that run and opens space for smaller items.

### Scoring layer (deterministic, not AI)

When multiple valid groupings exist, score them by:
- **Rewind penalty**: items split across many runs = bad
- **Remainder penalty**: if `qtyPerRoll` set, how far is each SKU total from a clean multiple
- **Run count**: fewer is better (but secondary to finishing quality)
- **Blank slot count**: fewer is better (but secondary)
- **Total overrun**: lower is better

Generate 2-3 candidate groupings (e.g., greedy-descending, greedy with aggressive splitting, greedy with qtyPerRoll rounding) and pick the best-scoring one.

### AI advisor (optional, only if `qtyPerRoll` is set)

After the solver produces a valid layout, optionally ask the AI a simple strategic question:
> "Here are 2 valid layouts. Layout A has 3 runs, 2 blank slots, all SKUs on clean 1000-roll multiples. Layout B has 2 runs, 0 blank slots, but SKU X produces 1,340 labels (not a clean roll multiple). Which is better for finishing?"

The AI never touches slot assignments or quantities. It just picks between valid options or suggests rounding.

## What Changes

### `supabase/functions/label-optimize/index.ts` — Major rewrite

- **Add**: `canAddToRun()`, `solveLayout()`, `scoreLayout()` functions (~100 lines)
- **Replace**: The main handler flow — solver is the primary path, AI call becomes optional advisor
- **Keep**: `validateLayout()` as final safety check, `calcLabelsPerSlotPerFrame()`, `buildTools()` (repurposed for AI advisor), CORS, error handling
- **Remove**: The 100-line `buildSystemPrompt()` (replaced with a short advisory prompt), the retry loop (unnecessary — solver is correct by construction)

### No other files change

- `useLayoutOptimizer.ts` — already maps AI response to `LayoutOption`. The solver returns the same shape, so the hook works as-is.
- `layoutOptimizer.ts` — math utilities unchanged
- `types/labels.ts` — types unchanged
- UI components — unchanged

## Example: The Failing Case

Items: A=5300, B=2000, C=1400, D=700, E=300. 4 slots, 18 lpf, max overrun 250.

**Solver with splitting:**
1. A=5300 → split across 4 slots in Run 1: 1325 each. frames=ceil(1325/18)=74, actual=1332. Overrun per slot = 7. Valid.
2. B=2000 → can add to Run 1? max would be 2000, actual=ceil(2000/18)*18=2016. Check 1325 slots: 2016-1325=691 > 250. NO.
3. B=2000 → Run 2, slot 1. 
4. C=1400 → can add to Run 2? max=2000, actual=2016. 2016-1400=616 > 250. NO.
5. C=1400 → Run 3, slot 1.
6. D=700 → Run 2? 2016-700=1316. NO. Run 3? ceil(1400/18)*18=1404. 1404-700=704. NO. Run 4.
7. E=300 → Run 3? 1404-300=1104. NO. Run 4? ceil(700/18)*18=702. 702-300=402. NO. Run 5.

Result: 5 runs. All valid. Zero violations. Guaranteed.

**Could be optimized further:** Split B=2000 across 2 slots (1000+1000) in a run, then C=1400 might fit (ceil(1400/18)*18=1404, 1404-1000=404 > 250, still no). Or split C=1400 into 2×700, then D=700 fits with it (ceil(700/18)*18=702, 702-700=2). That saves a run.

The scoring layer handles this exploration automatically.

