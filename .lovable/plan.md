

# Fix: Dashboard Metrics and Live Production Flow

## Problem 1: "Due Today" counts completed jobs

The `dueToday` calculation (line 63-68 of `TrackerDashboard.tsx`) does NOT exclude completed jobs, unlike `dueTomorrow`, `dueThisWeek`, and `overdue` which all have `job.status === 'Completed'` checks.

All 29 "Due Today" jobs are actually completed -- they're done, they shouldn't be counted.

## Problem 2: "Critical" is inflated because it includes dueToday

`Critical` is calculated as `overdue + dueToday + (low-progress approaching due date)`. Since `dueToday` is 29 (all completed), critical gets inflated to 31. Additionally, the third condition (low-progress jobs) also doesn't exclude completed jobs and can double-count jobs already in overdue or dueToday.

## Problem 3: Live Production Assembly Line uses random mock data

The `LiveProductionFlow.tsx` component generates **random values** on every render for:
- `capacity`: `stage.count + Math.floor(Math.random() * 10)` 
- `utilization`: random math
- `isBottleneck`: `Math.random() > 0.7` (randomly flags stages as bottlenecks)
- `nextAvailable`: `Math.random() * 24 * 60 * 60 * 1000`

This means the assembly line shows meaningless, constantly changing data -- random bottleneck alerts, fake capacity percentages, and fake "next available" dates.

## Fix Plan

### 1. Fix `dueToday` to exclude completed jobs

**File:** `src/pages/tracker/TrackerDashboard.tsx` (line 64)

Add `|| job.status === 'Completed'` to the early return, matching the pattern used by all other metrics:

```typescript
if (!job.due_date || !job.proof_approved_at || job.status === 'Completed') return false;
```

### 2. Fix `critical` to exclude completed jobs and avoid double-counting

**File:** `src/pages/tracker/TrackerDashboard.tsx` (lines 94-97)

Add `job.status !== 'Completed'` to the third condition in the critical calculation. This ensures only active low-progress jobs are counted. The overdue and dueToday values feeding into it will already be correct after fix 1.

### 3. Replace mock data in LiveProductionFlow with real data

**File:** `src/components/tracker/dashboard/factory/LiveProductionFlow.tsx` (lines 18-24)

Remove `Math.random()` calls entirely. Replace with meaningful data:
- Remove fake `capacity` and `utilization` (we don't have real capacity data)
- Remove random `isBottleneck` -- instead flag stages with the highest job counts
- Remove fake `nextAvailable` dates
- Simplify the stage display to show only real data: stage name, job count, and whether it's the busiest stage

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/tracker/TrackerDashboard.tsx` | Add `status !== 'Completed'` check to `dueToday` filter (line 64); fix `critical` third condition (line 94-97) |
| `src/components/tracker/dashboard/factory/LiveProductionFlow.tsx` | Remove all `Math.random()` mock data; show only real stage counts without fake metrics |

## Expected Outcome

- "Due Today" drops from 29 to 0 (all 29 were completed jobs)
- "Critical" drops from 31 to a realistic number (likely 0-2)
- Assembly line shows stable, real data without random bottleneck alerts or fake percentages

