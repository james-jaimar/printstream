
# AI Layout Optimizer — Band-Based Constrained Optimization (v6)

## Current State

### Architecture: Deterministic Band-Based Solver

```text
FLOW: Query printed runs (printing/completed only) → Subtract from items → Band Solver (multi-strategy) → Validate → Score → Return best
NO: AI for arithmetic, retry loops, prompt engineering for math
RULE: Blank slots only on LAST run. All other runs must have every slot filled. Enforced by 10,000 penalty.
```

### What Changed (from v5 → v6)
1. **Complete solver rewrite** — removed greedy bin-packing and fill-first, replaced with band-based grouping
2. **Core concept: Bands** — a run's frame count defines a valid quantity range `[actual - maxOverrun, actual]`
3. **7 base strategies + 5 rounded variants** — 12 total candidate layouts evaluated per optimization
4. **Strategies**: no-split, split-2, split-largest, split-median, split-neighbors, split-all, band-merge
5. **Blank penalty = 10,000** on non-last runs (effectively forbidden by construction)

### Files
| File | Lines | Change |
|------|-------|--------|
| `supabase/functions/label-optimize/index.ts` | ~530 | Full rewrite: band-based solver |
| `src/hooks/labels/useLayoutOptimizer.ts` | ~320 | Unchanged |
| `src/utils/labels/layoutOptimizer.ts` | ~85 | Unchanged |
| `src/types/labels.ts` | ~480 | Unchanged |

### Band Math
- `computeBand(qty, lpf, maxOverrun)` → `{ min: actual - maxOverrun, max: actual, frames }`
- Portions in the same band can share a run (overrun guaranteed ≤ maxOverrun)
- Items are split into portions before band assignment, not during run building

### Scoring Formula
```
score = runCountPenalty(100/run) + blankSlotPenalty(10000 non-last, 10 last)
      + totalOverrun * 0.1 + splitPenalty(50/extra run per item) + remainderPenalty
```
