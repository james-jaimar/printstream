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