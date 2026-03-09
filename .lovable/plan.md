

# Rethinking the AI Layout Prompt — Let the LLM Actually Think

## The Real Problem

The current prompt is **700+ words of contradictory micro-rules** that the AI half-follows. It says "MINIMIZE blanks" but also "blank slots are a last resort." It says "spread items" but also "EQUAL-QUANTITY RUNS." It's a rule soup — and when an LLM gets conflicting instructions, it picks whichever one it noticed last.

The result: the AI isn't *thinking* about the problem. It's trying to follow a checklist and failing.

## Current Prompt (Summary of Issues)

1. **Overrun constraint is buried in noise.** It's technically at the top but surrounded by 20+ other "CRITICAL" and "IMPORTANT" rules. When everything is critical, nothing is.
2. **The AI is told HOW to solve, not WHAT to solve.** Rules like "spread items across floor(totalSlots/N) slots each" are algorithmic instructions — if we're going to dictate the algorithm, we don't need AI. The AI should figure out the best approach.
3. **No real-world context.** The AI doesn't know what a blank slot *costs* (wasted substrate), what overrun *costs* (extra labels nobody wants), or what a changeover *costs* (20 min setup). Without cost awareness, it can't make trade-off decisions.
4. **The corrective post-processor is a band-aid.** It blanks slots and creates messy corrective runs because the AI got it wrong in the first place.

## The Fix: A Complete Prompt Rewrite

Replace the current `buildSystemPrompt` with a prompt that:

1. **Teaches the physics of the press** (how frames work, why all slots run the same length) in 3-4 sentences — not a wall of rules
2. **Defines the objective clearly**: minimize total waste labels across all runs, subject to: every ordered label is produced, no slot overruns by more than X
3. **Gives cost context**: "Each blank slot in a 9-slot run wastes 11% of substrate per frame. A run with 5 blank slots wastes 55% of substrate. An extra run costs ~20 minutes of changeover. Balance these."
4. **Provides a worked example** of a good layout vs a bad layout for a similar item mix — show, don't tell
5. **Asks the AI to reason step-by-step** before committing: "First, sort items by quantity. Then identify which items can share a run (quantities within X of each other). Then assign slots. Then verify overrun math."

### Proposed New System Prompt Structure

```
You are a print production planner for an HP Indigo digital label press.

THE PRESS:
- The press prints rolls with {totalSlots} label positions (slots) across the web.
- All slots print simultaneously. One "frame" produces {labelsPerSlotPerFrame} labels per slot.
- A run's length = ceil(max_slot_qty / {labelsPerSlotPerFrame}) frames. Every slot produces that many frames.
- Therefore: if slot A needs 5000 and slot B needs 1000, both produce ceil(5000/{labelsPerSlotPerFrame}) × {labelsPerSlotPerFrame} = {X} labels. Slot B gets {X-1000} extra labels it doesn't need. That's waste.

THE OBJECTIVE:
Produce all ordered labels with MINIMUM total waste. Waste has two forms:
1. OVERRUN waste: extra labels per slot beyond what's ordered (max {maxOverrun} per slot per run — HARD LIMIT)
2. SUBSTRATE waste: blank slots (qty=0) waste {Math.round(100/totalSlots)}% of material per blank slot per frame

THE COSTS:
- Each additional run = ~20 minutes setup + substrate for leader/trailer
- Each blank slot = {Math.round(100/totalSlots)}% material waste for every frame in that run
- Overrun beyond {maxOverrun} per slot = UNACCEPTABLE (hard constraint, not a preference)

YOUR TASK:
1. Sort items by quantity
2. Group items with similar quantities (within {maxOverrun} of each other) into the same run
3. When items share a run, spread them across ALL {totalSlots} slots to minimise blanks:
   - 4 items → ~{Math.floor(totalSlots/4)} slots each
   - Split each item's quantity evenly across its slots
4. If an item's quantity is too different from others in a run, give it its own run and spread across all {totalSlots} slots
5. VERIFY: For every run, calculate frames = ceil(max_slot_qty / {labelsPerSlotPerFrame}). Then for every slot: (frames × {labelsPerSlotPerFrame}) - slot_qty must be ≤ {maxOverrun}. If not, fix it.

{rollSizeContext}
```

### What Changes

| File | Change |
|------|--------|
| `supabase/functions/label-optimize/index.ts` | Complete rewrite of `buildSystemPrompt()` — concise, physics-first, objective-driven. Simplify user prompt. Keep correction logic as safety net but it should rarely trigger. |

### What Stays the Same

- Tool schema (unchanged)
- `correctAILayout()` post-processor (safety net, unchanged)
- Retry logic (unchanged)
- Validation function (unchanged)
- Client-side code (unchanged)
- Local algorithm in `layoutOptimizer.ts` (unchanged)

This is a **prompt-only change** — one function rewrite in the edge function. The goal is to stop treating the AI like a rule-following robot and start treating it like a thinking planner who understands the physics and economics of the press.

