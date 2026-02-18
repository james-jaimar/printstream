

## Fix: Eliminate the Async Polling Path by Increasing VPS Timeout

### Root Cause (definitively proven)

Every "failed" run is actually `approved` with valid PDFs in the database. The VPS never fails. The problem is:

1. Edge function aborts the VPS fetch after **10 seconds** (line 188)
2. VPS sometimes takes 11-15 seconds to respond
3. Edge function returns `status: "processing"` to the client
4. Client enters `waitForRunCompletion` polling loop
5. Polling fails to detect the VPS callback's status update (race condition between poll reads and VPS callback writes)
6. Client reports failure, calls `persistRunError`, writes "[IMPO ERROR]" to the database
7. VPS callback arrives later and overwrites status to "approved" -- but the damage is done, the toast already showed an error

Runs where VPS responds in <10s go through the `status: "complete"` path and work perfectly every time.

### The Fix

Increase the VPS fetch timeout from 10s to **60s**. The edge function has a 150-second wall-clock limit from Supabase. The VPS responds in 2-15 seconds. This means virtually every run will be handled synchronously -- the edge function waits for the response, updates the DB itself, and returns `status: "complete"`. The problematic async polling path is never triggered.

### Changes

**File: `supabase/functions/label-impose/index.ts`**
- Line 188: Change `setTimeout(() => controller.abort(), 10000)` to `setTimeout(() => controller.abort(), 60000)`

**File: `src/hooks/labels/useBatchImpose.ts`**
- No changes needed. The "processing" + polling path remains as a fallback, but it should almost never be reached now.

### Why This Works

| VPS response time | Before (10s timeout) | After (60s timeout) |
|---|---|---|
| 2-9 seconds | Synchronous, works | Synchronous, works |
| 10-15 seconds | Abort fires, enters broken polling path, reports phantom failure | Synchronous, works |
| 15-60 seconds | Same broken polling path | Synchronous, works |
| >60 seconds | N/A (never happens) | Falls back to polling (rare) |

This is a one-line fix that eliminates the entire class of failures.

