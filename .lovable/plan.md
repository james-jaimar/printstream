

# Surface AI Layout Reasoning for Debugging

## Problem
The AI layout optimizer returns detailed per-run reasoning and overall strategy explanations, but most of this is lost:
1. **Per-run reasoning** — each AI run has a `reasoning` string, but `buildAILayoutOption()` in `useLayoutOptimizer.ts` discards it
2. **Validation warnings & correction notes** — returned by the edge function but only logged to console
3. **No way to inspect** what items/quantities the AI received as input, or why it made specific slot assignments

## Plan

### 1. Preserve per-run reasoning in `ProposedRun` type (`src/types/labels.ts`)
- Add `reasoning?: string` to `ProposedRun` interface

### 2. Pass per-run reasoning through in `useLayoutOptimizer.ts`
- In `buildAILayoutOption()`, copy `aiRun.reasoning` into each `ProposedRun`
- Store validation warnings and correction notes on the LayoutOption (add `debug_info?: { validation_warnings: string[]; correction_notes: string[]; }` to `LayoutOption`)

### 3. Display reasoning in `RunLayoutDiagram` (`src/components/labels/optimizer/RunLayoutDiagram.tsx`)
- Show the run's `reasoning` text below the diagram stats (small italic text, similar to how `LayoutOptionCard` shows reasoning)

### 4. Add a "Debug / AI Reasoning" collapsible section to `LayoutOptionCard`
- Collapsible `<Collapsible>` at the bottom of the card showing:
  - Per-run reasoning for each run
  - Validation warnings (if any)
  - Correction notes (if any)
  - The items & quantities the AI was given as input

### Files
| File | Change |
|------|--------|
| `src/types/labels.ts` | Add `reasoning?` to `ProposedRun`, add `debug_info?` to `LayoutOption` |
| `src/hooks/labels/useLayoutOptimizer.ts` | Pass per-run reasoning through; capture validation/correction data |
| `src/components/labels/optimizer/RunLayoutDiagram.tsx` | Show run reasoning |
| `src/components/labels/optimizer/LayoutOptionCard.tsx` | Add collapsible debug section |

