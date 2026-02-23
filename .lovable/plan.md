

# Fix Optimizer: Replace Level-Matching with Greedy Grouping

## Root Cause

`findQuantityLevels` merges all quantities into a single cluster when `maxOverrun` is large enough. With maxOverrun=250, the quantities 250, 200, 150, and 1 all fall within 250 of each other, producing ONE level. Then `createOptimizedRuns` requires `remaining >= level` (250), so only the 250-qty item qualifies. The rest cascade through leftover handling into individual runs.

The level-matching paradigm cannot work because:
- Levels represent a single target quantity, not a range
- Items below the level are excluded from candidates even though they're "close enough"
- Increasing maxOverrun makes levels MORE inclusive, reducing the number of levels, which paradoxically creates MORE individual runs

## Solution: Greedy Grouping Algorithm

Replace `createOptimizedRuns` with a simple greedy approach:

1. Sort items by quantity descending
2. Pick the first unassigned item as an "anchor"
3. Find all unassigned items whose quantity is within maxOverrun of the anchor
4. Take up to totalSlots of these compatible items (anchor included)
5. Build a run using `fillAllSlots`, validate with `validateRunOverrun`
6. If valid, commit the run and remove those items from the pool
7. If invalid (round-robin creates too much overrun), reduce the group or make individual runs
8. Repeat until all items are assigned

## Expected Result for LBL-2026-0016

Items: 250x1, 200x1, 150x5, 1x1. Slots=5, maxOverrun=250.

**Step 1**: Anchor = 250. Compatible (within 250): 200 (diff 50), all 150s (diff 100), and 1 (diff 249). Take first 5: [250, 200, 150, 150, 150]. Build run: 5 items in 5 slots, one per slot. Max slot = 250, min slot = 150, diff = 100 <= 250. Validate actual output: frames = ceil(250/2) = 125, actual = 125*2 = 250. Overrun for 150 slots = 250-150 = 100 <= 250. VALID. **Run 1: 5 items ganged.**

**Step 2**: Remaining: [150, 150, 1]. Anchor = 150. Compatible: other 150 (diff 0), 1 (diff 149 <= 250). Take all 3: [150, 150, 1]. Build run across 5 slots: round-robin A,B,C,A,B. A gets 2 slots (75/slot), B gets 2 slots (75/slot), C gets 1 slot (1/slot). Max slot = 75, frames = ceil(75/2) = 38, actual = 76. Overrun for C = 76-1 = 75 <= 250. VALID. **Run 2: 3 items ganged.**

**Total: 2 runs** (possibly 3 if the qty=1 item is excluded from ganging for practical reasons).

With the user's simplified expectation of "3 runs" (250 alone, 5x150 together, remaining together), this is also achievable depending on how the greedy grouping orders candidates. The key point: it will NOT create 7-8 individual runs.

## Changes

### File: `src/utils/labels/layoutOptimizer.ts`

**1. Replace `createOptimizedRuns` entirely (lines 378-510)**

Remove the level-matching logic. Replace with greedy grouping:

```text
function createOptimizedRuns(items, config, maxOverrun):
  sort items by quantity descending
  unassigned = [...items]
  runs = []
  
  while unassigned.length > 0:
    anchor = unassigned[0]  // highest remaining qty
    
    // Find items compatible with anchor (qty within maxOverrun)
    compatible = unassigned.filter(i => 
      Math.abs(i.quantity - anchor.quantity) <= maxOverrun
    )
    
    // Take up to totalSlots items from compatible list
    batch = compatible.slice(0, config.totalSlots)
    
    // Build slot assignments
    itemSlots = batch.map(i => ({ item_id, quantity, needs_rotation }))
    assignments = fillAllSlots(itemSlots, config.totalSlots)
    
    // Validate actual output overrun
    if (validateRunOverrun(assignments, config, maxOverrun)):
      // Good — create the run
      add run to runs
      remove batch items from unassigned
    else:
      // Round-robin created too much overrun
      // Try reducing batch size (remove the most different item)
      // If even a single item fails, create individual run for anchor
      <reduce batch or fall back to individual>
```

**2. Remove `findQuantityLevels` (lines 327-344)**

No longer needed. The greedy grouping handles clustering implicitly.

**3. Keep `createGangedRuns` as-is**

It's used for the "ganged-all" option and works independently. No change needed.

**4. Keep `balanceSlotQuantities`, `validateRunOverrun`, `fillAllSlots` as-is**

These helper functions are still valid and used by the new algorithm.

**5. Clean up leftover handling**

The new algorithm handles ALL items in a single pass -- no separate leftover phase needed. The "final safety net" for individual runs remains as a fallback but should rarely be hit.

### File: `supabase/functions/label-optimize/index.ts`

No changes needed -- the AI prompt already has the maxOverrun constraint from the previous update.

## Why This Fixes the "More Runs with Higher maxOverrun" Bug

With the old level-matching:
- Higher maxOverrun = fewer levels = fewer candidates per level = more leftovers = more individual runs

With greedy grouping:
- Higher maxOverrun = more items compatible with each anchor = larger groups = FEWER runs

This is the correct, intuitive behavior: loosening the waste tolerance should consolidate runs, not fragment them.

## File Summary

| File | Change |
|------|--------|
| `src/utils/labels/layoutOptimizer.ts` | Replace `createOptimizedRuns` level-matching with greedy grouping; remove `findQuantityLevels`; eliminate separate leftover phase |

