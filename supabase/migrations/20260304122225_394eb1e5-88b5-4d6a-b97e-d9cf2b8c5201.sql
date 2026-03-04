UPDATE proof_links
SET 
  is_used = true,
  invalidated_at = NOW()
WHERE is_used = false
  AND invalidated_at IS NULL
  AND stage_instance_id IN (
    SELECT jsi.id 
    FROM job_stage_instances jsi 
    WHERE jsi.status = 'completed'
  );