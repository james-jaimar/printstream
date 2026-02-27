

# Direct Firebird Database Integration — QuickEasy Live Sync

## Overview

Replace the manual Excel export/import workflow with a live connection to the QuickEasy Firebird database. This will allow on-demand ingestion of digital production orders by calling the stored procedure `SP_DIGITAL_PRODUCTION` directly.

## Technical Challenge

Firebird uses a **raw TCP wire protocol** (port 3050), not HTTP. Supabase Edge Functions run on Deno Deploy, which has limited support for raw TCP connections through Node.js compatibility layers. The `node-firebird` npm package is a pure-JS implementation of the Firebird wire protocol, so it *may* work — but there's a real risk it won't due to Deno Deploy's networking constraints.

## Approach: Two-Phase Strategy

### Phase 1 — Try Edge Function with `node-firebird` (quick test)

Create a Supabase Edge Function `firebird-sync` that:
1. Uses `npm:node-firebird` to connect to the Firebird DB
2. Executes `SELECT * FROM SP_DIGITAL_PRODUCTION(:start, :end)` with date parameters
3. Returns the results as JSON

If this works, we're golden — no extra infrastructure needed.

### Phase 2 — Fallback: On-Prem HTTP Proxy (if TCP fails)

If Edge Functions can't establish TCP to Firebird, you'd need a tiny HTTP service running on the same server as QuickEasy that:
- Accepts HTTP requests from the Edge Function
- Queries Firebird locally
- Returns JSON

This is a common pattern for on-prem database integrations. We'd still build the Edge Function, but it would call the HTTP proxy instead of Firebird directly.

## Implementation Plan (Phase 1)

### Step 1: Store Firebird credentials as Supabase secrets

| Secret Name | Value |
|---|---|
| `FIREBIRD_HOST` | `impress.cpronline-ddns.com` |
| `FIREBIRD_PORT` | `3050` |
| `FIREBIRD_DATABASE` | `/opt/QuickEasy/Data/IMPRESSX.fdb` |
| `FIREBIRD_USER` | `sysdba` |
| `FIREBIRD_PASSWORD` | `hjisthebest` |

### Step 2: Create the `firebird-sync` Edge Function

**File**: `supabase/functions/firebird-sync/index.ts`

- Accept POST requests with `{ startDate, endDate }` parameters
- Connect to Firebird using `node-firebird`
- Execute `SP_DIGITAL_PRODUCTION` stored procedure
- Return raw results as JSON for initial testing
- Include CORS headers and error handling

### Step 3: Add to `supabase/config.toml`

```toml
[functions.firebird-sync]
verify_jwt = false
```

### Step 4: Add `node-firebird` to `deno.json`

```json
"node-firebird": "npm:node-firebird@0.9.3"
```

### Step 5: Test the connection

Call the edge function with a date range to verify we can read data from QuickEasy.

## What Comes Next (after successful connection)

Once we confirm the Firebird connection works:
- Map the SP_DIGITAL_PRODUCTION output fields to the existing `production_jobs` table schema
- Build a "Sync from QuickEasy" button on the Upload page (or Dashboard)
- Add duplicate detection (skip orders already imported)
- Optionally set up scheduled auto-sync via a cron trigger

## Security Notes

- Credentials stored as Supabase secrets (not in code)
- The Firebird server must be reachable from the internet (your DDNS setup handles this)
- Consider adding IP whitelisting on the Firebird server if possible
- The edge function will validate authentication before querying

