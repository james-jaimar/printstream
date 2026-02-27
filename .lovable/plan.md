
# Fix Firebird Query Timeout

## Problem
The `db.sequentially()` streaming API times out after 90 seconds. Both `SELECT * FROM` and `EXECUTE BLOCK` with streaming hang in Deno Deploy's TCP compatibility layer. The connection itself works fine (test mode passes), but multi-row result streaming is broken.

## Solution
Switch from `db.sequentially()` to `db.query()` for the EXECUTE BLOCK. The `query()` method buffers all results in memory rather than streaming row-by-row, which is more compatible with Deno's TCP shim. Since we expect ~126 rows (not millions), buffering is perfectly fine.

If `db.query()` with EXECUTE BLOCK also hangs, add a second fallback: loop `EXECUTE PROCEDURE` with pagination using `FIRST/SKIP` or `ROWS` syntax to fetch rows in small batches.

## Changes

### File: `supabase/functions/firebird-sync/index.ts`

1. Replace `db.sequentially()` call (lines 120-133) with `db.query()`:
   - Use `db.query(sql, [], callback)` which returns all rows at once
   - Keep the same EXECUTE BLOCK SQL (it works as a selectable block with `query()` too)
   - Increase timeout to 120 seconds as the SP is inherently slow
   - Add a fallback: if the EXECUTE BLOCK query fails, try `db.query("SELECT * FROM SP_DIGITAL_PRODUCTION(...)")` as a plain select

2. Add better error logging to distinguish between connection issues and query issues

### Redeploy
After code change, the edge function will be automatically redeployed.

## Technical Detail
`node-firebird`'s `query()` internally uses the same wire protocol but collects rows into an array before invoking the callback. This avoids the per-row callback pattern that seems to break in Deno's async TCP handling. The EXECUTE BLOCK wrapper ensures the selectable SP results are properly materialized.
