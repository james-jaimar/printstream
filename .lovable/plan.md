

# Multi-Shift Production Grouping Tool — Updated Plan

## Your concern (valid)
When HP12000 printing stages move to different days, all downstream stages (lamination, cutting, binding, etc.) must shift accordingly. **This is already handled** by the existing `scheduler_reschedule_all_parallel_aware` SQL function — it schedules ALL stages across ALL resources respecting predecessor dependencies.

## How it works

The tool does NOT need to manually cascade downstream stages. The flow is:

1. Admin selects HP12000 + 3 days → sees all printing stages grouped by paper/size
2. Admin reorders groups (drag-drop) → confirms
3. System writes new `scheduled_start_at` / `scheduled_end_at` for HP12000 stages only, packed sequentially across the selected days (respecting 480 min/day capacity)
4. System triggers a **full reschedule** via `simple_scheduler_wrapper('reschedule_all')` — this automatically cascades all downstream stages (lamination, cutting, binding) to respect the new HP12000 ordering
5. Refresh the board

The full reschedule already handles:
- Predecessor constraints (binding waits for both cover + text printing)
- Resource capacity (laminator won't be overloaded)
- Weekend skipping
- Gap filling

## Implementation

### Files (same as previous plan, with cascade clarification)

**New**: `src/components/schedule/dialogs/MultiShiftGroupingDialog.tsx`
- Fetches HP12000 stages across N consecutive days from `scheduleDays`
- Groups by paper + size using existing `groupStagesByPaperAndSize()`
- Drag-reorderable group cards with cumulative minute indicators and day-break markers
- On confirm:
  1. Packs stages sequentially into day buckets (480 min each)
  2. Updates each stage's `scheduled_start_at` / `scheduled_end_at` via direct Supabase update
  3. Calls `simple_scheduler_wrapper('reschedule_all')` to cascade all downstream stages
  4. Refreshes schedule board

**Modified**: `src/components/schedule/ScheduleBoard.tsx`
- Add "Multi-Shift Grouping" button (admin-only) in header
- Pass required props to dialog

**Modified**: `src/utils/schedule/groupingUtils.ts`
- Extract shared `getStageGroupKey()` helper for consistent grouping

### Cascade approach

```text
Admin reorders HP12000 groups across 3 days
         ↓
Write new times for HP12000 stages only
         ↓
Call simple_scheduler_wrapper('reschedule_all')
         ↓
SQL scheduler automatically repositions:
  - Lamination stages (after their printing predecessor)
  - Cutting stages (after lamination)
  - Binding stages (after all parts complete)
  - etc.
         ↓
Board refresh shows complete updated schedule
```

This is fully doable — no nightmare. The heavy lifting (cascading) is already built into your scheduler.

