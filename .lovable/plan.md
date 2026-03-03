

# Fix: scheduler_append_jobs Should Start From Now, Not Tomorrow

## Current Bug (Line 48)

```sql
base_time := public.next_working_start(date_trunc('day', now()) + interval '1 day');
```

This always skips today. A job approved at 06:00 or 07:00 gets pushed to tomorrow's 08:00 shift even though today's shift hasn't started yet.

## The Fix

Change line 48 to:

```sql
base_time := public.next_working_start(now());
```

The `next_working_start()` function already handles the logic of finding the next valid shift window:
- If now is 06:00 (before shift), it returns today 08:00
- If now is 10:00 (during shift), it returns now
- If now is 18:00 (after shift), it returns tomorrow 08:00

Jobs will simply go behind the last existing slot on each resource, regardless of what day that falls on. The resource tail tracking (lines 94-102) already handles this — it finds the MAX `slot_end_time` per resource and uses that as the starting point. The `base_time` is only the fallback when a resource has no existing slots.

## Ghost Slots Status

Confirmed cleared: 0 ghost slots remain. Only 20 active slots in the system.

## Implementation

1. **Database migration**: ALTER the `scheduler_append_jobs` function, changing only line 48
2. **Reschedule D430827** after the fix to pull it into today's schedule

## Technical Detail

The `scheduler_reschedule_all_parallel_aware` function (used by "Reschedule All") does NOT have this bug — the edge function passes `now()` as `p_start_from`. Only the append path (used on proof approval) is affected.

