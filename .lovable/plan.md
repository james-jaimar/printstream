

# Consolidate Layout Optimizer: AI-Only with Real Context

## The Problem (Confirmed)

Three layers fight each other:

```text
LAYER 1: AI (Edge Function) → generates runs with reasoning
LAYER 2: correctAILayout() → bumps quantities, blanks slots, adds corrective runs
LAYER 3: 5 parallel algorithmic strategies → each with own slot-filling logic
```

The AI also has no knowledge of already-printed runs, so it re-assigns items that are already done (e.g., Page 14).

## Plan

### 1. Feed AI already-printed context (`src/hooks/labels/useLayoutOptimizer.ts`)
- Before calling the edge function, query `label_runs` for this order
- For each existing run, sum up `slot_assignments` quantities per item
- Subtract printed quantities from item requests; exclude fully-printed items
- Pass `already_printed: { item_id, printed_qty }[]` in the edge function request body

### 2. Remove `correctAILayout()` from edge function (`supabase/functions/label-optimize/index.ts`)
- Delete the entire `correctAILayout()` function (~160 lines)
- Remove the correction/retry logic from the request handler (lines 542-603)
- Keep `validateAILayout()` — return validation warnings to the UI for human review, but do NOT auto-fix
- Accept `already_printed` in the request body; add it to the AI prompt: "These items are ALREADY printed — do NOT assign them"
- For partially-printed items, tell the AI the remaining quantity only

### 3. Remove algorithmic strategies from `src/utils/labels/layoutOptimizer.ts`
- Remove: `createGangedRuns`, `createOptimizedRuns`, `createEqualQuantityRuns`, `createRollOptimizedRuns`, `fillSlotsWithBlankOption`, `balanceSlotQuantities`, `fillAllSlots`, `annotateRunsWithRollInfo` (~600 lines)
- Keep: `getSlotConfig`, `calculateFramesForSlot`, `calculateMeters`, `calculateProductionTime`, `calculateRunPrintTime`, `scoreLayout`, `buildTradeOffs`, `suggestQtyPerRoll`, `createLayoutOption`, `formatLayoutSummary`, `validateRunOverrun`, `createSingleItemRun` (math utilities)
- Remove `generateLayoutOptions()` entirely — no more parallel algorithmic options

### 4. Update hook to be AI-only (`src/hooks/labels/useLayoutOptimizer.ts`)
- Remove the call to `generateOptions()` (the algorithmic generator)
- On "Generate", only fire the AI edge function
- If AI fails, fall back to a single simple "individual runs" layout using `createSingleItemRun` (already exists as a utility)
- Show AI result as the primary option; fallback only if AI errors

### 5. Update panel UI (`src/components/labels/optimizer/LayoutOptimizerPanel.tsx`)
- No structural changes needed — it already shows whatever options the hook provides
- The grid will now show 1 AI option (+ possibly 1 fallback) instead of 6 competing options

## Result

```text
BEFORE: AI → correctAILayout → buildAILayoutOption + 5 algorithms
AFTER:  AI (with printed-context) → buildAILayoutOption (math only)
        Fallback: individual runs if AI fails
```

One brain, accurate input, no post-processing. Validation warnings shown for human review.

## Files

| File | Change |
|------|--------|
| `src/hooks/labels/useLayoutOptimizer.ts` | Query existing runs, subtract printed qty, remove algorithmic generation, AI-only flow |
| `supabase/functions/label-optimize/index.ts` | Remove `correctAILayout()`, accept `already_printed`, update prompt with printed context |
| `src/utils/labels/layoutOptimizer.ts` | Remove all strategy functions (~600 lines), keep math utilities |
| `src/components/labels/optimizer/LayoutOptimizerPanel.tsx` | No changes needed |

