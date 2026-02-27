

# Fix Firebird Sync - Remove Wasted EXECUTE BLOCK Timeout

## Root Cause

The edge function logs tell the full story:
1. EXECUTE BLOCK query starts, hangs for 120 seconds, times out
2. Fallback `SELECT * FROM SP_DIGITAL_PRODUCTION(...)` starts at the 120s mark
3. The Supabase edge function gets killed at ~200s (platform wall-clock limit) before the fallback can complete

The stored procedure runs in 3 seconds locally. The issue is `node-firebird` in Deno's npm compatibility layer struggling with multi-row stored procedure results. By wasting 120 seconds on the EXECUTE BLOCK attempt, the fallback `SELECT *` never gets enough time.

## Fix

### 1. Simplify `supabase/functions/firebird-sync/index.ts`

- **Remove the EXECUTE BLOCK entirely** (lines 102-116) -- it hangs every time and wastes 120 seconds
- **Remove the try/catch fallback pattern** -- go straight to `SELECT * FROM SP_DIGITAL_PRODUCTION('{startDate}','{endDate}')`
- **Set timeout to 140 seconds** -- just under the Supabase platform limit (~150s) so we get a clean error instead of a hard kill
- This gives the single query the full available window instead of splitting time between two attempts

### 2. Code change summary

Replace lines 102-156 (the EXECUTE BLOCK + fallback pattern) with a single query:

```text
const sql = `SELECT * FROM SP_DIGITAL_PRODUCTION('${startDate}','${endDate}')`;
console.log(`[firebird-sync] SQL: ${sql}`);

const result = await withTimeout(
  new Promise((resolve, reject) => {
    db.query(sql, [], (err, res) => {
      if (err) reject(new Error(`Query failed: ${err.message}`));
      else resolve(res);
    });
  }),
  140000,
  "Firebird SP query"
);
const rawRows = Array.isArray(result) ? result : (result ? [result] : []);
rows = rawRows.map(decodeRow);
console.log(`[firebird-sync] Query returned ${rows.length} rows`);
```

No other files need changes. The frontend panel and data mapper are working correctly.

