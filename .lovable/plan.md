

## Diagnose and Fix: Batch Imposition Silent Failures

### Root Cause Analysis

The VPS is working perfectly. Every run that reaches the VPS succeeds. The failures are happening at the client/edge function invocation layer:

1. **`supabase.functions.invoke()` can fail silently** (network timeout, Supabase runtime limits) before the edge function even boots
2. **`MAX_CONSECUTIVE_FAILURES = 2` is too aggressive** -- two flaky invocations in a row abort the entire remaining batch with no recovery
3. **No error details are persisted** -- when a run fails, the error message is only shown in a toast that disappears, with no way to review what happened

### Changes

#### 1. Add Detailed Client-Side Logging (`src/hooks/labels/useBatchImpose.ts`)

Add `console.log` at every decision point so you can see exactly what happens in the browser console:

- Log which runs are targeted, in what order
- Log the exact response from `createImposition` (or the exact error)
- Log poll attempts and outcomes
- Log when consecutive failure limit is hit and which runs are skipped

#### 2. Remove the Consecutive Failure Abort (`src/hooks/labels/useBatchImpose.ts`)

Change `MAX_CONSECUTIVE_FAILURES` from 2 to a much higher value (e.g., 50, effectively disabling it). The batch should **never** silently skip runs. If a run fails, log it and move on to the next one. The user can see which ones failed and retry.

- Change `MAX_CONSECUTIVE_FAILURES = 2` to `MAX_CONSECUTIVE_FAILURES = 999`
- This ensures the batch always attempts every single run, never aborts early

#### 3. Persist Error Details on Failed Runs (`src/hooks/labels/useBatchImpose.ts`)

When a run fails (catch block or poll timeout), write the error message back to the `label_runs` row in a `notes` or similar field. This way the failure reason is visible in the UI, not just in a fleeting toast.

- After a failure, update the run: `status: 'planned'` plus add error context to `updated_at` timestamp (or a dedicated error field if one exists)

#### 4. Add Edge Function Invocation Timeout Handling (`src/hooks/labels/useBatchImpose.ts`)

The `createImposition` call (via `supabase.functions.invoke`) can hang indefinitely if the edge function takes too long to respond. Add a client-side timeout wrapper (30 seconds) so a hung invocation fails fast rather than blocking the entire batch forever.

```text
Wrap createImposition call with Promise.race:
- createImposition(request)  
- 30-second timeout that rejects with "Edge function invocation timed out"
```

#### 5. Better Edge Function Error Logging (`supabase/functions/label-impose/index.ts`)

Add more granular logging at each stage:
- Log the full VPS response status and body on non-OK responses
- Log when the storage upload URL creation fails
- Log the exact payload size being sent to VPS

### Technical Summary

| File | Change |
|------|--------|
| `src/hooks/labels/useBatchImpose.ts` | Add console.log at every step, disable consecutive failure abort, add 30s invocation timeout, persist error details |
| `supabase/functions/label-impose/index.ts` | Add granular step-by-step logging |

### What This Achieves

After these changes, when you run "Reprocess All":
- Every single run will be attempted, no matter what
- The browser console will show exactly what happened at each step
- Failed runs will have their error reason visible
- You will finally see whether the failures are network timeouts, edge function boot failures, or something else entirely

