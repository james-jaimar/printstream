

# Fix: Live Production Assembly Line Not Working

## Root Cause

The database function `get_dashboard_job_stats` has a bug in its `current_stages` CTE. It uses `ORDER BY jsi.job_id, jsi.stage_order DESC` with `DISTINCT ON`, which picks the **last** pending stage (e.g., "Shipping") instead of the **first** one (e.g., "DTP").

Result: nearly all non-completed jobs show "Shipping" as their current stage, making the assembly line display a single misleading column instead of distributing jobs across their actual production stages.

**Data proof:**
- 86 jobs show "Shipping" as current stage, 46 more also "Shipping" -- but in reality these jobs are at DTP, PROOF, Printing, etc.
- Only 5 jobs have truly active/awaiting_approval stages (all at PROOF stage)

Additionally, the function returns **all 2,000+ completed jobs** (with bogus "Not Started" stage data), which inflates the dataset unnecessarily. The dashboard already filters these out client-side, but they waste bandwidth.

## Fix

**1. Fix the SQL function** `get_dashboard_job_stats`:
- Change `ORDER BY jsi.job_id, jsi.stage_order DESC` to `ORDER BY jsi.job_id, jsi.stage_order ASC` -- picks the **first** non-completed stage (the actual current stage)
- Add `WHERE pj.status != 'Completed'` to exclude completed jobs from the result set (saves returning 2,000+ useless rows)

**2. No frontend changes needed** -- the `TrackerDashboard.tsx` stage aggregation logic is correct; it just needs accurate data from the DB.

### Expected Impact
- Assembly line will correctly show jobs distributed across DTP, PROOF, Printing, Laminating, etc.
- Response payload drops from ~2,200 rows to ~140 rows
- Dashboard loads faster with accurate stage distribution

