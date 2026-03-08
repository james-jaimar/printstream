

# Smarter AI Layout Engine: Blank Slot Strategy & Trade-off Suggestions

## Problem

The AI optimizer sometimes violates the `maxOverrun` constraint (e.g., producing 1,000+ overrun when the user set 250). When it can't fit items within the overrun limit, it should **leave slots blank** rather than force-filling them. Additionally, the AI lacks awareness of practical roll-size preferences and doesn't surface trade-off reasoning to the operator.

## What Changes

### 1. Enforce Blank Slots When Overrun Exceeds Limit (Local Algorithm)

**File: `src/utils/labels/layoutOptimizer.ts`**

Currently `fillAllSlots` (line 134) always round-robins items to fill every slot. The core rule "every slot must be filled" was originally a hard constraint, but the equal-quantity strategy already allows `quantity_in_slot = 0` slots.

**Change**: Update the greedy optimizer (`createOptimizedRuns`) and ganged strategy to allow blank slots (qty=0, using an existing item_id) when filling would breach `maxOverrun`. The `validateRunOverrun` function already detects this — instead of just returning false, the strategies should proactively leave those slots blank.

Add a new helper `fillSlotsWithBlankOption` that:
- Assigns items to slots up to `totalSlots`
- For remaining slots where round-robin would create overrun > maxOverrun, assigns qty=0 (blank) using an existing item_id
- Adds a note: "X blank slot(s) available for internal labels or other jobs"

### 2. AI Trade-off Suggestions (New Data Structure)

**File: `src/types/labels.ts`**

Add to `LayoutOption`:
```typescript
trade_offs?: {
  blank_slots_available: number;
  blank_slot_note?: string;       // "2 blank slots — use for internal labels or another job"
  roll_size_note?: string;        // "At 300/roll, consider bumping to 500 for client convenience"
  overrun_warnings?: string[];    // Per-slot warnings that exceeded soft limits
}
```

### 3. Enhanced AI Prompt (Edge Function)

**File: `supabase/functions/label-optimize/index.ts`**

Update the system prompt to include:
- **Blank slot guidance**: "If placing an item in a slot would cause overrun > maxOverrun, leave the slot blank (quantity_in_slot=0). Blank slots are useful — the operator can fill them with internal labels or other short jobs."
- **Roll size reasoning**: Pass `qty_per_roll` to the edge function. Add prompt guidance: "If qty_per_roll is not specified, suggest a sensible default based on label size (small labels <50mm: ~1000/roll, medium 50-100mm: ~500/roll, large >100mm: ~250/roll). Note your suggestion in reasoning."
- **Trade-off communication**: Add a `trade_offs` field to the `create_layout` tool schema so the AI can return structured suggestions alongside the layout.

Update the tool schema to include:
```json
"trade_offs": {
  "type": "object",
  "properties": {
    "blank_slots_available": { "type": "number" },
    "blank_slot_note": { "type": "string" },
    "roll_size_note": { "type": "string" },
    "overrun_warnings": { "type": "array", "items": { "type": "string" } }
  }
}
```

### 4. Pass `qtyPerRoll` and Label Dimensions to AI

**File: `src/hooks/labels/useLayoutOptimizer.ts`**

Update `fetchAILayout` to include `qty_per_roll` and label dimensions in the edge function request body so the AI can reason about roll sizes.

**File: `supabase/functions/label-optimize/index.ts`**

Add `qty_per_roll` and label dimensions to the `OptimizeRequest` interface and include them in the prompt.

### 5. Display Trade-offs in UI

**File: `src/components/labels/optimizer/LayoutOptionCard.tsx`**

Add a section below the reasoning text that shows trade-off badges/notes:
- Amber badge: "2 blank slots available" with tooltip "Can be used for internal labels or another job"
- Info note for roll size suggestions
- Warning badges for overrun issues

### 6. Local Algorithm: Annotate with Trade-offs

**File: `src/utils/labels/layoutOptimizer.ts`**

In `annotateRunsWithRollInfo` and `createLayoutOption`, populate the new `trade_offs` field by:
- Counting slots with `quantity_in_slot = 0` across all runs
- Adding roll size notes when `qtyPerRoll` is not set (derive suggestion from label dimensions)
- Collecting overrun warnings that already exist but aren't surfaced

## Summary of Files

| File | Change |
|------|--------|
| `src/types/labels.ts` | Add `trade_offs` to `LayoutOption` |
| `src/utils/labels/layoutOptimizer.ts` | Blank-slot support in strategies + trade-off annotations |
| `supabase/functions/label-optimize/index.ts` | Enhanced prompt + trade_offs in tool schema |
| `src/hooks/labels/useLayoutOptimizer.ts` | Pass qtyPerRoll & dimensions to AI |
| `src/components/labels/optimizer/LayoutOptionCard.tsx` | Render trade-off notes/badges |

