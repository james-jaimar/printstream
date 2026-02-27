
Goal: make QuickEasy sync reliable and stop the repeated “failed to fetch” loop.

What we’re missing (confirmed from logs + screenshot):
1) We can connect to Firebird and run lightweight queries (`testMode` succeeds).
2) The real SP call (`SELECT * FROM SP_DIGITAL_PRODUCTION(...)`) times out at 140s in Edge logs.
3) FlameRobin’s “text dump” is a client-side rendering of rows after fetch; Firebird still returns row data over the wire first. So we cannot “grab a prebuilt dump” directly without first completing the same fetch.
4) There is also a separate scheduler issue: pg_net calls are currently timing out at 5s (default), so auto-sync is unreliable too.

Implementation approach (single pass, no more guesswork):
1) Add an asynchronous sync pipeline using existing `quickeasy_sync_runs`
   - Extend run statuses to: `queued | running | completed | failed`.
   - Store diagnostics: `started_at`, `finished_at`, `duration_ms`, `error`, `row_count`, optional `sample_rows`.
   - Keep `raw_data` for completed runs.

2) Split current edge behavior into start + worker
   - `firebird-sync` (start endpoint): validate input, create a `quickeasy_sync_runs` row, return `runId` immediately.
   - `firebird-sync-worker` (new edge function): executes Firebird query, decodes rows, writes results into `quickeasy_sync_runs`.
   - This removes long-lived browser request dependency (no more frontend waiting 2+ minutes on one HTTP call).

3) Update `QuickEasySyncPanel` UX
   - On “Fetch from QuickEasy”, call start endpoint and show “Sync running…”.
   - Poll run status every few seconds.
   - When `completed`, continue current parsing/import pipeline exactly as today.
   - Show clear failure reason from `quickeasy_sync_runs.error`.

4) Fix scheduler timeout at DB level
   - Update `cron.job` commands for `quickeasy-sync-weekday` and `quickeasy-sync-saturday` to pass `timeout_milliseconds` (e.g. 240000) in `net.http_post`.
   - Point scheduled jobs to worker/start flow (not direct blocking fetch).

5) Add hard diagnostics to end the ambiguity
   - Log attach time, query start/end, decode time, total duration per run.
   - Add `countOnly`/`limit` debug mode in worker for fast sanity checks when needed.

Technical note:
- If worker still exceeds Supabase Edge wall-clock limits in production, final fallback is a tiny on-prem bridge service next to Firebird (execute locally, return JSON/CSV to Supabase). That is the only architecture that fully removes WAN/edge runtime constraints.

Validation plan:
1) Trigger manual sync for `2026-02-26` and confirm run transitions to `completed` with ~180 rows.
2) Confirm import dialog opens and jobs are created as before.
3) Verify cron-triggered runs complete with non-5s network timeout.
4) Confirm error messages in UI are actionable (not generic “failed to fetch”).
