
-- 1. Harden the cleanup trigger: delete ALL slots for completed stages (not just non-completed)
CREATE OR REPLACE FUNCTION public.cleanup_stage_time_slots_on_jsi_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM stage_time_slots
    WHERE stage_instance_id = OLD.id;
    RETURN OLD;
  END IF;

  -- On UPDATE: if status changed to 'completed', remove ALL slots (completed stage needs no reservations)
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed' THEN
    DELETE FROM stage_time_slots
    WHERE stage_instance_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create purge_ghost_slots() safety-net function
CREATE OR REPLACE FUNCTION public.purge_ghost_slots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM stage_time_slots
  WHERE stage_instance_id IN (
    SELECT id FROM job_stage_instances WHERE status = 'completed'
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Also clean orphan slots (no matching stage instance)
  DELETE FROM stage_time_slots s
  WHERE NOT EXISTS (
    SELECT 1 FROM job_stage_instances j WHERE j.id = s.stage_instance_id
  );

  RETURN deleted_count;
END;
$$;

-- 3. Create a diagnostic function for the admin UI
CREATE OR REPLACE FUNCTION public.get_schedule_health()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ghost_count integer;
  orphan_count integer;
  total_slots integer;
BEGIN
  SELECT COUNT(*) INTO ghost_count
  FROM stage_time_slots
  WHERE stage_instance_id IN (
    SELECT id FROM job_stage_instances WHERE status = 'completed'
  );

  SELECT COUNT(*) INTO orphan_count
  FROM stage_time_slots s
  WHERE NOT EXISTS (
    SELECT 1 FROM job_stage_instances j WHERE j.id = s.stage_instance_id
  );

  SELECT COUNT(*) INTO total_slots FROM stage_time_slots;

  RETURN json_build_object(
    'ghost_slots', ghost_count,
    'orphan_slots', orphan_count,
    'total_slots', total_slots,
    'healthy_slots', total_slots - ghost_count - orphan_count,
    'checked_at', now()
  );
END;
$$;
