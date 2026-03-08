
# Smarter AI Layout Engine — IMPLEMENTED

## Changes Made

### 1. `src/types/labels.ts` — Added `LayoutTradeOffs` interface and `trade_offs?` to `LayoutOption`
### 2. `src/utils/labels/layoutOptimizer.ts` — Blank slot strategy + trade-off annotations
- New `fillSlotsWithBlankOption()`: uses blank slots (qty=0) when round-robin would breach maxOverrun
- New `suggestQtyPerRoll()`: suggests roll size based on label dimensions
- New `buildTradeOffs()`: annotates each option with blank slot counts, overrun warnings, roll size notes
- Updated `createGangedRuns` and `createOptimizedRuns` to use blank-aware slot filling
- Updated `createLayoutOption` to accept dieline + maxOverrun and populate trade_offs

### 3. `supabase/functions/label-optimize/index.ts` — Enhanced AI prompt
- Blank slot guidance in system prompt (hard constraint: prefer blanks over overrun violations)
- Roll size reasoning (passes qty_per_roll + label dimensions; suggests defaults if not set)
- `trade_offs` field added to create_layout tool schema

### 4. `src/hooks/labels/useLayoutOptimizer.ts` — Passes qtyPerRoll & dimensions to AI
- Sends `qty_per_roll`, `label_width_mm`, `label_height_mm` in edge function request
- Passes AI `trade_offs` through to `buildAILayoutOption`

### 5. `src/components/labels/optimizer/LayoutOptionCard.tsx` — Trade-off UI
- Amber badge for blank slots with tooltip
- Red badge for overrun warnings with tooltip listing each
- Blue badge for roll size suggestions with tooltip
