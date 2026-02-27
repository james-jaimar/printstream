
Goal: make QuickEasy sync reliable and stop the repeated "failed to fetch" loop.

## Status: IMPLEMENTED ✅

### Architecture (async pipeline)

1. **`firebird-sync`** (start endpoint) — validates input, creates `quickeasy_sync_runs` row with status `queued`, fires `firebird-sync-worker` asynchronously, returns `runId` immediately to the browser.

2. **`firebird-sync-worker`** (new edge function) — connects to Firebird, runs `SP_DIGITAL_PRODUCTION`, decodes rows, writes results (raw_data, row_count, duration_ms, etc.) into `quickeasy_sync_runs`. Updates status to `completed` or `failed`.

3. **`QuickEasySyncPanel`** — calls start endpoint, then polls `quickeasy_sync_runs` every 3s for status. Shows elapsed time. When `completed`, processes data through existing import pipeline. Shows clear error on `failed`.

4. **`quickeasy_sync_runs` table** — extended with: `started_at`, `finished_at`, `duration_ms`, `error`, `sample_rows`.

### Cron jobs
- The start endpoint returns in <1s, so pg_net default 5s timeout is adequate.
- To add `timeout_milliseconds` explicitly, run this in the Supabase SQL Editor:

```sql
SELECT cron.unschedule('quickeasy-sync-weekday');
SELECT cron.schedule('quickeasy-sync-weekday', '0 5-15 * * 1-5', $$
  SELECT net.http_post(
    url := 'https://kgizusgqexmlfcqfjopk.supabase.co/functions/v1/firebird-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnaXp1c2dxZXhtbGZjcWZqb3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ1NTQwNzAsImV4cCI6MjA2MDEzMDA3MH0.NA2wRme-L8Z15my7n8u-BCQtO4Nw2opfsX0KSLYcs-I"}'::jsonb,
    body := concat('{"startDate": "', CURRENT_DATE::text, '", "endDate": "', CURRENT_DATE::text, '"}')::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
$$);
```

### Fallback note
If the worker still times out (Supabase Edge wall-clock ~150s), the final fallback is a tiny on-prem bridge service next to Firebird.
