

# Fix: Eliminate Blank Slots (Fill Every Run)

## The Problem

The current greedy solver creates runs with 1-2 filled slots and 2-3 blanks because items with different quantities can't share a run under the overrun constraint. In reality, you'd never run the press with 3 blank slots — you'd split items to fill every slot, even if it means more runs.

From the screenshot: Run 3 has 1 filled + 3 blank, Run 6 has 3 filled + 1 blank, Run 7 has 3 filled + 1 blank. The real-world approach: blank slots only on the very last run, if at all.

## The Fix

Replace the greedy solver with a **"fill-first" algorithm** that splits items as needed to fill every slot in every run (except possibly the last).

### Algorithm

```text
1. Calculate how many total slot-portions we need:
   - Start with 1 portion per item
   - If items can't share a run, split the larger one
   
2. "Compatible range" math:
   - For a target qty T: actual = ceil(T/lpf) * lpf
   - Any qty Q can share if actual - Q <= maxOverrun
   - So min compatible = actual - maxOverrun
   
3. Strategy:
   a. Sort items by qty descending
   b. For each unfilled run, pick the largest unassigned portion
   c. Compute its compatible range
   d. Fill remaining slots by splitting other items into 
      portions that land within that range
   e. If no item can be split to fit, allow a blank (last run only)
```

### Example (from the screenshot data)

With 4 slots, lpf=18, maxOverrun=250:
- Items at ~1.0k each: split to fill 4 slots per run → all slots filled, minimal overrun
- Items at ~700 each: 4 fit per run (ceil(704/18)*18=702, 702-700=2 overrun) → perfect
- Items at ~300 each: 3 fit in last run with 1 blank → acceptable

### Key change: blank slot penalty becomes massive

Current scoring: `blankSlotPenalty = blanks * 10` (trivial).
New scoring: blank slots on non-last runs get a penalty of **1000** (effectively forbidden). Last-run blanks stay at 10.

## File Changes

### `supabase/functions/label-optimize/index.ts`

1. **New function: `solveFullSlots()`** — the fill-first algorithm that:
   - Iterates items sorted by quantity
   - For each run being built, computes the compatible range from the first (largest) item placed
   - Splits remaining items to create portions that fit within that range
   - Only allows blanks when there genuinely aren't enough item portions left (last run)

2. **Update `scoreLayout()`** — heavily penalize blank slots on non-last runs (1000 per blank vs 10 on last run)

3. **Add `solveFullSlots` as a candidate strategy** alongside existing strategies in `solveLayout()` — the scoring will naturally prefer it

4. **Keep existing strategies** as fallbacks — if the full-slots approach somehow scores worse (unlikely), the system picks the best option

No other files change. The output shape is identical — the hook and UI work as-is.

