
-- Extend quickeasy_sync_runs with async pipeline columns
ALTER TABLE quickeasy_sync_runs 
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS sample_rows jsonb;

-- Update status default and add index for running status
CREATE INDEX IF NOT EXISTS idx_quickeasy_sync_running ON quickeasy_sync_runs(status) WHERE status IN ('queued', 'running');
