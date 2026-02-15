

# Fix Three Label Production Issues

## Issue 1: Print-ready upload shows proof thumbnails first (double visual work)

**Root cause**: When a print-ready PDF is matched to existing proof children, the `PrintReadyItemCard` falls back to `proof_thumbnail_url` for the PRINT column (line 33-34 of `PrintReadyItemCard.tsx`) while print thumbnails are being generated asynchronously. This creates a visual flash of proof artwork (with dielines) before the correct print thumbnails appear.

**Fix**: Stop falling back to proof thumbnails for the print column. If there's no `print_thumbnail_url` yet, show a loading/processing state instead of the proof artwork.

### File: `src/components/labels/items/PrintReadyItemCard.tsx` (lines 32-34)

Change the print thumbnail path logic to only use `print_thumbnail_url` -- never fall back to proof artwork:

```typescript
// Print-ready thumbnail: ONLY use print_thumbnail_url (no proof fallback)
const printThumbPath = item.print_pdf_url
  ? (item.print_thumbnail_url || null)
  : null;
```

When `print_thumbnail_url` hasn't been generated yet, the card will show the existing "No print file" placeholder or a spinner, which is correct behavior while thumbnails are being processed.

---

## Issue 2: "Start Printing" should be at order level, not per-run

**Root cause**: The `RunDetailModal` has per-run "Start Printing" and "Complete Run" buttons. Since all runs in a label order print sequentially on the same roll, the printing action should be at the order level (in `LabelRunsCard`), not per individual run.

**Fix**: 
- Move "Start Printing" to the `LabelRunsCard` header (order level), replacing the current "Send to Print" button position after imposition is done.
- When "Start Printing" is clicked at the order level, mark ALL runs as `printing` status.
- Add an order-level "Complete All Runs" button that marks all printing runs as `completed`.
- In `RunDetailModal`, remove the "Start Printing" button but keep "Complete Run" for recording actual meters on individual runs.

### File: `src/components/labels/LabelRunsCard.tsx`

Add order-level printing controls after the existing "Send to Print" / "All Imposed" logic:

- After all runs are approved/imposed, show a "Start Printing" button that sets all runs to `printing`.
- When all runs are printing, show a "Complete All" button.
- Use the existing `useUpdateRunStatus` hook in a loop for all runs.

### File: `src/components/labels/production/RunDetailModal.tsx`

- Remove the "Start Printing" button (line 242-254). Individual runs no longer start independently.
- Keep the "Complete Run" button for recording per-run actual meters (useful for waste tracking).
- Update `canStart` logic -- runs no longer start individually.

---

## Issue 3: No drag-and-drop to reorder items within runs

**Root cause**: After the AI optimizer creates runs with slot assignments, there's no UI to rearrange which artwork is in which slot. If artwork was matched incorrectly (e.g., page 1 ended up where page 3 should be), the operator has no way to fix it.

**Fix**: Add drag-and-drop reordering to the slot assignments list in `RunDetailModal`. This allows operators to swap item positions within a run after the AI layout is created.

### File: `src/components/labels/production/RunDetailModal.tsx`

- Make the "Slot Assignments" section (lines 160-176) drag-and-drop sortable using `@dnd-kit/sortable`.
- When slots are reordered, update the run's `slot_assignments` JSON in the database via a new mutation.
- Add visual drag handles to each slot row.

### File: `src/hooks/labels/useLabelRuns.ts`

- Add a new `useUpdateRunSlots` mutation that updates just the `slot_assignments` column for a given run.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/labels/items/PrintReadyItemCard.tsx` | Remove proof fallback for print thumbnail |
| `src/components/labels/LabelRunsCard.tsx` | Add order-level "Start Printing" and "Complete All" buttons |
| `src/components/labels/production/RunDetailModal.tsx` | Remove per-run Start, add drag-and-drop slot reordering |
| `src/hooks/labels/useLabelRuns.ts` | Add `useUpdateRunSlots` mutation |

