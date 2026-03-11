

# Fix: Enforce Max Overrun as a Hard Constraint

## Root Cause

The architecture is actually clean now — no post-processing layers fighting each other. The problem is simpler: **the AI ignores the overrun constraint**. It assigns quantities to slots without computing the actual frame-based output, resulting in overruns of 502, 600, 1000, and 1200 against a max of 250.

The current prompt says "HARD LIMIT" but the AI doesn't do the math. It needs to be taught *how* to verify its own work, and if it still fails, we need a retry with concrete feedback.

## Changes

### 1. Rewrite the AI prompt to teach the math explicitly (`supabase/functions/label-optimize/index.ts`)

Current prompt explains the physics but doesn't show the AI how to check its own work. New prompt will include:

```text
HOW TO CHECK YOUR WORK:
For each run, find the HIGHEST quantity_in_slot across all slots.
frames = ceil(highest_qty / {labelsPerSlotPerFrame})
actual_output_per_slot = frames × {labelsPerSlotPerFrame}
overrun_for_each_slot = actual_output_per_slot − that_slot's_quantity_in_slot
If ANY overrun > {maxOverrun}, you MUST split the item across more slots or move it to a different run.

EXAMPLE: If labelsPerSlotPerFrame=16, maxOverrun=250
  Slot A: 5300, Slot B: 700 → frames = ceil(5300/16) = 332
  actual = 332×16 = 5312 → Slot B overrun = 5312−700 = 4612 ← VIOLATION
  FIX: Move Slot B item to a run where the highest qty is closer to 700.
```

This gives the AI a concrete algorithm to self-check.

### 2. Add a single retry with violation feedback (`supabase/functions/label-optimize/index.ts`)

If `validateLayout()` returns overrun violations, make ONE more AI call with the specific violations as feedback:

```text
"Your layout has these overrun violations:
- Run 1, slot X: overrun 502 > max 250
- Run 2, slot Y: overrun 1200 > max 250
Fix these by splitting high-overrun items into separate runs or spreading across more slots.
Return a corrected layout."
```

This is not "post-processing" — it's asking the AI to fix its own mistake with concrete data. If retry still fails, return the result with warnings for human review.

### 3. No changes to the hook or utilities

The hook (`useLayoutOptimizer.ts`) and utilities (`layoutOptimizer.ts`) are clean. No post-processing exists. The only issue is the quality of the AI's output.

## Files

| File | Change |
|------|--------|
| `supabase/functions/label-optimize/index.ts` | Rewrite prompt with self-check algorithm + add single retry with violation feedback |

