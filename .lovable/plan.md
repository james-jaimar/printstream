

# Add Printer Reassignment Modal to Production Manager and Schedule Board

## Overview

Add a "Move Jobs Between Printers" button to both the Production Manager view and the Schedule Board header, giving quick access to the existing PrinterReassignmentModal from these two additional locations.

## Changes

### 1. Production Manager Header -- add button

Add an `ArrowLeftRight` (or `Printer`) icon button to the toolbar in `ProductionManagerHeader.tsx`, next to the existing Refresh button. Clicking it calls a new `onPrinterReassignment` callback.

### 2. Production Manager View -- wire up modal

In `ProductionManagerView.tsx`:
- Add state: `showPrinterReassignment` (boolean)
- Pass `onPrinterReassignment` callback to the header
- Render `PrinterReassignmentModal` with `isOpen={showPrinterReassignment}` and close handler
- Only show the button when `isAdmin` is true (pass this flag to the header)

### 3. Schedule Board Header -- add button

Add the same "Move Jobs Between Printers" button to `ScheduleWorkflowHeader.tsx`, next to the Reschedule All button. Pass an `onPrinterReassignment` callback prop.

### 4. Schedule Board -- wire up modal

In `ScheduleBoard.tsx`:
- Add state: `showPrinterReassignment` (boolean)
- Pass callback to `ScheduleWorkflowHeader`
- Render `PrinterReassignmentModal` at the bottom alongside the other modals
- Only show when `isAdminUser` is true

## Files to Modify

1. **`src/components/tracker/views/components/ProductionManagerHeader.tsx`** -- Add button + `onPrinterReassignment` prop
2. **`src/components/tracker/views/ProductionManagerView.tsx`** -- Add state, pass callback, render modal
3. **`src/components/schedule/header/ScheduleWorkflowHeader.tsx`** -- Add button + `onPrinterReassignment` prop
4. **`src/components/schedule/ScheduleBoard.tsx`** -- Add state, pass callback, render modal

No new files needed. The modal and hook already exist and work correctly.

