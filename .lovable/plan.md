

# Smart Quantity Splitting to Match Run Levels

## Problem
The current optimizer groups items with similar quantities and splits when imbalanced, but it doesn't proactively split an item's quantity to fit into existing run levels. For example, if you have items at 2000, 2000, 500, 500, and one item at 2500 -- the optimizer should split 2500 into 2000 + 500 and slot each part into the matching runs, rather than creating a separate imbalanced run.

## Approach
Rework the `createOptimizedRuns` function in `src/utils/labels/layoutOptimizer.ts` to use a **"find target levels, then split to match"** strategy:

1. **Identify natural quantity levels** -- Collect all item quantities, find clusters (e.g., multiple items near 2000, multiple near 500).
2. **Split items to match levels** -- If an item's quantity is larger than a level, split it: assign a portion equal to the level, and keep the remainder for the next level.
3. **Build runs per level** -- Each level becomes one or more runs where all slots have matching quantities, minimizing waste.

## Technical Details

### File: `src/utils/labels/layoutOptimizer.ts`

Replace the `createOptimizedRuns` function (lines ~240-301) with the new level-matching algorithm:

```text
createOptimizedRuns(items, config):
  // 1. Collect all unique quantities as candidate levels
  quantities = items.map(i => i.quantity).sort(descending)
  levels = deduplicate and cluster quantities within 10%

  // 2. Build a remaining-qty map
  remaining = Map(item.id -> item.quantity)

  // 3. For each level (highest first):
  for level in levels:
    // Collect items that have >= level remaining
    candidates = items where remaining[id] >= level
    
    // Group candidates into runs (up to totalSlots per run)
    while candidates.length > 0:
      batch = take up to totalSlots candidates
      assign each batch item with quantity = level
      fill empty slots round-robin
      create run
      deduct level from each candidate's remaining
      
  // 4. Handle any leftover remainders as individual runs
  for items with remaining > 0:
    create single-item run for the remainder
```

This ensures that a 2500-qty item naturally splits: 2000 goes into the "2000 level" run alongside other 2000-qty items, and the remaining 500 goes into the "500 level" run alongside other 500-qty items.

The existing `balanceSlotQuantities` function still acts as a safety net -- if somehow a run ends up with slots that differ by more than 10%, it will split further. But with level-matching, runs should already be balanced by construction.

No changes needed to the UI or diagram components -- this is purely an algorithm improvement in the optimizer.

