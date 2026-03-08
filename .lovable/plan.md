

# Fix: AI Layout Engine Creating Runs with Excessive Blank Slots

## Problem

The current blank-slot logic is brain-dead. When 4 items need to fill 9 slots, instead of spreading them across 8 slots (2 each, 1 blank), it puts each item in 1 slot and leaves 5 blank. No print shop would ever run a roll 55% blank. The user's rule is simple: **distribute items across as many slots as possible to minimize blanks** — split quantities to fill the roll.

## Root Causes

1. **`fillSlotsWithBlankOption`** (layoutOptimizer.ts line 172-213): Falls back to "1 item = 1 slot, rest blank" when round-robin breaches overrun. Never tries to spread items across multiple slots.
2. **AI prompt** tells the model "Blank slots are VALUABLE" and "It is ALWAYS better to have blank slots than to violate overrun" — this encourages the AI to be lazy and leave slots blank instead of thinking harder.
3. **`correctAILayout`** (edge function line 140-281): When creating corrective runs for orphaned items, puts each item in a single slot with the rest blank — same problem.

## Solution

### 1. Rewrite `fillSlotsWithBlankOption` → Smart Slot Spreading (layoutOptimizer.ts)

When items < totalSlots, distribute items evenly across slots:
- 4 items, 9 slots → items get 2-2-2-2 slots = 8 filled, 1 blank
- 3 items, 9 slots → items get 3-3-3 slots = 9 filled, 0 blank
- Each item's quantity is split across its allocated slots (qty / numSlots per item)

```typescript
function fillSlotsWithBlankOption(itemSlots, totalSlots, config, maxOverrun) {
  // Try round-robin first
  const normal = fillAllSlots(itemSlots, totalSlots);
  if (validateRunOverrun(normal, config, maxOverrun)) return normal;

  // Spread items: allocate floor(totalSlots / numItems) slots each, remainder gets +1
  const n = itemSlots.length;
  const baseSlots = Math.floor(totalSlots / n);
  const extra = totalSlots % n;
  
  const assignments = [];
  let slotIdx = 0;
  for (let i = 0; i < n; i++) {
    const slotsForItem = baseSlots + (i < extra ? 1 : 0);
    const qtyPerSlot = Math.ceil(itemSlots[i].quantity / slotsForItem);
    let remaining = itemSlots[i].quantity;
    for (let s = 0; s < slotsForItem; s++) {
      assignments.push({
        slot: slotIdx++,
        item_id: itemSlots[i].item_id,
        quantity_in_slot: Math.min(qtyPerSlot, remaining),
        needs_rotation: itemSlots[i].needs_rotation || false,
      });
      remaining -= Math.min(qtyPerSlot, remaining);
    }
  }
  // Fill any leftover slots as blank (should be 0 or 1 at most)
  while (slotIdx < totalSlots) {
    assignments.push({ slot: slotIdx++, item_id: itemSlots[0].item_id, quantity_in_slot: 0, needs_rotation: false });
  }
  return assignments;
}
```

### 2. Fix `correctAILayout` Corrective Runs (edge function)

When creating corrective runs for orphaned items, spread them across all available slots instead of dumping each into 1 slot with 8 blank. Use the same "slots per item = floor(totalSlots / numItems)" logic.

### 3. Rewrite AI Prompt (edge function)

Remove "Blank slots are VALUABLE" and "ALWAYS better to have blank slots". Replace with:

- "MINIMIZE blank slots. If you have N items for a run, spread each item across floor(totalSlots/N) slots by splitting its quantity. Example: 4 items in 9 slots → 2 slots each (8 filled, 1 blank), NOT 4 filled + 5 blank."
- "Maximum 1-2 blank slots per run is acceptable. More than 2 blank slots means you should redistribute."
- "If a run would have >2 blank slots, SPLIT the filled items across more slots to use the capacity."
- Keep the overrun constraint but frame blanks as a last resort, not a feature.

### 4. Add Slot Utilization Metric

Add a `slot_utilization` check in validation: if any run has >2 blank slots, flag it as a warning so the corrector can redistribute.

## Files Changed

| File | Change |
|------|--------|
| `src/utils/labels/layoutOptimizer.ts` | Rewrite `fillSlotsWithBlankOption` to spread items across slots |
| `supabase/functions/label-optimize/index.ts` | Fix corrective runs + rewrite prompt to minimize blanks |

