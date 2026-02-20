
# Fix: Order Modal Not Showing Redesigned Specs Page

## Root Cause Found

The issue is a single CSS class conflict on the `DialogContent` wrapper in `LabelOrderModal.tsx` at **line 448**:

```tsx
// CURRENT (broken):
<DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto p-0">
```

The inner layout (line 473) uses `flex flex-col h-full` to create a fixed-height flex container with:
- A **sticky header** (with the tabs)
- A **`flex-1` scrollable content area** (where `OrderSpecsPage` lives)

But `overflow-y-auto` on the `DialogContent` means the dialog scrolls its own content rather than being a fixed box. As a result:

- `h-full` on the inner `div` resolves to the content height (not the viewport height), so `flex-1` never gets space to grow
- The `OrderSpecsPage` content renders but collapses to zero height
- The tabs appear but the page body below them is invisible

The user sees the old-looking modal (or nothing below the header) because the content area never has height.

## The Fix — One Line Change

Change `overflow-y-auto` to `overflow-hidden` on the `DialogContent`:

```tsx
// FIXED:
<DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-hidden p-0">
```

This makes the `DialogContent` a fixed-size box. The inner `flex flex-col h-full` then correctly:
1. Fills the full 90vh height
2. Keeps the sticky header at the top
3. Gives `flex-1` to the scrollable content area (where `OrderSpecsPage` renders)

## Why This Wasn't Caught Earlier

The old modal layout was a single long scroll — `overflow-y-auto` worked fine for it. The new two-tab layout requires the dialog to be a fixed box (not a scroller itself), because the scrolling happens inside the content area. The migration to the new layout should have updated this class.

## File Changed

| File | Line | Change |
|------|------|--------|
| `src/components/labels/order/LabelOrderModal.tsx` | 448 | `overflow-y-auto` → `overflow-hidden` |

That's the only change needed. The `OrderSpecsPage` component itself is correctly implemented — it just hasn't been visible due to this layout constraint.
