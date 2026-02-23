

# Fix Roll-Awareness: Tolerance, Responsiveness, and Overrun Limits

## Three Issues to Fix

### 1. Add ~50 Label Tolerance to Roll Splitting

**Problem**: Run 4 shows 504/slot with "Roll splitting -- 504 labels/slot exceeds 500/roll", offering splits of "500 + 4" and "252 + 252". A 4-label overage is trivial -- up to 50 labels at the end of a roll can be ignored.

**Fix**: Add a `ROLL_TOLERANCE = 50` constant. Both `needs_rewinding` and `showSplitter` checks use this tolerance:
- `needs_rewinding` = `actualPerSlot < (qtyPerRoll - ROLL_TOLERANCE)` (only flag if genuinely short)
- Roll splitting only triggers when `actualPerSlot > qtyPerRoll + ROLL_TOLERANCE`

**Files**:
- `src/utils/labels/layoutOptimizer.ts` -- add `ROLL_TOLERANCE = 50`, use in `annotateRunsWithRollInfo`
- `src/components/labels/optimizer/RunLayoutDiagram.tsx` -- apply tolerance to `showSplitter` condition
- `src/components/labels/LayoutOptimizer.tsx` -- apply tolerance in `effectiveRuns` recalculation

### 2. Fix Roll Split UI Responsiveness

**Problem**: When a slot produces many rolls (e.g., 4,005 labels / 500/roll = 9 rolls), the badge row overflows and text wraps badly on laptop screens.

**Fix in `RollSplitSelector.tsx`**:
- Cap the inline badge display to max 4 badges. If more rolls, show a summary like "9 rolls x 500 (+5 remainder)" instead of 9 individual badges
- Use `flex-wrap` on the badge container
- Truncate the "Fill first" label text: instead of "500 + 500 + 500 + 500 + 500 + 500 + 500 + 500 + 5", show "8 x 500 + 5"
- Make the option buttons stack vertically (label on top, badges below) when roll count exceeds 4

### 3. Add Maximum Overrun Threshold to Optimizer

**Problem**: Run 3 gangs items where one needs 4,000/slot and others need 1,650/slot. Because all slots print the same number of frames (driven by the max), the 1,650 items get 4,005 labels each -- a 2,355 overrun (143% waste). This is unacceptable.

**Root cause**: The `createOptimizedRuns` function does NOT call `balanceSlotQuantities`. It groups items by quantity level but doesn't check if the resulting run has excessive per-slot overrun.

**Fix in `src/utils/labels/layoutOptimizer.ts`**:
- Add a `MAX_OVERRUN_PERCENT = 0.20` constant (20% max acceptable overrun per slot)
- After each run is created in `createOptimizedRuns`, check: if any slot's requested quantity is less than `maxSlotQty * (1 - MAX_OVERRUN_PERCENT)`, that run has too much overrun
- When detected, use `balanceSlotQuantities` to split the run (cap at the min qty, then handle the remainder separately)
- This ensures no slot ever has more than ~20% overrun relative to its requested quantity

Additionally, in `annotateRunsWithRollInfo`, add a per-slot overrun warning when `(actual - requested) / requested > 0.20` so the UI can flag it.

## Technical Details

**New constants** (in `layoutOptimizer.ts`):
```
const ROLL_TOLERANCE = 50;         // labels at end of roll that can be ignored
const MAX_OVERRUN_PERCENT = 0.20;  // 20% max acceptable overrun per slot
```

**Smarter roll split label formatting** (in `RollSplitSelector.tsx`):
```
// Instead of "500 + 500 + 500 + 500 + 500 + 500 + 500 + 500 + 5"
// Show "8 x 500 + 5" when rollCount > 4
```

**Overrun protection in `createOptimizedRuns`**:
After creating assignments for a run at a given level, check if the `maxSlotQty / minSlotQty` ratio exceeds the threshold. If so, call `balanceSlotQuantities` to split the unbalanced run into balanced sub-runs, just like the ganged strategy does.

## Summary of File Changes

| File | Change |
|------|--------|
| `src/utils/labels/layoutOptimizer.ts` | Add `ROLL_TOLERANCE` and `MAX_OVERRUN_PERCENT` constants; apply tolerance in `annotateRunsWithRollInfo`; add overrun protection in `createOptimizedRuns` by calling `balanceSlotQuantities` when overrun exceeds threshold |
| `src/components/labels/optimizer/RollSplitSelector.tsx` | Compact label formatting for many rolls (e.g., "8 x 500 + 5"); cap badge display to 4; use `flex-wrap` for responsiveness |
| `src/components/labels/optimizer/RunLayoutDiagram.tsx` | Apply `ROLL_TOLERANCE` to `showSplitter` condition |
| `src/components/labels/LayoutOptimizer.tsx` | Apply tolerance in `effectiveRuns` `needs_rewinding` check |

