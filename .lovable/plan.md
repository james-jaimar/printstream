

# Investigation: Operator Queue (56) vs Schedule Board (72) — Which Is Wrong?

## Root Cause

Both views query the same `job_stage_instances` table but with **different filters**, so they count different things.

### Operator Dashboard (56 jobs) — `useScheduledJobs.tsx`
- Filters: `status IN ('pending', 'active', 'on_hold', 'in_progress')`
- Scoped to the specific `production_stage_id` for HP 12000
- Shows **real work queue** — jobs the operator needs to act on

### Schedule Board (72 jobs) — `useScheduleReader.tsx`
- Filters: `scheduled_start_at IS NOT NULL` AND `status != 'completed'`
- Includes **additional statuses** like `skipped`, `changes_requested`, `awaiting_approval`, `scheduled` that the operator dashboard excludes
- Counts **split-job parts separately** — if one job is split across 2 days, it appears as 2 entries
- No user/permission filtering — shows everything for that stage

## Which Is Wrong?

**The Schedule Board's count of 72 is inflated** for two reasons:

1. **Split jobs counted multiple times**: A single job split across Mon+Tue appears as 2 entries in the schedule (correct for timeline view) but should count as 1 unique job in the header stat
2. **Broader status filter**: Includes statuses like `skipped` and `changes_requested` that aren't actionable work — these shouldn't be in the "72 jobs" headline count

The operator's 56 is closer to reality but may also be slightly off if it's missing `scheduled`/`awaiting_approval` jobs that are genuinely pending.

## Proposed Fix

### 1. Schedule Board header: count unique jobs, not stage instances
In `ScheduleProductionSidebar.tsx`, change `getStageJobCount()` and the header stat to count **unique `job_id`s** instead of raw stage instance count. This eliminates double-counting from split jobs.

### 2. Align status filters
Both views should use the same set of "active work" statuses. Add `scheduled` to the operator dashboard's filter (these are real pending jobs). Exclude `skipped` and `changes_requested` from the schedule board's count.

### Files Changed

| File | Change |
|------|--------|
| `src/components/schedule/sidebar/ScheduleProductionSidebar.tsx` | Count unique `job_id`s instead of instances |
| `src/components/schedule/ScheduleBoard.tsx` | Update header stat to use unique job count |
| `src/hooks/useScheduleReader.tsx` | Exclude `skipped` status from query |
| `src/hooks/tracker/useScheduledJobs.tsx` | Add `scheduled` to accepted statuses |

