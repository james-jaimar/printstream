

## Fix: Page Dimensions and Dieline Preview Width

### Two Issues

**Issue 1: Edge function calculates wrong page height (300mm instead of 309mm)**

The edge function derives cell size from `bleed_left_mm`, `bleed_right_mm`, `bleed_top_mm`, `bleed_bottom_mm` fields, which can be null or zero depending on how the dieline was created. The correct approach (as you described) is to derive bleed from the gap values:

- `horizontal_gap_mm` (3mm) / 2 = 1.5mm bleed left + 1.5mm bleed right
- `vertical_gap_mm` (3mm) / 2 = 1.5mm bleed top + 1.5mm bleed bottom

This way, the cell size is always `label_width + gap` and `label_height + gap`, regardless of whether separate bleed fields are populated.

**Issue 2: Dieline form shows "Total width: 289mm" instead of 292mm**

The formula is `columns * label_width + (columns - 1) * gap`, which treats gaps as *between* labels only. The correct formula is `(label_width + gap) * columns`, because each label carries its own bleed (half the gap) on each side, so every label cell is `label + gap` wide, and cells butt together.

### Changes

**File: `supabase/functions/label-impose/index.ts` (lines 161-168)**

Replace the bleed-based calculation with gap-based:

```typescript
// Calculate page dimensions: cell = label + gap (gap = bleed left + bleed right)
const d = imposeRequest.dieline;
const cellWidth = d.label_width_mm + d.horizontal_gap_mm;
const cellHeight = d.label_height_mm + d.vertical_gap_mm;
const pageWidth = cellWidth * d.columns_across;
const pageHeight = cellHeight * d.rows_around;
```

For the 70x100mm / 4-across / 3-around / 3mm gaps example:
- cellWidth = 70 + 3 = 73mm, pageWidth = 73 x 4 = **292mm**
- cellHeight = 100 + 3 = 103mm, pageHeight = 103 x 3 = **309mm**
- 12 labels on the page

**File: `src/components/labels/dielines/DielineFormDialog.tsx` (line 107-108)**

Change the totalWidth formula:

```typescript
const totalWidth = (formData.label_width_mm + (formData.horizontal_gap_mm ?? 3)) * formData.columns_across;
```

For the same dieline: `(70 + 3) * 4 = 292mm` (correct).

Also add a totalHeight preview so operators can see both dimensions at a glance.

### Summary

| File | Change |
|------|--------|
| `supabase/functions/label-impose/index.ts` | Use `label + gap` for cell size instead of `label + bleed fields` |
| `src/components/labels/dielines/DielineFormDialog.tsx` | Fix totalWidth formula, add totalHeight display |

