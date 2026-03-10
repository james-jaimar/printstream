
# AI Layout Optimizer — Consolidated Architecture

## Current State (v2 — Consolidated)

### Architecture: AI-Only with Real Context

```text
FLOW: Query existing runs → Subtract printed qty → AI (single brain) → Validate (warnings only) → Human review
FALLBACK: Individual runs (one item per run) if AI fails
```

### What Was Removed
1. **`correctAILayout()`** — server-side post-processor that bumped quantities and created corrective runs
2. **5 algorithmic strategies** — `ganged-all`, `individual`, `optimized`, `roll-optimized`, `equal-qty` (~600 lines)
3. **`fillSlotsWithBlankOption()`**, `balanceSlotQuantities()`, `fillAllSlots()`, `annotateRunsWithRollInfo()`, `createGangedRuns()`, `createOptimizedRuns()`, `createEqualQuantityRuns()`, `createRollOptimizedRuns()`

### What Was Added
1. **Already-printed context** — hook queries `label_runs` table before calling AI, subtracts printed quantities, excludes fully-printed items
2. **`already_printed` parameter** — edge function accepts and injects into AI prompt so it knows what's done
3. **Fallback layout** — simple individual runs if AI is unavailable (rate limit, error, etc.)

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/label-optimize/index.ts` | Removed `correctAILayout()` (~160 lines), accepts `already_printed`, single AI pass with retry (no correction) |
| `src/utils/labels/layoutOptimizer.ts` | Stripped to math utilities only (~250 lines from ~1000). Kept: `getSlotConfig`, `calculateFramesForSlot`, `calculateMeters`, `calculateProductionTime`, `calculateRunPrintTime`, `scoreLayout`, `validateRunOverrun`, `createSingleItemRun`, `suggestQtyPerRoll`, `buildTradeOffs`, `createLayoutOption`, `formatLayoutSummary` |
| `src/hooks/labels/useLayoutOptimizer.ts` | AI-only flow with `getAlreadyPrintedQuantities()`, `buildFallbackLayout()`. No parallel algorithmic generation |
