
ALTER TABLE quickeasy_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to quickeasy_sync_runs" ON quickeasy_sync_runs FOR ALL USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
