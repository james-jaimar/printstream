

# Complete Rewrite: AI Layout Optimizer

## The Core Problems

1. **`getAlreadyPrintedQuantities()` counts slot assignments, not actual prints** — it sums `quantity_in_slot` from ALL saved runs (including runs that haven't been printed yet), so each time you regenerate, previous saved layouts corrupt the input
2. **The AI prompt is overengineered** — 200+ lines of "worked examples" and edge cases that confuse the model rather than help it
3. **Client-side recalculates everything** — `buildAILayoutOption()` recomputes frames, meters, efficiency scores, trade-offs on top of what the AI already figured out, creating mismatches
4. **Validation/retry loop** adds another layer of mutation

## The Rewrite — Three Clean Files

### 1. Edge Function: `supabase/functions/label-optimize/index.ts` (~150 lines, down from 456)

**Strip to essentials:**
- Accept: `items[]`, `dieline`, `max_overrun`, `qty_per_roll`
- Simple, physics-focused prompt:
  - "You have N slots. Each slot prints simultaneously. A run's length = ceil(max_slot_qty / labels_per_slot_per_frame). Every slot produces that many. Overrun = actual - requested. Max overrun: X."
  - "EVERY item must appear. No item may be skipped. Assign all items."
  - "Items sorted by quantity for you: [list]"
- Tool calling for structured output (keep `create_layout` tool schema)
- **No retry loop.** Single AI call. Return result + validation warnings. Human reviews.
- Return the AI's raw runs + reasoning directly — no server-side manipulation

**The prompt will be ~40 lines**, not 200. Clear physics, clear constraint, clear objective.

### 2. Hook: `src/hooks/labels/useLayoutOptimizer.ts` (~200 lines, down from 522)

**Simplify to:**
- `generateOptions()`: 
  - Query `label_runs` WHERE `status IN ('printing','completed')` (only actually printed runs, not saved/planned ones)
  - Subtract from item quantities
  - Call edge function with adjusted items
  - Map AI response directly to `LayoutOption` — minimal transformation (just add slot index numbers)
- `applyLayout()`: Save runs to DB (unchanged)
- `saveLayout()` / `clearSavedLayout()`: Persist to `label_orders.saved_layout` (unchanged)
- **Remove**: efficiency scoring, weights system, fallback layout builder, complex debug info builder

### 3. Utilities: `src/utils/labels/layoutOptimizer.ts` (~80 lines, down from 250)

**Keep only:**
- `getSlotConfig()` — needed by imposition engine
- `calculateFramesForSlot()`, `calculateMeters()` — basic math
- `calculateProductionTime()`, `calculateRunPrintTime()` — time estimates
- `formatLayoutSummary()` — display helper

**Remove**: `scoreLayout`, `buildTradeOffs`, `createLayoutOption`, `createSingleItemRun`, `validateRunOverrun`, `suggestQtyPerRoll` — all the "second brain" stuff

### 4. Panel: `src/components/labels/optimizer/LayoutOptimizerPanel.tsx`

- Remove weights sliders (material/print/labor efficiency) — the AI decides
- Keep max overrun slider — that's a real constraint
- Keep generate button, layout cards display
- Show AI reasoning prominently

### 5. Types: `src/types/labels.ts`

- Remove `OptimizationWeights`, `DEFAULT_OPTIMIZATION_WEIGHTS`, `LayoutDebugInfo`
- Simplify `LayoutOption`: remove efficiency scores, keep `id`, `runs`, `total_meters`, `total_frames`, `reasoning`, `trade_offs`
- Simplify `ProposedRun`: remove `needs_rewinding`, `consolidation_suggestion`, `quantity_override`, `roll_split`

## Key Fix: Already-Printed Logic

```typescript
// BEFORE (broken): counts ALL runs including un-printed saved layouts
.from('label_runs').select('slot_assignments').eq('order_id', orderId)

// AFTER: only count runs that actually went to press
.from('label_runs').select('slot_assignments')
.eq('order_id', orderId)
.in('status', ['printing', 'completed'])
```

## Key Fix: AI Prompt

Short, clear, physics-only. No "worked examples" with made-up numbers. Just:
- Here's how the press works (3 sentences)
- Here are the items (exact IDs and quantities)
- Rules: every item must appear, max overrun X, minimize waste
- Return via `create_layout` tool

## Files to Modify

| File | Action |
|------|--------|
| `supabase/functions/label-optimize/index.ts` | Rewrite — ~150 lines |
| `src/hooks/labels/useLayoutOptimizer.ts` | Rewrite — ~200 lines |
| `src/utils/labels/layoutOptimizer.ts` | Strip to ~80 lines |
| `src/types/labels.ts` | Simplify layout types |
| `src/components/labels/optimizer/LayoutOptimizerPanel.tsx` | Remove weights UI |

