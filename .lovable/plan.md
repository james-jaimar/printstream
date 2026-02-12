

# Fix Frame Calculation: Stack Multiple Templates Per Frame

## The Problem

The current code equates one dieline template (3 rows = 219mm tall) with one "frame." In reality, a **frame** is a repeating print unit up to 960mm long, and multiple complete dieline templates stack vertically within it.

For this order's dieline (3 across, 3 down, ~73mm label height):
- Template height = 73mm x 3 rows + gaps = ~219mm
- Templates that fit in 960mm frame = floor(960 / 219) = **4**
- Actual frame height = 219mm x 4 = **876mm**
- Labels per frame = 4 templates x 9 labels each = **36**
- Run 1 (3,000 labels): 3000 / 36 = **84 frames** = 84 x 0.876 = **73.6 metres**

Currently the code thinks labels per frame = 9 (one template only), producing inflated frame counts and wrong metre totals.

## Changes

### File: `src/utils/labels/layoutOptimizer.ts` -- `getSlotConfig` function

Update the calculation to:

1. Compute the **single template height** from the dieline (label_height x rows_around + gaps + bleed)
2. Calculate **templates per frame** = floor(960 / template_height)
3. Set **frame height** = template_height x templates_per_frame (the actual repeating length, e.g. 876mm)
4. Multiply labels accordingly: labelsPerSlotPerFrame = rows_around x templates_per_frame

```
getSlotConfig(dieline):
  templateHeightMm = label_height * rows_around 
                   + vertical_gap * (rows_around - 1) 
                   + bleed_top + bleed_bottom

  templatesPerFrame = floor(MAX_FRAME_LENGTH / templateHeightMm)
  templatesPerFrame = max(1, templatesPerFrame)  // at least 1

  frameHeightMm = templateHeightMm * templatesPerFrame
  framesPerMeter = 1000 / frameHeightMm

  labelsPerSlotPerFrame = rows_around * templatesPerFrame
  labelsPerFrame = columns_across * labelsPerSlotPerFrame
```

### File: `src/types/labels.ts` -- SlotConfig (no changes needed, same shape)

No interface changes required. The existing `labelsPerFrame`, `labelsPerSlotPerFrame`, and `framesPerMeter` fields will simply hold the correct values.

### Expected Results for the Example Order

With the corrected calculation:
- Run 1 (3,000 labels, 4 slots x 750): 750 / 12 labels-per-slot-per-frame = 63 frames, 63 x 0.876m = ~55m (not 999 frames)
- Production time and metre estimates will be realistic and usable for quoting

All downstream code (`calculateFramesForSlot`, `calculateMeters`, diagram display) uses `SlotConfig` values, so they will automatically reflect correct numbers with no further changes.

