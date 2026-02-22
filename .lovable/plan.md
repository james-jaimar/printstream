

# Fix Layout Math + Add Run Adjustment & Roll Splitting Controls

## Problems Identified

### 1. Run 3 Math Bug (Critical)
The `labels_per_output_roll` and tooltip quantities are wrong. In a ganged run, ALL slots print for the same number of frames (determined by the slot with the HIGHEST quantity). So if S3 needs 4,000 but S1/S2/S4/S5 need 1,650, the run prints 4,000 frames' worth for EVERY slot. Each slot actually outputs 4,000 labels, not 1,650. The 1,650 slots get 2,350 of overrun/waste each.

**Root cause**: `annotateRunsWithRollInfo` uses `quantity_in_slot` (the *requested* quantity) instead of the *actual output* quantity (`frames * labelsPerSlotPerFrame`). The tooltip also shows requested, not actual.

### 2. No Interactive Run Adjustment (Run 4: 460 -> 500)
When a run is flagged as "short rolls", there's no way to nudge it up. Need a small +/- control or quick-adjust button so the account exec can bump 460 to 500 per slot and lock it in.

### 3. No Roll Splitting Options (Run 2: 860 -> 500+360 or 430+430)
When a slot produces more than qty_per_roll (e.g., 860 labels but need 500/roll), there's no guidance on how the finishing dept should split. Need to show splitting options and let the user choose.

## Changes

### 1. Fix the Math in `annotateRunsWithRollInfo`

**File: `src/utils/labels/layoutOptimizer.ts`** (lines 479-497)

Change `labels_per_output_roll` from `minSlotQty` (requested) to the **actual output per slot**: `run.frames * config.labelsPerSlotPerFrame`. This is what each slot actually produces, regardless of the requested quantity. The `needs_rewinding` flag should compare this actual output against `qtyPerRoll`.

Also add a new field: `actual_labels_per_slot` on the run so the diagram knows the real output.

### 2. Fix Tooltip in `RunLayoutDiagram`

**File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`**

- The tooltip currently shows `assignment.quantity_in_slot` which is the *requested* amount, not what actually comes off the press. Add the actual output to the tooltip: "Slot 1: Requested 1,650 / Actual 4,000 (2,350 overrun)"
- The slot label badge (e.g., "S1 x1.6k") should show the actual output, not the requested, since that's what physically prints.

### 3. Extend `ProposedRun` Type

**File: `src/types/labels.ts`**

Add to `ProposedRun`:
- `actual_labels_per_slot?: number` -- the real output per slot (frames x labelsPerSlotPerFrame)
- `roll_split?: RollSplitOption` -- the chosen splitting strategy for finishing
- `quantity_override?: number` -- when user manually adjusts the run quantity

Add new type:
```
interface RollSplitOption {
  strategy: 'even' | 'fill_first' | 'custom';
  rolls: { roll_number: number; label_count: number }[];
}
```

### 4. Add Run Quantity Adjuster

**File: `src/components/labels/optimizer/RunQuantityAdjuster.tsx`** (new)

A small inline component shown on runs flagged as `needs_rewinding`:
- Shows current actual output per slot and the target (qty_per_roll)
- A "Bump to [qty_per_roll]" quick button that rounds up the run to the nearest qty_per_roll multiple
- A small +/- stepper for fine-tuning
- A "Lock" button that confirms the override
- When locked, the run's `quantity_override` is set, and the run recalculates frames/meters

### 5. Add Roll Splitting Selector

**File: `src/components/labels/optimizer/RollSplitSelector.tsx`** (new)

Shown on runs where actual output per slot > qty_per_roll:
- Calculates possible splits automatically:
  - **Even split**: 860 / 2 = 430 + 430
  - **Fill first**: 500 + 360
  - **Custom**: User enters their own split
- Radio/button group to pick a strategy
- Shows the resulting roll breakdown visually
- Selection is saved to `run.roll_split`

### 6. Wire Controls into RunLayoutDiagram

**File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`**

- When in non-compact mode and the run has short-roll issues, show the `RunQuantityAdjuster` below the diagram
- When actual output > qty_per_roll, show the `RollSplitSelector`
- Add callbacks: `onQuantityOverride?: (runNumber: number, newQty: number) => void` and `onRollSplitChange?: (runNumber: number, split: RollSplitOption) => void`

### 7. Wire Controls into LayoutOptimizer

**File: `src/components/labels/LayoutOptimizer.tsx`**

- Add state for run overrides and roll splits
- When user adjusts a run quantity or picks a split, update the `selectedOption` in place (recalculate frames/meters for overrides)
- These adjustments persist in the saved layout (already saved as JSON to `label_orders.saved_layout`)

### 8. Update the Consolidation Logic

**File: `src/utils/labels/layoutOptimizer.ts`**

- In `createRollOptimizedRuns`, use `actual_labels_per_slot` (frames-based) instead of `quantity_in_slot` for comparison against `qtyPerRoll`
- This fixes the consolidation suggestions to reflect real output

## Summary of File Changes

| File | Change |
|------|--------|
| `src/types/labels.ts` | Add `actual_labels_per_slot`, `roll_split`, `quantity_override` to `ProposedRun`; add `RollSplitOption` type |
| `src/utils/labels/layoutOptimizer.ts` | Fix `annotateRunsWithRollInfo` to use actual output; calculate `actual_labels_per_slot`; fix consolidation logic |
| `src/components/labels/optimizer/RunLayoutDiagram.tsx` | Fix tooltip to show actual vs requested; show adjuster and split controls |
| `src/components/labels/optimizer/RunQuantityAdjuster.tsx` | New component for bumping short runs |
| `src/components/labels/optimizer/RollSplitSelector.tsx` | New component for choosing roll split strategy |
| `src/components/labels/LayoutOptimizer.tsx` | Wire override/split callbacks; persist in saved layout |
| `src/components/labels/optimizer/index.ts` | Export new components |

