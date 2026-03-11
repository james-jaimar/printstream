
# AI Layout Optimizer — Hybrid Solver Architecture (v5)

## Current State

### Architecture: Deterministic Solver + Fill-First Strategy

```text
FLOW: Query printed runs (printing/completed only) → Subtract from items → Deterministic Solver (multi-strategy incl. fill-first) → Validate → Score → Return best
NO: AI for arithmetic, retry loops, prompt engineering for math
RULE: Blank slots only allowed on the LAST run. All other runs must have every slot filled.
```

### What Changed (from v4 → v5)
1. **Added `solveFullSlots()` fill-first strategy** — aggressively splits items to fill every slot in every run
2. **Updated scoring** — blank slots on non-last runs penalized 1000 (was 10), effectively forbidden
3. **Added 2 new strategies** (fill-first plain + fill-first with qtyPerRoll rounding) to candidate pool
4. **Strategy logging** — scores for all candidates logged for debugging

### Files
| File | Lines | Change |
|------|-------|--------|
| `supabase/functions/label-optimize/index.ts` | ~620 | Added solveFullSlots(), updated scoreLayout() blank penalty, added strategies 5+6 |
| `src/hooks/labels/useLayoutOptimizer.ts` | ~320 | Unchanged |
| `src/utils/labels/layoutOptimizer.ts` | ~85 | Unchanged |
| `src/types/labels.ts` | ~480 | Unchanged |
| UI components | - | Unchanged |

### Fill-First Algorithm
1. Track remaining quantity per item
2. For each new run, pick largest remaining item as "anchor"
3. Compute compatible range: `[actual - maxOverrun, actual]` where `actual = ceil(anchorQty/lpf) * lpf`
4. Fill remaining slots by splitting items into portions within compatible range
5. Only allow blank slots when no items remain (last run)

