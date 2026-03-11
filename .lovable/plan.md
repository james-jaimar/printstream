

# Fix: Run 9 Blank Slot Failure + Imposition Speed

## Issues Found

### 1. Run 9 fails because blank slot has empty `item_id`

Run 9 (the last run) has a legitimate blank slot from the solver:
```json
{"slot": 3, "item_id": "", "quantity_in_slot": 0}
```

In `useBatchImpose.ts` line 180-192, when mapping slot assignments, the code tries to find an item with `id === ""`, which returns `undefined`, so `pdf_url` becomes `''`. The guard at line 192 then rejects the entire run because it finds a slot with no `pdf_url`.

**Fix**: Filter out blank slots (where `item_id` is empty or `quantity_in_slot` is 0) before the empty-URL check. Blank slots are valid — the VPS just won't get artwork for that position. Only check slots that actually have an item assigned.

### 2. Slowness: 5-second inter-run delay × 9 runs = 40+ seconds of pure waiting

The `INTER_RUN_DELAY_MS = 5000` was set conservatively. With 9 runs, that's 40 seconds of idle delay alone, on top of actual VPS processing time.

**Fix**: Reduce `INTER_RUN_DELAY_MS` from 5000 to 2000ms. The VPS logs show each run completes in under 1 second ("VPS responded immediately"). A 2-second gap is still generous.

## File Changes

### `src/hooks/labels/useBatchImpose.ts`

1. **Line 29**: Change `INTER_RUN_DELAY_MS` from `5000` to `2000`

2. **Lines 191-192**: Filter out blank/empty slots before checking for missing PDFs:
   ```typescript
   const filledSlots = slotAssignments.filter(s => s.item_id && s.quantity_in_slot > 0);
   const emptySlots = filledSlots.filter(s => !s.pdf_url);
   ```
   
3. **Lines 180-188**: When mapping slots, skip blank slots (empty `item_id`) so they aren't sent to the VPS at all — or mark them distinctly so the edge function knows they're intentional blanks.

No other files change.

