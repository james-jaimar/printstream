

# Update AI Instruction Set for Label Optimizer

## What's Changing

Replace `buildSystemPrompt()` (lines 109-167) and the user message (line 297) with the new finishing-efficiency-focused instruction set provided by the team.

## Key Differences from Current Prompt

1. **Primary objective shifts** from "minimize waste/runs" to "minimize finishing pain" (rewinding, joining, awkward leftovers)
2. **Blank slots explicitly encouraged** when they improve finishing — current prompt says "minimize blank slots"
3. **Roll-size preference** (`qtyPerRoll`) gets a dedicated section with guidance on clean multiples
4. **Overrun description refined** to specify "filled slots" only (not blank ones)
5. **Rule 4 removed** ("minimize blank slots — wastes X%") — replaced with "blank slots are allowed"
6. **Rule 5 softened** — minimize runs "only when this does not worsen finishing"

## File: `supabase/functions/label-optimize/index.ts`

- **Replace `buildSystemPrompt()`** with the new prompt verbatim as provided
- **Replace user message** (line 297) with the new finishing-focused message
- Everything else stays: `validateLayout()`, `callAI()`, retry logic, `buildTools()`, `calcLabelsPerSlotPerFrame()`

No other files need changes — the hook, utilities, types, and UI components are unaffected.

