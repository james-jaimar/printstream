

# Schedule Board: Move-to-Date Actions + Collapsible Sidebar

## Problem

1. Orders stuck in past weeks can't be dragged to the current week since D&D only works within the visible 5-day range. Need a "Move to date" action on individual orders and on material group headers.
2. The left sidebar takes up 260px permanently -- on the schedule board page you need maximum horizontal space.

## Changes

### 1. Add "Move to Date" to the Order Detail Modal

**File: `src/components/labels/schedule/ScheduleOrderDetailModal.tsx`**

- Add a date picker (using `react-day-picker` / the existing `Calendar` + `Popover` UI components) at the bottom of the modal
- "Move to" button beside it that reschedules all the order's schedule entries to the chosen date
- Also add an "Unschedule" button to remove from the schedule entirely
- After moving, close the modal and show a toast confirmation

### 2. Add "Move All" action on MaterialColumn header

**File: `src/components/labels/schedule/MaterialColumn.tsx`**

- Add a small calendar icon button in the material column header (next to the grip handle)
- Clicking it opens a popover with a date picker
- Selecting a date reschedules ALL orders in that material group to the chosen date
- This covers the use case: "move these 5 Silver PP orders from last Monday to this Friday"

### 3. Collapsible Sidebar in LabelsLayout

**File: `src/components/labels/LabelsLayout.tsx`**

- Add a `collapsed` state (boolean, default `false`)
- When collapsed: sidebar shrinks to ~56px, showing only icons (no text labels)
- Add a toggle button (chevron) at the top of the sidebar to collapse/expand
- The toggle remains visible in both states
- When on the schedule page specifically, the sidebar could auto-start collapsed (optional enhancement)
- Transition animated with `transition-all duration-300`

### 4. Wire up reschedule mutations in modal and material column

**File: `src/components/labels/schedule/LabelScheduleBoard.tsx`**

- Pass `rescheduleOrder` and `unscheduleOrder` mutation functions down to the modal and material columns (or import hooks directly in those components)
- The modal's "Move to" triggers `rescheduleOrder.mutate(...)` with the selected date
- The material column's "Move All" triggers `rescheduleOrder.mutate(...)` for each order in the group

## Technical Details

### Modal date picker

Uses the existing `Popover` + `Calendar` components from shadcn/ui (already installed). The "Move to" section appears as a row at the bottom of the modal:

```
[Calendar icon] [Selected date display] [Move button]
[Unschedule button]
```

### Material column "Move All" popover

A small `Popover` triggered by a calendar icon button in the material header. Contains just the `Calendar` component. On date select, batch-reschedules all orders.

### Collapsed sidebar

The sidebar transitions between two widths:
- Expanded: `w-[260px]` -- full nav with text labels
- Collapsed: `w-[60px]` -- icons only, tooltips on hover

The brand area shows just the logo when collapsed. The nav items hide their text labels. The footer "Back to Tracker" shows just the chevron icon.

## File Summary

| File | Change |
|------|--------|
| `src/components/labels/schedule/ScheduleOrderDetailModal.tsx` | Add date picker + "Move to" and "Unschedule" buttons |
| `src/components/labels/schedule/MaterialColumn.tsx` | Add calendar popover on header for "Move All to date" |
| `src/components/labels/LabelsLayout.tsx` | Add collapsible sidebar with icon-only mini state |

