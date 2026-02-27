
CREATE TABLE IF NOT EXISTS quickeasy_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  raw_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  processed_by uuid,
  notes text
);
CREATE INDEX idx_quickeasy_sync_status ON quickeasy_sync_runs(status) WHERE status = 'pending';
