

# Clear Old Auto-Approved Jobs from Send to Print Queue

## What happened
Bulk-approving old orders set `proof_approved_manually_at` on their proof stage instances, which made them appear in the "Auto Approved - Send to Print" queue (288 jobs). These old jobs were never actually sent to print, so they're clogging the queue.

## Fix
Run a single SQL UPDATE to set `print_files_sent_to_printer_at = now()` on all proof stage instances that:
- Have `proof_approved_manually_at` set (not null)
- Don't have `print_files_sent_to_printer_at` set yet (null)
- Are on a proof stage (stage name contains "proof")

This will remove them from the queue immediately. The dashboard will refresh via its realtime subscription.

## Technical Detail

One database UPDATE statement using the Supabase data tool:

```sql
UPDATE job_stage_instances jsi
SET print_files_sent_to_printer_at = now()
FROM production_stages ps
WHERE jsi.production_stage_id = ps.id
  AND ps.name ILIKE '%proof%'
  AND jsi.proof_approved_manually_at IS NOT NULL
  AND jsi.print_files_sent_to_printer_at IS NULL;
```

No code changes needed -- this is purely a data cleanup.

