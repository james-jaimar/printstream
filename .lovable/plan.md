

# Prevent Future Ghost Time Slots

## What Happened

The `delete_production_jobs()` RPC function already correctly deletes `stage_time_slots` when jobs are removed through the normal UI (line 25 of the function). The ghost slots only appeared because the earlier bulk cleanup bypassed this function.

Going forward, normal job deletions will be fine. But as a safety net, we should add a database trigger to automatically clean up time slots when their parent stage instance is removed or completed.

## The Fix: Automatic Cleanup Trigger

Create a single database trigger on `job_stage_instances` that fires on DELETE or UPDATE, and removes the associated `stage_time_slots` when:
- A stage instance row is deleted, OR
- A stage instance's status changes to `completed`

This ensures that no matter how jobs are cleaned up (RPC, direct SQL, bulk operation), the time slots always get cleaned too.

## Technical Detail

One SQL migration to create the trigger:

```sql
-- Trigger function: clean up stage_time_slots when a stage instance is deleted or completed
CREATE OR REPLACE FUNCTION public.cleanup_stage_time_slots_on_jsi_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM stage_time_slots
    WHERE stage_instance_id = OLD.id;
    RETURN OLD;
  END IF;

  -- On UPDATE: if status changed to 'completed', remove future non-completed slots
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed' THEN
    DELETE FROM stage_time_slots
    WHERE stage_instance_id = NEW.id
      AND COALESCE(is_completed, false) = false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_stage_time_slots
AFTER DELETE OR UPDATE OF status ON job_stage_instances
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_stage_time_slots_on_jsi_change();
```

No frontend code changes needed.

