
# AI Layout Optimizer — Hybrid Solver Architecture (v4)

## Current State

### Architecture: Deterministic Solver + Optional AI Advisor

```text
FLOW: Query printed runs (printing/completed only) → Subtract from items → Deterministic Solver (multi-strategy) → Validate → Score → Return best
NO: AI for arithmetic, retry loops, prompt engineering for math
```

### What Changed (from v3 → v4)
1. **Replaced AI-only layout engine** with deterministic constraint solver
2. **`canAddToRun()`** — mathematical guarantee: every slot stays within maxOverrun
3. **Multi-strategy candidate generation**: no-split, split-2, aggressive-split, qtyPerRoll-rounded
4. **Scoring engine**: ranks valid layouts by run count, blank slots, overrun, splits, remainder
5. **Removed**: 200-line AI prompt, retry loop, AI API call dependency
6. **No LOVABLE_API_KEY needed** for basic layout — solver is pure code

### Why
LLMs are sequence predictors, not constraint solvers. Under multi-step integer arithmetic with hard limits (ceil, compare, iterate), they drift. The solver guarantees zero overrun violations by construction.

### Files
| File | Lines | Change |
|------|-------|--------|
| `supabase/functions/label-optimize/index.ts` | ~380 | Complete rewrite: deterministic solver with canAddToRun, greedySolve, scoreLayout, multi-strategy candidates |
| `src/hooks/labels/useLayoutOptimizer.ts` | ~320 | Unchanged — maps response to LayoutOption (same shape) |
| `src/utils/labels/layoutOptimizer.ts` | ~85 | Unchanged — math utilities |
| `src/types/labels.ts` | ~480 | Unchanged |
| UI components | - | Unchanged |

### Solver Algorithm
1. `canAddToRun(existingQtys[], candidateQty, lpf, maxOverrun)` — checks ALL items against frame output
2. `greedySolve(splitItems, totalSlots, lpf, maxOverrun)` — first-fit descending bin packing
3. `solveLayout()` — generates 3-4 candidate strategies, scores each, returns best
4. `validateLayout()` — belt & suspenders final check
5. `formatSolverOutput()` — converts to the same JSON shape the hook expects
