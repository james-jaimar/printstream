

# Fix: Viewer role sees no orders in Orders, Production, Kanban

## Root Cause

All three pages use `useAccessibleJobs({ permissionType: 'manage' })`:

- **Orders** (`ProductionManagerView.tsx` line 25): `permissionType: 'manage'`
- **Production** (`TrackerProduction.tsx` line 49): `permissionType: 'manage'`
- **Kanban** (`MultiStageKanban`, `EnhancedProductionKanban`, `ProductionKanban`): all `permissionType: 'manage'`

The DB function `get_user_accessible_jobs_with_batch_allocation` checks stage permissions (`can_manage`) for the user. A viewer has no `can_manage` on any stage, so it returns zero jobs.

Schedule works because `useScheduleReader` queries `job_stage_instances` directly, bypassing the permission-gated RPC.

## Fix

For each of these components, detect if the user is a viewer and downgrade `permissionType` to `'view'`:

### Files to change

| File | Current | Fix |
|------|---------|-----|
| `src/components/tracker/views/ProductionManagerView.tsx` | `permissionType: 'manage'` | Use `'view'` for viewers |
| `src/pages/tracker/TrackerProduction.tsx` | `permissionType: 'manage'` | Use `'view'` for viewers |
| `src/components/tracker/ProductionKanban.tsx` | `permissionType: 'manage'` | Use `'view'` for viewers |
| `src/components/tracker/EnhancedProductionKanban.tsx` | `permissionType: 'manage'` | Use `'view'` for viewers |
| `src/components/tracker/MultiStageKanban.tsx` | `permissionType: 'manage'` | Use `'view'` for viewers |
| `src/components/tracker/modals/OrderSearchModal.tsx` | `permissionType: 'manage'` | Use `'view'` for viewers |

Each file will add:
```typescript
const { isViewer } = useUserRole();
// ...
useAccessibleJobs({ permissionType: isViewer ? 'view' : 'manage' })
```

Most of these files already import `useUserRole` or have access to `isReadOnly` context, so the change is minimal.

