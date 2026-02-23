

# Fix Layout Optimizer: Overrun-Aware Clustering and Actual Output Validation

## Root Cause

Three bugs work together to produce excessive overruns:

1. **`findQuantityLevels` ignores `maxOverrun`** -- it clusters quantities within a 10% ratio. With large numbers, 10% can be hundreds of labels (e.g., 10% of 4000 = 400), far exceeding the user's slider setting of 150.

2. **Overrun check compares slot-to-slot, not actual-output-to-requested** -- the check `maxSlotQty - minSlotQty > maxOverrun` only catches when SLOTS differ. It misses the case where ALL slots have the same requested qty but actual output (frames x labels-per-frame) exceeds the request. For example, 2 items round-robined across 5 slots creates 3+2 slot distribution -- even with identical quantities, the uneven distribution means the 3-slot item gets ceil(3300/3)=1100/slot while the 2-slot item gets ceil(3300/2)=1650/slot. The run prints at 1650 frames, so the 1100-slots get 550 overrun.

3. **No check on whether items divide evenly into slots** -- ganging 2 items across 5 slots always creates waste because 5 is not divisible by 2. The optimizer should prefer ganging combinations where items divide evenly (or nearly evenly) into the slot count.

## Solution

### 1. Use `maxOverrun` in `findQuantityLevels`

**File: `src/utils/labels/layoutOptimizer.ts`** (lines 297-314)

Change the function signature to accept `maxOverrun` and replace the ratio check:

```
// BEFORE: Math.max(l, qty) / Math.min(l, qty) <= 1.10
// AFTER:  Math.abs(l - qty) <= maxOverrun
```

Pass `maxOverrun` from `createOptimizedRuns` and leftover handling.

### 2. Add actual-output validation after every run

**File: `src/utils/labels/layoutOptimizer.ts`**

Add a `validateRunOverrun` helper that:
1. Calculates `actualPerSlot = frames * config.labelsPerSlotPerFrame`
2. For each slot, checks if `actualPerSlot - slot.quantity_in_slot > maxOverrun`
3. Returns false if ANY slot exceeds the cap

Call this after every run creation in `createOptimizedRuns` (lines 364-371). If validation fails, fall back to `balanceSlotQuantities` to split the run. This catches the round-robin imbalance problem.

### 3. Fix ganged strategy to handle more items than slots

**File: `src/utils/labels/layoutOptimizer.ts`** (lines 241-253)

Currently `items.slice(0, config.totalSlots)` silently drops items when there are more items than slots. Fix: sort items by quantity similarity, then create multiple ganged runs of up to `totalSlots` items each, grouped by closest quantities.

### 4. Update AI edge function prompt with maxOverrun constraint

**File: `supabase/functions/label-optimize/index.ts`**

Accept `maxOverrun` in the request body and add it to the system prompt:

```
OVERRUN CONSTRAINT:
- Maximum acceptable overrun per slot: ${maxOverrun} labels
- Never suggest ganging items whose quantities differ by more than ${maxOverrun}
- If items cannot be ganged within this limit, suggest separate runs
```

Also accept `maxOverrun` in the `constraints` interface so the frontend can pass the slider value to the AI.

## Expected Outcome

With items Black=5000, BLUE=4300, GREEN=4000, BROWN=3300, YELLOW=3300, PEACH=2300 and maxOverrun=150:

`findQuantityLevels(maxOverrun=150)` produces:
- Level 5000 (only Black -- 4300 is 700 away)
- Level 4300 (only BLUE -- 4000 is 300 away)
- Level 4000 (only GREEN)
- Level 3300 (BROWN + YELLOW -- identical)
- Level 2300 (only PEACH)

For each level, `createOptimizedRuns` assigns items to slots and validates actual output. For BROWN+YELLOW at level 3300:
- `fillAllSlots` gives B,Y,B,Y,B (1100 and 1650 per slot)
- `validateRunOverrun`: actual = frames for 1650 = ~1650/slot, BROWN slots want 1100, overrun = 550 > 150 -- FAILS
- Falls back to `balanceSlotQuantities` which caps at 1100 and creates remainder runs
- OR better: since both have identical qty (3300), put each on its own individual run filling all 5 slots with 660/slot -- zero overrun

The validator ensures no layout ever exceeds the user's maxOverrun slider, regardless of how items distribute across slots.

## Technical Details

### New function: `validateRunOverrun`

```text
function validateRunOverrun(
  assignments: SlotAssignment[],
  config: SlotConfig,
  maxOverrun: number
): boolean {
  const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
  const frames = calculateFramesForSlot(maxSlotQty, config);
  const actualPerSlot = frames * config.labelsPerSlotPerFrame;

  for (const a of assignments) {
    if (actualPerSlot - a.quantity_in_slot > maxOverrun) {
      return false; // This slot has too much waste
    }
  }
  return true;
}
```

### Updated `findQuantityLevels` signature

```text
function findQuantityLevels(quantities: number[], maxOverrun: number): number[]
```

### Updated `createOptimizedRuns` flow (lines 352-372)

After building assignments for a run:
1. First check slot-to-slot: `maxSlotQty - minSlotQty > maxOverrun` (existing)
2. Then check actual output: `validateRunOverrun(assignments, config, maxOverrun)` (new)
3. If either fails, split via `balanceSlotQuantities`

### Edge function changes

Add `maxOverrun` to the `OptimizeRequest.constraints` interface and include it in the system prompt so AI text suggestions respect the same limit the optimizer uses.

## File Summary

| File | Change |
|------|--------|
| `src/utils/labels/layoutOptimizer.ts` | Add `validateRunOverrun`; change `findQuantityLevels` to use absolute `maxOverrun`; validate actual output after every run; fix ganged strategy for > totalSlots items |
| `supabase/functions/label-optimize/index.ts` | Accept `maxOverrun` in constraints; add overrun limit to AI system prompt |

