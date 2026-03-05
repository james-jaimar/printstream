

# Purge Ghost Slots and Harden the System for Production

## Problem
There are **18 ghost slots** in `stage_time_slots` — records linked to `job_stage_instances` that are already `completed` but whose slots were never cleaned up (likely created before the cleanup trigger was installed). All 18 have future dates, meaning they are actively blocking resources (UV Varnishing, Gathering, Pre Trim, Shipping) and pushing new jobs days into the future.

The existing trigger (`trg_cleanup_stage_time_slots`) only fires on status changes going *forward* — it can't retroactively fix slots from stages that were completed before the trigger existed.

## Plan

### 1. Immediate Purge — Delete all ghost slots now
Run a one-time DELETE via the insert tool (data operation, not migration):

```sql
DELETE FROM stage_time_slots
WHERE stage_instance_id IN (
  SELECT id FROM job_stage_instances WHERE status = 'completed'
)
AND COALESCE(is_completed, false) = false;
```

This removes all 18 orphaned future slots immediately.

### 2. Harden the Trigger — Also clean up `is_completed = true` slots for completed stages
The current trigger only deletes slots where `is_completed = false`. Update it to delete **all** slots for a completed stage instance (the completed stage no longer needs any time reservation):

```sql
-- On UPDATE to completed: delete ALL remaining slots, not just non-completed ones
DELETE FROM stage_time_slots
WHERE stage_instance_id = NEW.id;
```

This is cleaner — a completed stage has no reason to hold any future slots.

### 3. Add a Scheduled Integrity Sweep (Cron)
Create a lightweight SQL function `purge_ghost_slots()` that runs periodically (e.g., every 6 hours via pg_cron) to catch any edge cases:

```sql
DELETE FROM stage_time_slots
WHERE stage_instance_id IN (
  SELECT id FROM job_stage_instances WHERE status = 'completed'
);
```

This acts as a safety net in case any slots slip through (race conditions, bulk updates, etc.).

### 4. Admin Diagnostic View
Add a small "Schedule Health" card in the TrackerAdmin page showing:
- Count of ghost slots (slots linked to completed stages)
- Count of orphan slots (slots with no matching stage instance)
- A "Purge Now" button that runs the cleanup manually

This gives visibility into schedule integrity without needing to run SQL queries.

### 5. Reschedule After Purge
After purging, the user should trigger a reschedule to recalculate resource tails correctly. D430824 should move significantly earlier once the ghost slots on Pre Trim, Gathering, etc. are removed.

## Files

- **Data operation**: One-time purge of 18 ghost slots (insert tool)
- **Migration**: Updated trigger function + `purge_ghost_slots()` function
- **Migration**: pg_cron schedule for periodic sweep
- **New**: `src/components/tracker/admin/ScheduleHealthCard.tsx` — diagnostic UI
- **Modified**: `src/pages/tracker/TrackerAdmin.tsx` — add health card

