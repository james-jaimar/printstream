

## Fix: VPS Ignoring page_height_mm — Override Label Dimensions Instead

### Root Cause

The edge function correctly calculates 292x309mm and passes `page_height_mm: 309` to the VPS. But the VPS **ignores** `page_height_mm` and recalculates the page size from the label dimensions it receives:

- `label_height_mm: 100` (from the spread `...imposeRequest.dieline`)
- `rows_around: 3`
- Result: `100 * 3 = 300mm` (wrong -- missing the 3mm bleed per label)

The VPS does its own math. We cannot force it to use our `page_height_mm`. Instead, we need to **feed it the cell size as the label size**, so when it multiplies, it gets the right answer.

### The Fix

Override `label_width_mm` and `label_height_mm` in the VPS payload to equal the cell size (label + gap). Then zero out the gaps so the VPS doesn't add anything extra:

```
label_width_mm = 70 + 3 = 73   (cell width)
label_height_mm = 100 + 3 = 103 (cell height)
horizontal_gap_mm = 0
vertical_gap_mm = 0
```

VPS calculation: `73 * 4 = 292mm`, `103 * 3 = 309mm`, 12 labels. Correct.

### Change

**File: `supabase/functions/label-impose/index.ts` (lines 170-177)**

Replace the dieline override in the VPS payload:

```typescript
const vpsPayload = JSON.stringify({
  dieline: {
    ...imposeRequest.dieline,
    // Feed VPS the cell size (label + bleed) as the label dimensions
    // so its own calculation produces the correct page size
    label_width_mm: cellWidth,    // 70 + 3 = 73
    label_height_mm: cellHeight,  // 100 + 3 = 103
    roll_width_mm: pageWidth,     // 73 * 4 = 292
    page_height_mm: pageHeight,   // 103 * 3 = 309
    horizontal_gap_mm: 0,
    vertical_gap_mm: 0,
  },
  slots: slotsWithRotation,
  meters: 0,
  include_dielines: imposeRequest.include_dielines,
  upload_config: uploadConfig,
  callback_config: callbackConfig,
});
```

This way, no matter how the VPS internally calculates its page size, it will arrive at 292x309mm with all 12 labels.

### Summary

| File | Change |
|------|--------|
| `supabase/functions/label-impose/index.ts` | Add `label_width_mm: cellWidth` and `label_height_mm: cellHeight` overrides to VPS payload |

