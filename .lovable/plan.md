

# Fix: Scroll, Arrow Buttons, and Drag-and-Drop in Multi-Shift Dialog

## Problems

1. **Scroll not working**: Radix `ScrollArea` with `flex-1 min-h-0` doesn't properly constrain height inside the dialog's flex layout. The viewport never gets a computed height, so it never scrolls.

2. **Arrow buttons not working**: The buttons use `size="icon"` with `h-5 w-5` — they're extremely small (20x20px). The click target is tiny and may be clipped. Also, there's no visual feedback that a reorder happened.

3. **DnD not implemented**: The `GripVertical` icon is purely decorative — there's no `DndContext`, `SortableContext`, or `useSortable` wired up. The existing `AutoReorderConfirmDialog` has a working DnD pattern we can reuse.

## Fix — Single File Change

**`src/components/schedule/dialogs/MultiShiftGroupingDialog.tsx`**:

1. **Scroll**: Replace `<ScrollArea className="flex-1 min-h-0">` with a plain `<div className="flex-1 min-h-0 overflow-y-auto">`. This is reliable inside flex containers — Radix ScrollArea struggles here.

2. **Arrow buttons**: Increase button size from `h-5 w-5` to `h-7 w-7` and icon from `h-3 w-3` to `h-4 w-4`.

3. **DnD**: Wire up `@dnd-kit/core` + `@dnd-kit/sortable` (already installed, already used in `AutoReorderConfirmDialog`):
   - Wrap the group list in `DndContext` + `SortableContext`
   - Extract each group card row into a small sortable wrapper using `useSortable`
   - On `dragEnd`, reorder `orderedGroups` using `arrayMove`
   - Keep the arrow buttons as an alternative reorder method

