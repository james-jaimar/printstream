
# Fixes: OrderSpecsPage — Remove Override Rolls, Fix Labels/Roll, Remove Roll Direction

## What the User Is Saying

Looking at the screenshots, the current "Specifications & Finishing" tab has four metric tiles in the ABG section:
- **Output Rolls** (correct — columns_across × runs)
- **Labels / Roll** (WRONG — dividing total labels by just columns_across, not accounting for runs)
- **Override Rolls** (wrong concept — you cannot override a physical metal die)
- **ABG Speed** (keep)

Plus in the Output & Delivery Specs card:
- **Roll Direction** select (redundant — determined by the orientation widget above it)

The user also notes the "first page" (the `NewLabelOrderDialog` creation flow shown in image-965) feels redundant now that the modal has a proper Specs tab. We'll note this but focus on the concrete fixes requested.

---

## Precise Changes in `OrderSpecsPage.tsx`

### 1. Fix Labels/Roll Calculation (lines 106–122)

The current code:
```ts
const runCount = order.runs?.length || 1;
const computedOutputRolls = columnsAcross * runCount;
const effectiveRolls = savedOutputRolls ?? computedOutputRolls;
const labelsPerRoll = effectiveRolls > 0 ? Math.round(totalLabels / effectiveRolls) : null;
```

The bug: `effectiveRolls` was being overridden by `savedOutputRolls` (now removed). The correct formula is always `columns_across × runs_count`. No override. So:

```ts
const columnsAcross = order.dieline?.columns_across ?? 1;
const runCount = order.runs?.length || 1;
const outputRolls = columnsAcross * runCount;
const labelsPerRoll = outputRolls > 0 ? Math.round(totalLabels / outputRolls) : null;
```

### 2. Remove "Override Rolls" tile (lines 417–431)

Delete the entire "Override Rolls" `<div>` block. This removes the ability to manually set `output_rolls_count` from the UI (the DB column stays for potential future use but we just don't expose it here).

### 3. Update the metrics grid (lines 373–454)

The grid was `grid-cols-2 sm:grid-cols-4` (4 tiles). After removing Override Rolls, it becomes 3 tiles:
- **Output Rolls** — correct value, formula shown as `N across × M runs`  
- **Labels / Roll** — now correctly computed; shows warning colours if short  
- **ABG Speed** — editable inline field

Change grid to `grid-cols-1 sm:grid-cols-3`.

### 4. Remove "Roll Direction" select from Delivery Specs (lines 540–561)

Delete the Roll Direction `<div>` block entirely. The 2-column grid in Delivery Specs will then just be:
- Core Size
- Qty per Roll
- Delivery Method (spans as needed)

The grid stays `grid-cols-2` but with only 3 fields instead of 4, so Delivery Method can span full-width or stay half-width.

### 5. Clean up unused imports

Remove `savedOutputRolls` logic, remove `RefreshCw` from imports (used only by override tile), remove `ChevronRight` if unused.

---

## Files Changed

| File | Lines | Change |
|------|-------|--------|
| `src/components/labels/order/OrderSpecsPage.tsx` | 106–122 | Fix outputRolls calc — always `columns_across × runCount` |
| `src/components/labels/order/OrderSpecsPage.tsx` | 373–454 | Remove Override Rolls tile; change grid to 3-col |
| `src/components/labels/order/OrderSpecsPage.tsx` | 540–561 | Remove Roll Direction select |
| `src/components/labels/order/OrderSpecsPage.tsx` | imports | Remove unused: `RefreshCw`, `ChevronRight` |

---

## What Stays Unchanged

- Output Rolls tile with `N across × M runs` formula label — this is correct
- Labels/Roll warning logic (danger < 100, warning < 300) — logic stays, only the input value is fixed  
- ABG Speed editable field — stays
- All of Print Specifications card (dieline, substrate, ink, orientation) — no changes
- Orientation picker and reset button — no changes
- Customer & Order card — no changes
- Notes card — no changes
- Delivery fields (Core Size, Qty per Roll, Delivery Method) — no changes

---

## Note on "First Page" / NewLabelOrderDialog

The user references wanting to "do away with the first page" of the creation flow. The `NewLabelOrderDialog` (image-965) is the order creation dialog — a separate component from the modal. For now these fixes are focused on the `OrderSpecsPage` within the modal. The creation dialog simplification can be addressed separately if the user wants to reduce it to just customer + dieline + substrate (with everything else editable in the modal afterwards).
