
# Fix: RunLayoutDiagram to Show Full Roll Usage for Single-Item Runs

## Problem Analysis

Looking at your screenshot and the code, I can see the issue clearly:

**Current behavior (incorrect):**
- Run 1 shows: `[S1 filled] [2 empty] [3 empty]`
- Run 2 shows: `[S1 filled] [2 empty] [3 empty]`
- Run 3 shows: `[S1 filled] [2 empty] [3 empty]`

**Expected behavior (correct):**
- Run 1 shows: `[Label 1] [Label 1] [Label 1]` (all blue - 3 columns all printing label 1)
- Run 2 shows: `[Label 2] [Label 2] [Label 2]` (all green - 3 columns all printing label 2)  
- Run 3 shows: `[Label 3] [Label 3] [Label 3]` (all amber - 3 columns all printing label 3)

The root cause: When running a single item, **ALL slots print that item** - you're using the full roll width. The current diagram treats `slot: 0` literally as "only column 0 is used".

---

## Solution: Smart Slot Filling Logic

Update `RunLayoutDiagram.tsx` to detect single-item runs and fill all slots with that item.

### Key Logic Change

```text
// Detect if this is a single-item run (one item uses all slots)
const isSingleItemRun = slotAssignments.length === 1;
const singleItem = isSingleItemRun ? slotAssignments[0] : null;

// When rendering each cell:
if (isSingleItemRun) {
  // All slots show the same item
  assignment = singleItem;
  item = items.find(i => i.id === singleItem.item_id);
} else {
  // Multi-item run: use the actual slot mapping
  assignment = slotMap.get(slotNumber);
  item = assignment ? items.find(i => i.id === assignment.item_id) : null;
}
```

---

## File Changes

### File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`

1. **Add single-item run detection** after the slot map creation
2. **Modify cell rendering logic** to fill all columns when it's a single-item run
3. **Update legend** to show the single item correctly
4. **Update slot label** to show item name instead of just "S1"

### Visual Result

After the fix:

**Run 1 (Label A - 5000 qty):**
```text
+----------+----------+----------+
|  Label A |  Label A |  Label A |
+----------+----------+----------+
|  Label A |  Label A |  Label A |
+----------+----------+----------+
|  Label A |  Label A |  Label A |
+----------+----------+----------+
```

**Run 2 (Label B - 3000 qty):**
```text
+----------+----------+----------+
|  Label B |  Label B |  Label B |
+----------+----------+----------+
|  Label B |  Label B |  Label B |
+----------+----------+----------+
```

**Run 3 (Label C - 1000 qty):**
```text
+----------+----------+----------+
|  Label C |  Label C |  Label C |
+----------+----------+----------+
```

---

## Technical Details

The fix involves updating the cell rendering section (lines 159-203) to:

1. Check if `slotAssignments.length === 1` (single-item run)
2. If single-item: apply the same item's color to ALL cells in the grid
3. Show the item name/number in the first row instead of slot numbers
4. Keep the legend accurate for both single and multi-item runs

No changes needed to the optimizer logic - the diagram interpretation is what needs fixing.
