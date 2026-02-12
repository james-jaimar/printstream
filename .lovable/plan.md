

# Fix Calculation Bugs in Layout Optimizer

## Problems Found

### 1. Scores displayed as raw decimals instead of percentages
The `ScoreBar` component in `LayoutOptimizer.tsx` receives scores in the 0-1 range (e.g., `0.993`) but displays them directly with a `%` sign, producing "0.993090506875...%". The `overall_score` badge has the same bug.

### 2. Frame count calculated from undivided quantity (4x too high)
In `createOptimizedRuns`, frames are calculated using the full item quantity (e.g., 3000) via `calculateFramesForSlot(level, config)`. But `fillAllSlots` has already divided the quantity across slots (e.g., 750 per slot for 4 slots). The frame count should be based on the per-slot quantity (750), not the full quantity (3000). This produces inflated frame counts and meter totals.

### 3. Label count in diagram ignores template stacking
`RunLayoutDiagram` calculates `labelsPerFrame = columnsAcross * rowsAround` (e.g., 3 x 3 = 9), but the actual frame stacks 4 templates, so it should be 36 labels per frame. This makes the header show "4,008 labels" instead of the correct ~3,000.

---

## Changes

### File: `src/components/labels/LayoutOptimizer.tsx`

**Fix `ScoreBar` to multiply by 100:**
```
function ScoreBar({ label, value }) {
  const percent = Math.round(value * 100);
  return (
    ...
    <span>{percent}%</span>
    <Progress value={percent} ... />
  );
}
```

**Fix `overall_score` badge display:**
```
<Badge>
  {Math.round(option.overall_score * 100)}% score
</Badge>
```

### File: `src/utils/labels/layoutOptimizer.ts`

**Fix `createOptimizedRuns` to use per-slot quantity for frame calculation:**

After calling `fillAllSlots`, the per-slot quantity is `level / slotCount`. The frame count should use the max per-slot quantity from the assignments, not the raw `level`.

Change the frame calculation (around line 326) from:
```
const frames = calculateFramesForSlot(level, config);
```
To:
```
const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
const frames = calculateFramesForSlot(maxSlotQty, config);
```

Apply the same fix in the leftover handling section (around line 364) where frames are also calculated from the raw qty.

### File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`

**Fix `labelsPerFrame` to account for template stacking:**

The diagram needs to know how many templates stack per frame. Import `getSlotConfig` and use its `labelsPerFrame` value instead of the simple `columnsAcross * rowsAround` calculation.

Change (around line 75):
```
const labelsPerFrame = columnsAcross * rowsAround;
```
To:
```
import { getSlotConfig } from '@/utils/labels/layoutOptimizer';
...
const slotConfig = getSlotConfig(dieline);
const labelsPerFrame = slotConfig.labelsPerFrame;
```

This ensures the "Run 1 -- X labels" header shows the correct total.

---

## Expected Results After Fix

For the Pizza Picasso order (3x3 dieline, 219mm template, 4 templates/frame):

- Scores display as "99%", "29%", "22%" instead of raw decimals
- Run 1 (3,000 labels, 4 slots x 750): frames = ceil(750 / 12) = 63 frames, 63 x 0.876m = ~55m
- Diagram header shows "Run 1 -- ~3,000 labels" (not 4,008)
- Production time calculated from realistic meter totals
