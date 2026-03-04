

# Fix: Dashboard RPC Still Hitting Old Function

## Problem
The migration created a new `get_dashboard_job_stats()` (no args) but the old `get_dashboard_job_stats(p_user_id uuid)` still exists in the database. Postgres function overloading means the client call with `p_user_id` matches the old broken function.

## Fix

### 1. New SQL migration
Drop the old function signature explicitly, then recreate the fixed one:
```sql
DROP FUNCTION IF EXISTS get_dashboard_job_stats(uuid);
-- Then CREATE OR REPLACE the no-arg version (same as previous migration)
```

### 2. Update client code
In `src/hooks/tracker/useDashboardJobs.ts`, change the RPC call to pass no arguments:
```typescript
const { data, error: fetchError } = await supabase.rpc('get_dashboard_job_stats');
```
Remove the `user.id` dependency since the function no longer needs it. The `useAuth` import and early return on `!user?.id` can also be removed (or kept for auth gating).

### 3. Update types
Clean up the union type in `types.ts` to only have the `Args: never` variant (will happen automatically after migration runs).

### Expected Result
- Old function dropped, new parameterless function used
- Assembly line shows actual stage distribution (DTP, PROOF, Printing, etc.) instead of "Not Started" + "Shipping"
- Completed jobs excluded from response

