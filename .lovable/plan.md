

# Fix: AI Layout Engine Ignoring Overrun Constraints

## Problem

The edge function logs confirm it: `"Run 3: slot for item ... overrun 1025 > max 250"`. The AI generates layouts that violate the `maxOverrun` hard limit. The validation catches this but **only logs a warning** — the invalid layout is returned to the client unchanged, resulting in 10,000+ extra labels on a 22,000 order.

Two root causes:
1. **No server-side enforcement**: `validateAILayout` warns but doesn't fix or reject.
2. **AI ignores instructions**: Despite the prompt saying "HARD LIMIT", the model still gangs items with wildly different quantities into the same run, creating massive overrun.

## Solution: Server-Side Correction + Smarter Prompt

### 1. Edge Function: Add `correctAILayout()` post-processor (`supabase/functions/label-optimize/index.ts`)

After validation, if warnings exist, run a correction pass that:

- For each run, calculates `actualPerSlot = frames × labelsPerSlotPerFrame`
- For any slot where `actualPerSlot - quantity_in_slot > maxOverrun`:
  - **Option A**: If the slot's quantity can be raised to `actualPerSlot - maxOverrun` without exceeding the item's total order, bump it up
  - **Option B**: Otherwise, set `quantity_in_slot = 0` (blank the slot) — the item gets reassigned to a new corrective run
- After blanking, collect orphaned quantities and create additional corrective runs where all slots share the same quantity (equal-qty principle)
- Re-validate the corrected layout

This guarantees **no layout leaves the edge function with overrun violations**.

### 2. Edge Function: Add retry on validation failure

If correction produces too many runs or looks worse than the original, retry the AI call once with a shorter, more aggressive prompt that includes the specific failure: "Your previous attempt had slots with 1025 overrun. The max is 250. Fix this."

### 3. Strengthen AI Prompt

Update the system prompt with:
- A concrete numeric example showing the overrun math: "If labelsPerSlotPerFrame=168 and quantity_in_slot=5000, frames=ceil(5000/168)=30, actualOutput=30×168=5040, overrun=5040-5000=40. That's OK. But if another slot in the same run has quantity_in_slot=1000, its overrun=5040-1000=4040. That is NOT OK."
- Move the overrun constraint to the very top of the prompt (primacy bias)
- Add: "Before returning, mentally verify EVERY slot's overrun. If any slot's overrun > maxOverrun, split that run."

### 4. Client-side: Surface correction info

When the edge function corrects a layout, include a `corrected: true` flag and note in the response. The `buildAILayoutOption` in `useLayoutOptimizer.ts` will pass this through so the UI can show "AI layout was auto-corrected to respect overrun limits".

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/label-optimize/index.ts` | Add `correctAILayout()`, retry logic, strengthened prompt |
| `src/hooks/labels/useLayoutOptimizer.ts` | Surface correction flag in AI option reasoning |

The local algorithmic strategies already handle overrun correctly (via `fillSlotsWithBlankOption` and `balanceSlotQuantities`). This fix ensures the AI path has the same guarantee.

