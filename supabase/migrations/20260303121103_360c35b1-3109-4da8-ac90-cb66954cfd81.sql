CREATE POLICY "Public can view job via valid proof link"
ON production_jobs
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM proof_links
    WHERE proof_links.job_id = production_jobs.id
    AND proof_links.expires_at > now()
    AND proof_links.is_used = false
  )
);