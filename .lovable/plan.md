

# Fix: Invalidate 7 Orphaned Proof Links

## What happened
These 7 proof links were created before the code fix we just deployed. The manual approval path didn't invalidate them, so they remain `is_used = false` with no `invalidated_at`.

## Data fix needed
Run a single UPDATE to invalidate all proof links where the associated stage instance is already completed:

```sql
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
```

This catches all 7 records (and any others we might have missed). Going forward, the code fix already deployed will prevent new orphans.

## Implementation
Single database update via the insert/update tool -- no code changes needed.

