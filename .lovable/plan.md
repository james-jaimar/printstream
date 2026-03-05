

# Admin-Configurable Queue Merging System

## Problem
Trimming stage merging is hardcoded via `TRIMMING_KEYWORDS` in `FinishingKanbanDashboard.tsx`. The same need exists for finishing stages and potentially other departments. This should be admin-configurable, not hardcoded.

## Solution
A new Supabase table stores "merge groups" — named collections of production stage IDs that should appear as a single queue. All dashboards query this table and apply merging dynamically, replacing the hardcoded trimming logic.

## Database

### New table: `queue_merge_groups`
```sql
create table public.queue_merge_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,              -- e.g. "Trimming", "Finishing"
  display_color text default '#ea580c',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.queue_merge_group_stages (
  id uuid primary key default gen_random_uuid(),
  merge_group_id uuid references queue_merge_groups(id) on delete cascade not null,
  production_stage_id uuid references production_stages(id) on delete cascade not null,
  unique (merge_group_id, production_stage_id)
);
```
RLS: authenticated users can SELECT; admins/managers can INSERT/UPDATE/DELETE.

### Seed data
Migrate existing trimming config: create a "Trimming" merge group and insert the stage IDs for Book Cutting, Final Trimming, and Pre Trim.

## New Hook: `useQueueMergeGroups`
- Fetches all merge groups with their stage IDs from Supabase
- Returns `mergeGroups: { id, name, displayColor, stageIds: string[] }[]`
- Used by all operator dashboards

## New Admin Component: `QueueMergeGroupsManagement`
- Lives in `src/components/tracker/admin/`
- New tab "Queue Merging" on TrackerAdmin page
- UI: list of merge groups, each showing its name + member stages
- Add/edit/delete groups
- Stage picker: multi-select from all `production_stages` to assign to a group
- Shows which stages are already in other groups (prevent duplicates)

## Dashboard Changes (all dashboards)

### Generic merge utility: `applyQueueMerging`
A shared function in `src/utils/tracker/queueMergeUtils.ts`:
```typescript
function applyQueueMerging(configs: QueueConfig[], mergeGroups): QueueConfig[]
```
- For each merge group, finds matching configs by stage ID
- If 2+ match, replaces them with a single merged config (mergedStageIds set)
- Returns the updated config array

### Files to update
1. **FinishingKanbanDashboard.tsx** — remove `TRIMMING_KEYWORDS` and hardcoded merge logic; call `applyQueueMerging(rawConfigs, mergeGroups)` instead
2. **ScoringKanbanDashboard.tsx** — add `useQueueMergeGroups` + `applyQueueMerging` to stage config building
3. **DtpKanbanDashboard.tsx** — same pattern
4. **PackagingShippingKanbanDashboard.tsx** — same pattern
5. **TrackerAdmin.tsx** — add "Queue Merging" tab

### Job aggregation
The existing `mergedStageIds` pattern in `queueJobs` already handles merged queues correctly. Since all dashboards already support this field on `QueueConfig`, no changes needed to job filtering logic — just ensure each dashboard checks `config.mergedStageIds` when building job lists (Finishing already does; others need the same `if/else`).

## Files Summary
- **Create**: `queue_merge_groups` + `queue_merge_group_stages` tables (migration)
- **Create**: `src/hooks/tracker/useQueueMergeGroups.ts`
- **Create**: `src/utils/tracker/queueMergeUtils.ts`
- **Create**: `src/components/tracker/admin/QueueMergeGroupsManagement.tsx`
- **Modify**: `TrackerAdmin.tsx` (add tab)
- **Modify**: `FinishingKanbanDashboard.tsx` (remove hardcoded trimming, use DB-driven merge)
- **Modify**: `ScoringKanbanDashboard.tsx`, `DtpKanbanDashboard.tsx`, `PackagingShippingKanbanDashboard.tsx` (add merge support)

