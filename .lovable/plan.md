

# Fix: Ghost Time Slots Causing Inflated Completion Dates

## What's Happening

When you bulk-cleaned old orders, the **jobs and their stage instances** were cleaned up, but the **433 `stage_time_slots`** belonging to those old jobs were left behind. These "ghost slots" stretch all the way to **March 20th** across every resource (Shipping, Packaging, Printing, Folding, etc.).

When a new job is approved and the scheduler runs `scheduler_append_jobs`, it calculates each resource's next available time by looking at `MAX(slot_end_time)` from the `stage_time_slots` table. Since those ghost slots claim resources are busy until March 20th, the new job gets placed **after** them -- hence the March 23rd estimate for a single job.

## The Fix (Two Parts)

### Part 1: Database Cleanup (immediate)
Delete all orphaned `stage_time_slots` where the associated job no longer exists or has been completed/removed. Specifically:

```sql
-- Delete ghost time slots whose jobs no longer have active stage instances
DELETE FROM stage_time_slots sts
WHERE sts.slot_end_time >= now()
  AND (sts.is_completed = false OR sts.is_completed IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM job_stage_instances jsi
    WHERE jsi.id = sts.stage_instance_id
      AND jsi.status IN ('pending', 'active', 'on_hold', 'awaiting_approval', 'scheduled')
  );
```

### Part 2: Reschedule the newly approved job
After cleaning up the ghost slots, re-run the scheduler for any currently pending jobs so they get correct start times (starting from tomorrow, not March 20th).

### No Code Changes Needed
This is purely a data cleanup issue. The scheduler logic itself is correct -- it just had stale data to work with. Going forward, whenever jobs are bulk-cleaned, the corresponding `stage_time_slots` should be cleaned too (this could be addressed with a database trigger or a cleanup step in the bulk operation, but that's a separate enhancement).

