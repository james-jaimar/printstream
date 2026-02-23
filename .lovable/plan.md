

# Fix Roll Splitting, Adjuster Visibility, and Tooltip Clarity

## 4 Issues to Fix

### 1. Roll Splitting Creates Tiny Remainder Rolls (8 labels)

**Problem**: When actual output is 1,008 and qty_per_roll is 500, the `RollSplitSelector` creates 3 rolls: 500 + 500 + 8. An 8-label roll is absurd -- we said up to 50 labels at the end of a roll can be ignored.

**Fix in `RollSplitSelector.tsx`**: When calculating the "fill first" splits, if the final roll has <= `ROLL_TOLERANCE` (50) labels, merge it into the previous roll instead of creating a separate roll. So 1,008 becomes 500 + 508 (2 rolls), not 500 + 500 + 8 (3 rolls). Similarly for "even split", recalculate based on the corrected roll count.

### 2. Roll Splitting "+5 more" Instead of Responsive Display

**Problem**: When there are 9 rolls, the UI shows 4 badges then "+5 more" which hides critical info. The user wants ALL roll info visible, just laid out responsively.

**Fix in `RollSplitSelector.tsx`**: Remove the MAX_BADGES cap entirely. Instead, show all badges using `flex-wrap` so they flow naturally. The compact label formatting ("8 x 500 + 5") already summarises the strategy name -- the badges should show all rolls. On smaller screens the badges will simply wrap to new lines.

### 3. Run 4 Has No "Bump to 500" Option

**Problem**: Run 4 shows 468/slot (need 500) but the `RunQuantityAdjuster` does not appear. Root cause: `showAdjuster` requires `needsRewinding`, which is `actualPerSlot < (qtyPerRoll - 50) = 450`. Since 468 > 450, `needsRewinding` is false, so the adjuster is hidden.

The adjuster should show whenever the actual output is BELOW `qtyPerRoll` (even within tolerance), because the user may still want to bump it. The tolerance only controls warnings and automated flags -- manual adjustment should always be available.

**Fix in `RunLayoutDiagram.tsx`**: Change `showAdjuster` condition from `needsRewinding` to `effectiveActualPerSlot < qtyPerRoll`. This way 468 < 500 shows the adjuster, but 504 >= 500 does not (since 504 is fine).

### 4. Tooltip Shows Slot Qty Instead of Client's Original Order Qty

**Problem**: When hovering over a slot, the tooltip says "Requested: 1,000" which is `quantity_in_slot` -- what the optimizer assigned to that slot. But the user needs to see the CLIENT's original order quantity (e.g., 5,000 total) to understand context. Without it, they can't tell what the client actually ordered.

**Fix in `RunLayoutDiagram.tsx`**: Change the tooltip to show:
- Line 1: Item name
- Line 2: "Client order: 5,000" (from `item.quantity`)
- Line 3: "This slot: 1,000" (from `assignment.quantity_in_slot`)
- Line 4: "Actual output: 1,008 (+8 overrun)" (from `effectiveActualPerSlot`)

This gives complete context: what the client ordered, what the optimizer proposed for this slot, and what will actually print.

## Technical Details

### File: `src/components/labels/optimizer/RollSplitSelector.tsx`

**Tiny remainder fix**: In the `splitOptions` `useMemo`, after building `fillFirstRolls`, check if the last roll has <= 50 labels. If so, add those labels to the second-to-last roll and remove the last roll. Recalculate `rollCount` for even split similarly.

**Remove badge cap**: Remove the `MAX_BADGES` constant and the `.slice(0, MAX_BADGES)` logic. Render all badges with `flex-wrap` (already present).

### File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`

**Adjuster condition** (line ~118):
```
// Before: showAdjuster = showControls && needsRewinding && ...
// After:  showAdjuster = showControls && effectiveActualPerSlot < qtyPerRoll && ...
```

**Tooltip** (lines ~293-315): Restructure to show `item.quantity` as "Client order" and `assignment.quantity_in_slot` as "This slot".

## Summary

| File | Change |
|------|--------|
| `src/components/labels/optimizer/RollSplitSelector.tsx` | Merge tiny remainders (<=50) into previous roll; remove badge cap; show all badges responsively |
| `src/components/labels/optimizer/RunLayoutDiagram.tsx` | Show adjuster when actual < qtyPerRoll (not just needsRewinding); restructure tooltip to show client order qty |

