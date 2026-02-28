-- Clear 288 old bulk-approved jobs from the "Send to Print" queue
-- by stamping print_files_sent_to_printer_at on proof stage instances
-- that were manually approved but never actually sent to print.
UPDATE job_stage_instances jsi
SET print_files_sent_to_printer_at = now()
FROM production_stages ps
WHERE jsi.production_stage_id = ps.id
  AND ps.name ILIKE '%proof%'
  AND jsi.proof_approved_manually_at IS NOT NULL
  AND jsi.print_files_sent_to_printer_at IS NULL;