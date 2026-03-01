

# Expedite Job: Scheduler-Level Priority with Next-Day Constraint

## Overview

Allow admins to expedite a job so it gets scheduled first, starting no earlier than 08:00 on the next working day. This works by modifying the scheduler's job ordering to respect the existing `is_expedited` flag, then auto-triggering a reschedule. No timestamp manipulation needed.

## What Changes

### 1. Database Migration: Fix the Scheduler ORDER BY

The scheduler function `scheduler_reschedule_all_parallel_aware` currently orders jobs purely by `proof_approved_at` (line 145 of the function). We change this single line to:

```sql
ORDER BY 
  pj.is_expedited DESC NULLS LAST,
  pj.expedited_at ASC NULLS LAST,
  pj.proof_approved_at ASC
```

This ensures:
- Expedited jobs are always scheduled first, regardless of their original proof approval date
- Multiple expedited jobs are ordered by when they were expedited (first request wins)
- Non-expedited jobs continue in normal FIFO order
- Incomplete jobs from previous days cannot jump ahead of an expedited job -- the `is_expedited` flag always wins over any `proof_approved_at` timestamp

### 2. Update useJobExpediting Hook

After successfully expediting (or removing expedite status), automatically trigger the `simple-scheduler` edge function to rebuild the schedule. This ensures the schedule board immediately reflects the new priority.

The hook will:
- Call the existing `expedite_job_factory_wide` RPC (already sets `is_expedited = true`, `expedited_at`, reason, etc.)
- Then call `supabase.functions.invoke('simple-scheduler', { body: { commit: true, nuclear: true } })`
- Same for `removeExpediteStatus` -- restore normal priority and reschedule

### 3. Add Expedite Button to Schedule Board Cards

Add a lightning bolt button to `SortableScheduleStageCard.tsx` for admin users. This opens the existing `ExpediteJobDialog` directly from the schedule board.

The card component needs:
- A new `onExpedite` callback prop
- A `Zap` icon button (red, small) visible only to admins
- The button stops event propagation so it doesn't trigger the card click

### 4. Wire Up in ScheduleBoard

Pass the expedite handler and dialog state through the component tree so clicking "Expedite" on a card opens the dialog and triggers a reschedule on completion.

## Why This Solves the Carry-Over Problem

The user correctly identified that manipulating `proof_approved_at` would fail when Monday's incomplete jobs carry over to Tuesday -- their earlier timestamps would jump ahead of the expedited job. By using a dedicated `is_expedited` flag in the ORDER BY, expedited jobs ALWAYS come first regardless of any other job's timestamp. The overnight cron (which does a nuclear reschedule) will also respect this ordering.

## Next-Day Constraint

The scheduler already handles this naturally: when called mid-day, it starts scheduling from the current time (or next working start). Since expedited jobs will be first in the queue, they'll get the earliest available slots -- which will be on the current or next working day depending on remaining capacity. The existing `ExpediteJobDialog` can be kept simple since the scheduler handles placement automatically.

## Files to Modify

1. **New SQL migration** -- Change the ORDER BY in `scheduler_reschedule_all_parallel_aware` (single line change)
2. `src/hooks/tracker/useJobExpediting.tsx` -- Add auto-reschedule after expedite/remove
3. `src/components/schedule/day-columns/SortableScheduleStageCard.tsx` -- Add expedite button for admins
4. `src/components/schedule/ScheduleBoard.tsx` -- Wire expedite dialog and refresh

