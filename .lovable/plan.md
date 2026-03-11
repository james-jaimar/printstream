
# AI Layout Optimizer — Clean Architecture (v3)

## Current State

### Architecture: AI-Only, Physics-First

```text
FLOW: Query printed runs (printing/completed only) → Subtract from items → AI (single call) → Validate (warnings only) → Human review
NO: Post-processing, correction loops, algorithmic strategies, efficiency scoring
```

### What Was Removed (from v2)
1. **`OptimizationWeights`** — material/print/labor efficiency weights and UI sliders
2. **`LayoutDebugInfo`** — correction_notes, input_items debug section
3. **Efficiency scores** — material_efficiency_score, print_efficiency_score, labor_efficiency_score, overall_score
4. **`scoreLayout()`**, `buildTradeOffs()`, `createLayoutOption()`, `createSingleItemRun()`, `validateRunOverrun()`, `suggestQtyPerRoll()` — all "second brain" utilities
5. **`buildFallbackLayout()`** — no fallback, AI-only
6. **`buildAILayoutOption()`** — client-side recalculation replaced with direct AI mapping
7. **AI retry loop** — single call, warnings returned for human review
8. **200+ line prompt** — replaced with ~40 line physics-focused prompt

### Key Fix: Already-Printed Logic
```text
BEFORE: Queried ALL label_runs (including planned/saved), corrupting input on regeneration
AFTER:  Only queries runs with status IN ('printing', 'completed')
```

### Files
| File | Lines | Change |
|------|-------|--------|
| `supabase/functions/label-optimize/index.ts` | ~200 | Clean prompt, single AI call, validation warnings only |
| `src/hooks/labels/useLayoutOptimizer.ts` | ~230 | Fixed already-printed, direct AI mapping, no scoring |
| `src/utils/labels/layoutOptimizer.ts` | ~85 | Math only: getSlotConfig, frames, meters, time |
| `src/types/labels.ts` | ~480 | Removed weights/scores/debug, simplified LayoutOption & ProposedRun |
| `src/components/labels/LayoutOptimizer.tsx` | ~400 | Removed weight sliders and score bars |
| `src/components/labels/optimizer/LayoutOptionCard.tsx` | ~170 | Shows warnings + trade-offs, no efficiency scores |
| `src/components/labels/optimizer/LayoutOptimizerPanel.tsx` | ~100 | Simplified, no weights |
| `src/components/labels/optimizer/RunLayoutDiagram.tsx` | ~350 | Unchanged visual, kept interactive controls |
