

# Fix: Proof Reminder Emails Continue After Manual Approval

## Problem
When a proof stage is manually approved (via the DTP dashboard or stage actions), the system sets `proof_approved_manually_at` on the `job_stage_instances` table but does **not** invalidate the corresponding `proof_links` record. The `proof-reminder` edge function queries for proof links where `is_used = false` and `invalidated_at IS NULL`, so it keeps sending reminder emails to clients even after the proof has already been approved internally.

The **online** approval path (client clicks the proof link) correctly sets `is_used = true` on the proof link. The bug is only in the manual/internal approval paths.

## Affected Code Paths (3 places)
1. `src/hooks/tracker/useProofApprovalFlow.tsx` — `completeProofStage()` (line 42)
2. `src/hooks/tracker/stage-management/useStageActions.tsx` — `completeStage()` (line 109-118)
3. `src/hooks/tracker/stage-management/useStageActions.tsx` — `completeStageAndSkipConditional()` (line 191-200)

## Fix
After each manual proof stage completion (where `isProofStage` is true), add a query to invalidate all active proof links for that job:

```typescript
await supabase
  .from('proof_links')
  .update({
    is_used: true,
    invalidated_at: new Date().toISOString(),
    invalidated_by: user?.id || null
  })
  .eq('job_id', jobId)
  .eq('is_used', false);
```

This matches the existing pattern used in the online approval flow (handle-proof-approval/index.ts lines 457-463 and 550-554).

### File 1: `useProofApprovalFlow.tsx`
- After the stage is marked completed (line 55), add proof link invalidation using `stageId` to look up the `job_id`, or use the `jobId` parameter directly since it's already available.

### File 2: `useStageActions.tsx` (both functions)
- After the stage update succeeds and `isProofStage` is true, invalidate proof links for the job. The `jobId` is available as a parameter in `completeStageAndSkipConditional`, and from `stageInfo.job_id` in `completeStage`.

## Expected Result
- Manual proof approvals immediately stop all pending reminder emails
- No more "phantom" reminders after internal approval
- No changes needed to the `proof-reminder` edge function itself

