
# Smarter AI Layout Engine — IMPLEMENTED

## Changes Made

### 1. `src/types/labels.ts` — Added `LayoutTradeOffs` interface and `trade_offs?` to `LayoutOption`
### 2. `src/utils/labels/layoutOptimizer.ts` — Smart Slot Spreading + trade-off annotations
- **Rewrote `fillSlotsWithBlankOption()`**: Now spreads items across `floor(totalSlots / numItems)` slots each, splitting quantities evenly. Example: 4 items in 9 slots → 2 slots each (8 filled, 1 blank), NOT 4 filled + 5 blank.
- `suggestQtyPerRoll()`: suggests roll size based on label dimensions
- `buildTradeOffs()`: annotates each option with blank slot counts, overrun warnings, roll size notes
- Updated `createGangedRuns` and `createOptimizedRuns` to use blank-aware slot filling

### 3. `supabase/functions/label-optimize/index.ts` — Enhanced AI prompt + server-side correction
- **Prompt rewrite**: Removed "blank slots are VALUABLE" messaging. Now says "MINIMIZE blanks, max 1-2 per run, spread items across slots"
- Overrun constraint at TOP of prompt with concrete math example
- **Corrective run fix**: Orphaned items now spread across all slots (not dumped into 1 slot with rest blank)
- `correctAILayout()` post-processor fixes overrun violations server-side
- Retry logic — if AI violates overrun, retries once with explicit failure feedback
- Returns `corrected: true` flag when layout was auto-fixed

### 4. `src/hooks/labels/useLayoutOptimizer.ts` — Passes qtyPerRoll & dimensions to AI
- Sends `qty_per_roll`, `label_width_mm`, `label_height_mm` in edge function request
- Surfaces correction flag — shows toast when AI layout was auto-corrected

### 5. `src/components/labels/optimizer/LayoutOptionCard.tsx` — Trade-off UI
- Amber badge for blank slots with tooltip
- Red badge for overrun warnings with tooltip listing each
- Blue badge for roll size suggestions with tooltip
