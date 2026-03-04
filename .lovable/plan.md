
# Hide "Reschedule All" Button for Viewer Role

## Problem
The "Reschedule All" button is always rendered in `ScheduleWorkflowHeader`, regardless of user role. While `ScheduleBoardPage` passes `onReschedule` as `undefined` for read-only users, the header component ignores this and always shows the button.

## Fix

**Two files to change:**

1. **`src/components/schedule/ScheduleBoard.tsx`** — Make `onReschedule` optional in the interface (`onReschedule?: () => void`) and only pass it to the header when defined.

2. **`src/components/schedule/header/ScheduleWorkflowHeader.tsx`** — Make `onReschedule` optional in the interface, and conditionally render the "Reschedule All" button only when `onReschedule` is provided (same pattern already used for `onPrinterReassignment`).
