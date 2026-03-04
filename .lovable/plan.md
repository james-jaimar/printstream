

# Merge Trimming Stages into Single Queue on Finishing Dashboard

## Problem
The trimming operator sees 3 separate columns (Book Cutting, Final Trimming, Pre Trim) but doesn't know which job to do first across them. These stages run on the same guillotines and must be worked in order — whichever job's predecessor finished first should be next, regardless of which trimming stage it is.

## Solution
In `FinishingKanbanDashboard.tsx`, detect trimming-related stages and merge them into a single "Trimming" queue column. Jobs from all three stages appear in one unified list, sorted by workflow priority (which already accounts for due date, status urgency, and WO number).

## Implementation

### File: `src/components/tracker/factory/FinishingKanbanDashboard.tsx`

1. **Define trimming keywords** — a constant array: `['book cutting', 'final trimming', 'pre trim', 'trimming']`

2. **Merge trimming configs** — after building `QUEUE_CONFIGS` from `consolidatedStages`, detect which configs match trimming keywords. If 2+ match, replace them with a single merged config:
   - ID: `trimming-merged`
   - Title: `Trimming`
   - Icon: Scissors
   - Store the original stage IDs in a `mergedStageIds` set

3. **Merge jobs** — in `queueJobs`, for the merged config, collect jobs from ALL original trimming stage IDs into one list. Sort using `sortJobsByWorkflowPriority`.

4. **Stage toggle** — the merged "Trimming" appears as one toggle item instead of three. Users can still toggle it on/off.

5. **Visual indicator** — show a small badge or subtitle on each job card's stage name so the operator can see which specific trimming operation is needed (e.g., "Book Cutting" vs "Pre Trim") within the unified queue.

### No other files need changes
- The stage toggle hook works with whatever configs it receives
- The `DtpKanbanColumnWithBoundary` renders whatever jobs it gets
- Sorting already handles cross-stage priority correctly

