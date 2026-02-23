

# Add Max Overrun Slider Control

## Problem

The current overrun protection uses a percentage-based threshold (`MAX_OVERRUN_PERCENT = 0.20`), which fails for large quantities. For example, 20% of 4,000 = 800 labels of overrun -- far too wasteful. The user wants an **absolute label count** cap on overrun, controllable via a slider.

## Solution

Replace the percentage-based overrun check with an **absolute max overrun** value (default 250 labels). Add a slider (range 50-1000) to the Layout Optimizer UI so the account exec can tune how much waste the optimizer is allowed to create per slot. When the slider changes and the user re-generates, the optimizer respects the new cap.

## Changes

### 1. Replace percentage constant with absolute cap

**File: `src/utils/labels/layoutOptimizer.ts`**

- Remove `MAX_OVERRUN_PERCENT = 0.20`
- Add `DEFAULT_MAX_OVERRUN = 250` as the default absolute cap
- Add `maxOverrun?: number` to the `LayoutInput` interface
- Thread `maxOverrun` through to `createOptimizedRuns`, `createGangedRuns`, `balanceSlotQuantities`, and `annotateRunsWithRollInfo`
- Change the overrun check in `createOptimizedRuns` (line ~355) from:
  ```
  (maxSlotQty - minSlotQty) / minSlotQty > MAX_OVERRUN_PERCENT
  ```
  to:
  ```
  (maxSlotQty - minSlotQty) > maxOverrun
  ```
- Change the per-slot warning in `annotateRunsWithRollInfo` (line ~520) from percentage to absolute:
  ```
  if (overrun > maxOverrun) { ... }
  ```
- Similarly update `balanceSlotQuantities` ratio check (line ~190) from `maxQty / minQty <= 1.10` to `(maxQty - minQty) <= maxOverrun`

### 2. Thread maxOverrun through the hook

**File: `src/hooks/labels/useLayoutOptimizer.ts`**

- Add `maxOverrun` to the hook's state (default `DEFAULT_MAX_OVERRUN`)
- Pass it into `generateOptions()` call as part of `LayoutInput`
- Expose `maxOverrun` and `setMaxOverrun` from the hook return

### 3. Add slider to LayoutOptimizer UI

**File: `src/components/labels/LayoutOptimizer.tsx`**

- Add a "Max Overrun per Slot" slider (range 50-1000, step 50, default 250) in the controls area, visible without needing "Advanced" toggle
- Show the current value as a label: e.g., "Max overrun: 250 labels/slot"
- When the slider changes, update `maxOverrun` in the hook
- The user then clicks "Generate Options" to regenerate with the new constraint
- Brief helper text: "Controls how many extra labels the optimizer may produce per slot beyond what's ordered"

### 4. Also add to LayoutOptimizerPanel

**File: `src/components/labels/optimizer/LayoutOptimizerPanel.tsx`**

- Add the same slider in the quick settings area so it's available in both UIs

## Technical Detail

The key insight is switching from **relative** (percentage) to **absolute** (label count) overrun control. This means:

- An item requesting 100 with max overrun 250 could still get up to 350 (250% overrun) -- but that's fine because 250 extra labels is physically cheap
- An item requesting 4,000 with max overrun 250 can only get up to 4,250 -- which prevents the current 2,355 overrun disaster
- The slider lets the account exec tighten (50) or loosen (1,000) based on the job

## File Summary

| File | Change |
|------|--------|
| `src/utils/labels/layoutOptimizer.ts` | Replace `MAX_OVERRUN_PERCENT` with `DEFAULT_MAX_OVERRUN = 250`; switch all overrun checks to absolute; add `maxOverrun` to `LayoutInput` and thread through |
| `src/hooks/labels/useLayoutOptimizer.ts` | Add `maxOverrun` state; pass to `generateOptions`; expose in return |
| `src/components/labels/LayoutOptimizer.tsx` | Add "Max Overrun" slider (50-1000) in controls |
| `src/components/labels/optimizer/LayoutOptimizerPanel.tsx` | Add matching slider in quick settings |
