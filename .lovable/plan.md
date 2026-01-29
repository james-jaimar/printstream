
# Plan: Fix Part Assignment Manager and Schedule Orphan Detection

## Problem Summary

Two interconnected issues were identified during investigation:

### Issue 1: Part Assignment Manager Doesn't Trigger Reschedule
When an admin changes a stage's `part_assignment` (e.g., from "both" to "text" or "cover"), the job's schedule is NOT recalculated. This means:
- Parallel processing changes aren't reflected in the schedule
- The job continues with stale timing based on the old part assignment

### Issue 2: Jobs Can Become "Orphaned" (Unscheduled but Not Rescheduled)
Job D429735 had its schedule invalidated at 11:04 today via `CustomWorkflowModal`, but was never rescheduled. This left it in the FIFO queue but without any time slots, causing D429736 (the next job in line) to be blocked waiting for the T250 resource tail from D429733 instead of filling the gap.

---

## Root Cause Analysis

| Job | proof_approved_at | Last Updated | Schedule Status |
|-----|-------------------|--------------|-----------------|
| D429733 | 13:46:55.609 | 03:00:08 (cron) | Scheduled |
| D429735 | 13:46:56.014 | 11:04:44 (manual) | Unscheduled (orphaned) |
| D429736 | 13:46:56.239 | 03:00:08 (cron) | Scheduled |

D429735's schedule was cleared at 11:04:44 but no reschedule followed. Since D429735 is between D429733 and D429736 in FIFO order, D429736's T250 stage is waiting for T250's resource tail which was set by D429733 (ending at 14:06 on Jan 29).

---

## Solution: Two-Part Fix

### Part A: Add Reschedule to JobPartAssignmentManager

Enhance `src/components/jobs/JobPartAssignmentManager.tsx` to:

1. Track when part assignments change during the session
2. Show a warning banner when changes require rescheduling
3. Add a "Reschedule Job" button that calls `scheduleJobs([jobId], true)`

```text
+----------------------------------------------------------+
| ⚠️ Part assignments changed                              |
|                                                          |
| Changes to parallel processing require a schedule        |
| recalculation to take effect.                            |
|                                                          |
| [Reschedule Now]  [Close Without Rescheduling]           |
+----------------------------------------------------------+
```

### Part B: Add Orphan Detection and Auto-Fix

Add a check in the scheduler or a helper function to detect jobs that:
- Have `proof_approved_at` set
- Have pending stages with `schedule_status = 'unscheduled'`
- Have NO entries in `stage_time_slots`

When found, automatically include these jobs in the next scheduler run.

---

## Implementation Details

### File Changes

**1. `src/components/jobs/JobPartAssignmentManager.tsx`**

Add imports:
```typescript
import { scheduleJobs } from '@/utils/scheduler';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
```

Add state tracking:
```typescript
const [hasChanges, setHasChanges] = useState(false);
const [isRescheduling, setIsRescheduling] = useState(false);
```

Update mutation callbacks to track changes:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['job-stages-simple', jobId] });
  setHasChanges(true);  // NEW: Mark that reschedule is needed
  toast.success('Part assignment updated - reschedule recommended');
}
```

Add reschedule handler:
```typescript
const handleReschedule = async () => {
  setIsRescheduling(true);
  try {
    const result = await scheduleJobs([jobId], true);
    if (result) {
      toast.success(`Job rescheduled: ${result.wrote_slots} time slots created`);
      setHasChanges(false);
    }
  } catch (error) {
    toast.error('Reschedule failed');
  } finally {
    setIsRescheduling(false);
  }
};
```

Add warning UI section before close button:
- Yellow/amber alert banner when `hasChanges === true`
- "Reschedule Now" button that calls `handleReschedule`
- "Close Without Rescheduling" as the regular close action

**2. Database Orphan Detection**

Add a query to the scheduler prep phase to detect orphaned jobs:
```sql
-- Find orphaned jobs (approved but unscheduled with no time slots)
SELECT pj.id
FROM production_jobs pj
WHERE pj.proof_approved_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM job_stage_instances jsi 
    WHERE jsi.job_id = pj.id 
      AND jsi.status = 'pending'
      AND jsi.schedule_status = 'unscheduled'
  )
  AND NOT EXISTS (
    SELECT 1 FROM stage_time_slots sts WHERE sts.job_id = pj.id
  )
```

This can be added to the `scheduler_reschedule_all_parallel_aware` function to auto-include orphaned jobs.

---

## Expected Behavior After Implementation

1. **Part Assignment Changes:**
   - Admin opens Part Assignment dialog for a job
   - Admin changes T250 from "Both Parts" to "Text Only"
   - Warning appears: "Part assignments changed - reschedule recommended"
   - Admin clicks "Reschedule Now"
   - Job is rescheduled with correct parallel processing
   - Schedule board shows updated timings

2. **Orphan Prevention:**
   - If a job is ever left unscheduled, the next scheduler run will detect it
   - Orphaned jobs are automatically included in rescheduling
   - No jobs fall through the cracks

---

## Immediate Fix for D429735

To fix D429735 right now, the admin can:
1. Run a manual reschedule via the Schedule Board header
2. Or use the "Reschedule Jobs" button on the specific job

This will include D429735 in the scheduling pass and properly sequence it with D429733 and D429736.
