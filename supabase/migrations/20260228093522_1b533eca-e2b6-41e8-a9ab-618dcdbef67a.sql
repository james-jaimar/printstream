-- One-time cleanup: Delete ghost time slots whose jobs no longer have active stage instances
DELETE FROM stage_time_slots sts
WHERE sts.slot_end_time >= now()
  AND (sts.is_completed = false OR sts.is_completed IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM job_stage_instances jsi
    WHERE jsi.id = sts.stage_instance_id
      AND jsi.status IN ('pending', 'active', 'on_hold', 'awaiting_approval', 'scheduled')
  );