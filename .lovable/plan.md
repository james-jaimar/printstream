

# QuickEasy Sync: Push-Based Architecture + Bug Fixes

## Overview

Build a new Edge Function endpoint that **receives** pre-fetched QuickEasy data (pushed from your local network), plus fix the two bugs causing the "stuck forever" issue. The existing pull-based sync remains as a fallback.

## Changes

### 1. New Edge Function: `quickeasy-receive`

A simple endpoint that accepts JSON data and writes it to `quickeasy_sync_runs`. This is what the local relay script will POST to.

- Accepts `{ startDate, endDate, rows }` in the request body
- Validates the payload
- Creates a completed sync run in `quickeasy_sync_runs` with the data
- Returns `{ success: true, runId }`
- Uses a shared secret header for basic auth (prevents random POSTs)

**File:** `supabase/functions/quickeasy-receive/index.ts`

Also add to `supabase/config.toml`:
```toml
[functions.quickeasy-receive]
verify_jwt = false
```

### 2. Fix broken error handler in worker

**File:** `supabase/functions/firebird-sync-worker/index.ts`

Replace the broken `.catch()` (Supabase JS returns PromiseLike, not Promise) with a proper try/catch so failed runs are always marked as `"failed"` in the database instead of staying stuck at `"running"` forever.

### 3. Add 5-minute max polling timeout on frontend

**File:** `src/components/tracker/QuickEasySyncPanel.tsx`

Add a maximum polling duration of 5 minutes. If the run is still `"running"` after 5 minutes, stop polling and show a timeout error instead of spinning forever.

### 4. Clean up stuck runs in database

Run a migration to mark all existing stuck `"running"` or `"queued"` runs (older than 10 minutes) as `"failed"` so they don't interfere with future syncs.

### 5. Provide local relay script template

Create a reference script at `scripts/quickeasy-relay.js` (won't run in Lovable, but gives you a ready-to-use template for your local machine). About 40 lines of Node.js:

```text
[Local machine] → Firebird query (5s) → POST JSON → [quickeasy-receive] → DB
```

## Files Created/Modified

1. **NEW** `supabase/functions/quickeasy-receive/index.ts` -- receiving endpoint
2. **EDIT** `supabase/functions/firebird-sync-worker/index.ts` -- fix error handler bug
3. **EDIT** `src/components/tracker/QuickEasySyncPanel.tsx` -- add 5-min polling timeout
4. **EDIT** `supabase/config.toml` -- add quickeasy-receive function config
5. **NEW** `scripts/quickeasy-relay.js` -- local relay script template
6. **DB migration** -- clean up stuck runs

