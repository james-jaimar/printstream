

# Paper List Report for Daily Shifts

## What It Does
A "Paper List" button in the schedule header opens a modal where you select a day. It aggregates all printing stages for that day and produces a grouped paper requirements list showing paper type, weight, size, and total quantity of sheets/jobs — ready to hand to the paper floor manager.

## Implementation

### 1. New component: `src/components/schedule/dialogs/PaperListDialog.tsx`
- Dialog with a day selector dropdown (populated from current week's `scheduleDays`)
- On day selection, iterates all scheduled stages for that day, filtering to **printing stages only** (HP 12000, 7900, T250, etc.)
- Groups by unique combination of `paper_type + paper_weight + hp12000_paper_size`
- For each group, shows:
  - Paper description (e.g., "150gsm Gloss - Large")
  - Number of jobs
  - Total estimated minutes (as a proxy for volume)
  - List of work order numbers in that group
- Includes a "Copy to Clipboard" or "Print" button so it can be handed off

### 2. Update `src/components/schedule/header/ScheduleWorkflowHeader.tsx`
- Add a "Paper List" button with a `FileText` icon next to the existing buttons (Refresh, Reschedule, Move Printers, Multi-Shift Grouping)
- Pass `onPaperList` callback prop

### 3. Update `src/components/schedule/ScheduleBoard.tsx`
- Add state for `showPaperList` dialog
- Pass `scheduleDays` (current week) into the dialog
- Wire button callback

### Data Flow
The data is already available in `scheduleDays` — each stage card has `paper_type`, `paper_weight`, `hp12000_paper_size`, and `estimated_duration_minutes`. No new DB queries needed; it's pure client-side aggregation of existing schedule data.

### Files
| File | Change |
|------|--------|
| `src/components/schedule/dialogs/PaperListDialog.tsx` | **New** — modal with day picker + aggregated paper table |
| `src/components/schedule/header/ScheduleWorkflowHeader.tsx` | Add Paper List button |
| `src/components/schedule/ScheduleBoard.tsx` | Wire dialog state + pass props |

