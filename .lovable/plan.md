

# Improve Layout Optimizer: Equal-Quantity Slot Balancing Strategy

## The Core Insight

Your manual approach uses a fundamentally different strategy than what the AI and local algorithms currently do:

| Aspect | Current Approach | Your Approach |
|--------|-----------------|---------------|
| Item splitting | Each item in ONE run | Items SPLIT freely across runs |
| Slot quantities | Vary within a run | ALL EQUAL within a run |
| Overrun source | Intra-run (smaller slots print extra) | Inter-item (round up to nearest "run quantity") |
| Waste profile | High overrun on mismatched slots | Small quantity bumps on some items |

Your method finds natural "quantity levels" (700, 1000, 150, 2650, 800) and assigns exactly 4 items (or item-portions) to each level. Since all slots print the same quantity, there is zero intra-run waste.

## Changes Required

### 1. Update AI Prompt (Edge Function)

**File:** `supabase/functions/label-optimize/index.ts`

Add a new strategic instruction block to the system prompt that explicitly teaches the "equal-quantity clustering" strategy:

- **Primary goal**: All slots in a run should have the SAME `quantity_in_slot`
- **Method**: Find natural quantity clusters; split large items across multiple runs to fill slots at each level
- **Blanks OK**: A slot can have `quantity_in_slot = 0` if it creates a better overall plan (fewer total labels printed)
- **Acceptable bumps**: Small upward adjustments (e.g., 150 to 300) are fine if they allow 4 items to share a run
- Add a worked example matching the spreadsheet logic so the AI has a concrete reference

The key new prompt sections:

```text
STRATEGY — EQUAL-QUANTITY RUNS (CRITICAL):
Your primary goal is to create runs where ALL slots print the SAME quantity.
This eliminates intra-run overrun entirely.

HOW TO ACHIEVE THIS:
1. List all item quantities and find natural clusters (e.g., four items near 700)
2. For each cluster, pick a common "run quantity" — usually the lowest in the group
3. If an item's quantity exceeds the run quantity, split the remainder into other runs
4. Large items may appear in multiple runs (e.g., 6300 = 2650 + 2650 + 1000)
5. Small items may be bumped up slightly (e.g., 150 → 300) if it fills a run cleanly
6. A blank slot (quantity = 0) is acceptable if no item benefits from the extra copies

EXAMPLE with 14 items (4 slots available):
Items: 700, 2000, 150, 300, 300, 6300, 5300, 800, 1000, 1000, 1400, 700, 700, 700, 800
Optimal runs:
- Run 1: 4 slots × 700 (items at exactly 700)
- Run 2: 4 slots × 1000 (items near 1000, split from larger items)
- Run 3: 4 slots × 150 (small items, bumped up if needed)
- Run 4: 4 slots × 2650 (large items split down)
- Run 5: 4 slots × 800 (remaining quantities)
```

### 2. Add Local "Equal-Quantity" Strategy (Fallback Algorithm)

**File:** `src/utils/labels/layoutOptimizer.ts`

Add a new strategy function `createEqualQuantityRuns` that implements this clustering approach locally as a fallback when the AI is unavailable:

**Algorithm outline:**

1. Create a "demand pool" — a list of `{ item_id, remaining_quantity }` for each item
2. Sort all unique quantities to identify natural cluster points
3. For each cluster level (descending):
   - Pick items from the demand pool that have remaining quantity >= cluster level
   - Take up to `totalSlots` items, assign each `cluster_level` quantity
   - Subtract from their remaining quantities
4. Handle remainders by creating additional runs or bumping small quantities up
5. Allow blank slots (quantity = 0) when fewer items than slots remain

Register this as a new layout option (e.g., `'equal-qty'`) in `generateLayoutOptions`, alongside the existing ganged/individual/optimized options.

### 3. Wire Up the New Option

**File:** `src/utils/labels/layoutOptimizer.ts` (within `generateLayoutOptions`)

Add the equal-quantity strategy as Option 5, scored and sorted alongside existing options. It should typically score highest on material efficiency since it produces zero intra-run waste.

## File Summary

| File | Change |
|------|--------|
| `supabase/functions/label-optimize/index.ts` | Rewrite AI prompt to teach equal-quantity clustering strategy with worked example |
| `src/utils/labels/layoutOptimizer.ts` | Add `createEqualQuantityRuns` strategy function and register as new layout option |

## Technical Notes

- The equal-quantity strategy may produce slightly more total labels than ordered (bumping small items up), but eliminates the much larger waste from intra-run overruns
- The AI prompt change is the higher-impact fix since the AI handles the complex multi-variable optimization better than a greedy local algorithm
- Blank slots are represented as `quantity_in_slot: 0` with a duplicated `item_id` (artwork present but effectively unused)
