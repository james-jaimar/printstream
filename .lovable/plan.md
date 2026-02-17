

## Root Cause: Client Timeout vs Edge Function Retry Loop Race Condition

I traced every step from click to failure. Here is the exact flow and where it breaks.

### The Complete Flow (byte by byte)

```text
YOU CLICK "Reprocess All"
        |
        v
handleReprocessAll() --> impose(true)
        |
        v
[1] Reset all runs: status='planned', clear PDF URLs (Supabase UPDATE)
        |
        v
[2] Loop: for each run, sequentially...
        |
        v
[3] Build slot_assignments + dielineConfig from local data
        |
        v
[4] Call createImposition(request) -- WRAPPED IN 30-SECOND CLIENT TIMEOUT
        |
        v
[5] supabase.functions.invoke("label-impose", { body: request })
        |
        v
   ============ EDGE FUNCTION STARTS ============
        |
        v
[6] Create signed upload URLs for production + proof PDFs (~200ms)
        |
        v
[7] Expand 4 column slots to 12 grid slots
        |
        v
[8] Set run status to "imposing" in database
        |
        v
[9] Calculate page dimensions (292x309mm) -- CORRECT
        |
        v
[10] Fire VPS request with 10-second abort timeout
        |
        v
   --- VPS RESPONDS ---
   CASE A: VPS responds in <10s --> immediate success
   CASE B: VPS takes >10s --> abort fires, "processing asynchronously"
   CASE C: VPS returns 503 "busy" --> RETRY LOOP BEGINS
```

### THE BUG: Case C (503 Retry Loop)

When the VPS returns 503, the edge function enters a retry loop:

```text
Attempt 0: fetch VPS (up to 10s) --> 503 received
Wait 5 seconds
Attempt 1: fetch VPS (up to 10s) --> 503 received
Wait 10 seconds  
Attempt 2: fetch VPS (up to 10s) --> 503 received
Wait 15 seconds
Attempt 3: fetch VPS (up to 10s) --> final attempt

WORST CASE TOTAL: 4 x 10s fetch + 5s + 10s + 15s = 70 SECONDS
```

But the CLIENT has a 30-second timeout wrapping the entire `supabase.functions.invoke()` call.

**What happens:**

1. Edge function starts, fires VPS, gets 503, starts retrying
2. At 30 seconds, the CLIENT timeout fires
3. Client catches the timeout error: `"Edge function invocation for run #X timed out after 30s"`
4. Client runs `persistRunError()` which sets the run back to `status: 'planned'` with the error in `ai_reasoning`
5. Client shows the error toast
6. Client moves to the next run
7. **Meanwhile, the edge function is STILL RUNNING** -- it may eventually succeed and set the status to `'approved'`
8. This creates a **race condition**: the client already recorded it as failed, but the VPS may have actually processed it

This also explains why the edge function logs show SUCCESS for runs that the client reports as FAILED -- the edge function finishes after the client has already given up and moved on.

### Additional Risk: Supabase Wall-Clock Limit

Supabase Edge Functions have a default execution limit (typically 60 seconds). If the retry loop runs long, Supabase may kill the function mid-execution, leaving the run stuck in "imposing" status with no callback.

### The Fix

The edge function should NOT retry 503s with long waits. Since the architecture is already async (VPS uploads PDFs directly and calls back), the edge function should:

1. Try the VPS **once** (with the 10s abort as today)
2. If 503, return immediately to the client with `status: "vps_busy"` 
3. The **client** (useBatchImpose) handles the retry -- it already has a 3s delay between runs, so it can simply re-queue the same run after a short wait

This keeps the edge function fast (always returns in under 15 seconds) and puts the retry intelligence in the client where it belongs.

### Changes

#### 1. Simplify Edge Function -- Remove 503 Retry Loop (`supabase/functions/label-impose/index.ts`)

- Remove the retry loop (lines 194-249)
- Single VPS fetch with 10s abort timeout
- If 503: return `{ success: false, status: "vps_busy" }` immediately
- If ok: update run and return
- If abort (>10s): return `{ success: true, status: "processing" }` (VPS will callback)

#### 2. Add Client-Side Retry for VPS Busy (`src/hooks/labels/useBatchImpose.ts`)

- Remove the 30s invocation timeout (no longer needed since edge function is fast)
- When `createImposition` returns `status: "vps_busy"`, wait 5s and retry the same run (up to 3 times)
- Log each retry attempt clearly
- Only count as a real failure after all retries are exhausted

#### 3. Increase Delay Between Runs (`src/hooks/labels/useBatchImpose.ts`)

- Increase the inter-run delay from 3s to 5s to further reduce 503 frequency

### Technical Summary

| File | Change |
|------|--------|
| `supabase/functions/label-impose/index.ts` | Remove 503 retry loop; single attempt + immediate return |
| `src/hooks/labels/useBatchImpose.ts` | Remove 30s timeout; add client-side retry for "vps_busy"; increase inter-run delay to 5s |

### Why This Fixes It

- Edge function always returns in under 15 seconds -- no more client timeouts
- Client has full visibility into retries -- no more "it failed but actually it worked"
- No race conditions between client error persistence and edge function success callbacks
- VPS still processes asynchronously via callback for runs that take >10s

