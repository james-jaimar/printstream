
# Replace Algorithmic Optimizer with AI-Computed Layout

## The Problem

The local algorithm (`createOptimizedRuns`) has been rewritten three times and still produces 7 individual runs for an order that should clearly be 2-3 runs. The edge function AI only returns a high-level suggestion ("ganged"/"individual"/"hybrid") but never computes actual slot assignments.

## Solution

Have the AI return **actual run layouts** with specific slot assignments, item IDs, and quantities. The AI can reason about the math (e.g., "7 items, 5 slots, maxOverrun 250 -- put the 5 most similar quantities together") far more reliably than the buggy bin-packing algorithm.

## Changes

### 1. Edge Function: Return actual runs (not just a suggestion)

**File: `supabase/functions/label-optimize/index.ts`**

Update the tool-call schema so the AI returns structured run data:

```text
tools: [{
  function: {
    name: "create_layout",
    parameters: {
      runs: [{
        slot_assignments: [{
          item_id: string,    // actual item ID from the input
          quantity_in_slot: number  // how many labels this slot prints
        }],
        reasoning: string
      }],
      overall_reasoning: string,
      estimated_waste_percent: number
    }
  }
}]
```

The system prompt will include:
- All item IDs and quantities (so the AI can reference them in assignments)
- The dieline config (slots, labelsPerSlotPerFrame calculated server-side)
- The maxOverrun constraint
- Clear instructions: "Return exactly which items go in which slots for each run, with quantities. Every run must have exactly N slot assignments. All slots must be filled."

The edge function will also **validate** the AI's output before returning:
- Every run has exactly `totalSlots` assignments
- All item quantities are accounted for (no items dropped, no over-allocation)
- No slot overrun exceeds maxOverrun
- If validation fails, return the AI result with a warning flag

### 2. Hook: Add AI-computed layout option

**File: `src/hooks/labels/useLayoutOptimizer.ts`**

Update `fetchAISuggestion` to parse the new structured response and create a proper `LayoutOption` from the AI's runs. This becomes a first-class layout option (alongside the existing algorithmic ones) called "ai-computed".

The AI-computed option will:
- Use the slot assignments directly from the AI
- Calculate frames/meters using existing `calculateFramesForSlot` and `calculateMeters` helpers
- Score using the existing `scoreLayout` function
- Appear in the options list alongside algorithmic options

### 3. UI: Single "Generate" button does both

**File: `src/components/labels/LayoutOptimizer.tsx`**

When the user clicks "Generate Layout Options":
1. Fire both the local algorithm AND the AI edge function in parallel
2. Merge results: algorithmic options + AI-computed option
3. Auto-select the best-scoring option (which should now be the AI one)
4. The separate "Get AI Suggestion" button is removed -- AI is always part of generation

The AI suggestion card (`AISuggestionCard`) is kept for showing the AI's reasoning/tips, but the main value is now the actual computed layout.

### 4. Keep algorithmic options as fallback

The local algorithm (`createOptimizedRuns`, `createGangedRuns`, etc.) stays as-is. It provides instant results while the AI call is in flight, and serves as a fallback if the AI call fails (rate limit, credits, network). The AI-computed option simply appears alongside the algorithmic ones.

## Expected Result for LBL-2026-0016

The AI receives:
- Items: Page1=250, Page2=200, Page3-7=150 each (with actual IDs)
- 5 slots, labelsPerSlotPerFrame=4, maxOverrun=250

The AI reasons: "250, 200, 150, 150, 150 all fit within 250 of each other. Put 5 items on Run 1 (one per slot). Remaining 150, 150: put both on Run 2 filling all 5 slots round-robin."

Returns 2 runs with exact slot assignments. The frontend converts this into a `LayoutOption` and displays it.

## File Summary

| File | Change |
|------|--------|
| `supabase/functions/label-optimize/index.ts` | New tool schema returning actual runs with slot assignments; server-side validation of AI output; calculate labelsPerSlotPerFrame for accurate prompting |
| `src/hooks/labels/useLayoutOptimizer.ts` | Parse AI runs into LayoutOption; fire AI call during generateOptions; merge AI option into options list |
| `src/components/labels/LayoutOptimizer.tsx` | Remove separate "Get AI Suggestion" button; generate triggers both algorithm + AI in parallel; show AI option in the list |
| `src/components/labels/optimizer/AISuggestionCard.tsx` | Minor update to display AI reasoning from the new response format |
