

## Fix: VPS Page Size and Missing Label (11 of 12)

### Root Cause

The edge function sends the dieline's `horizontal_gap_mm: 3` and `vertical_gap_mm: 3` to the VPS, but also calculates page dimensions **without** gaps (cell size x grid count). The VPS then applies the gap values on top of the already-tight page dimensions, which:

1. **Reduces the page height**: The VPS subtracts gap space from the available area, resulting in 306mm instead of 309mm (lost 3mm = one vertical gap).
2. **Drops one label**: With reduced space, the VPS can only fit 11 labels instead of 12 (4 columns x 3 rows).

The dieline for this order is `70x100mm` with `1.5mm` bleed on all sides:
- Cell size: 73mm x 103mm
- Expected page: 73 x 4 = **292mm** wide, 103 x 3 = **309mm** tall
- Actual output: 292 x **306mm** (3mm short = one `vertical_gap_mm`)

### The Fix

Since labels are butted together on the roll (no gaps in production), the edge function should **zero out the gap values** in the payload sent to the VPS. The page dimensions are already calculated correctly without gaps.

### Changes

**File: `supabase/functions/label-impose/index.ts`**

In the VPS payload construction (around line 170-175), override the gap values to zero:

```typescript
const vpsPayload = JSON.stringify({
  dieline: {
    ...imposeRequest.dieline,
    roll_width_mm: pageWidth,
    page_height_mm: pageHeight,
    horizontal_gap_mm: 0,  // Labels are butted together on roll
    vertical_gap_mm: 0,    // Page dimensions already account for exact fit
  },
  slots: slotsWithRotation,
  meters: 0,
  include_dielines: imposeRequest.include_dielines,
  upload_config: uploadConfig,
  callback_config: callbackConfig,
});
```

This ensures:
- Page dimensions remain 292 x 309mm (correct)
- VPS places all 12 labels (4x3) without subtracting gap space
- Labels are positioned edge-to-edge as required for roll printing

### Files

| File | Change |
|------|--------|
| `supabase/functions/label-impose/index.ts` | Zero out `horizontal_gap_mm` and `vertical_gap_mm` in VPS payload |

