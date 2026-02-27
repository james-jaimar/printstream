-- Clean up stuck sync runs (older than 10 minutes, still queued or running)
UPDATE quickeasy_sync_runs
SET status = 'failed',
    finished_at = now(),
    error = 'Marked as failed by cleanup migration — stuck for over 10 minutes'
WHERE status IN ('queued', 'running')
  AND started_at < now() - interval '10 minutes';