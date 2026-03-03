

# Read-Only Sales User Login — IMPLEMENTED ✅

## What was done

Added a `viewer` role for read-only sales users. No database migration needed — `user_roles.role` is a text column.

### Files changed

| File | Change |
|------|--------|
| `src/types/user-types.ts` | Added `'viewer'` to `UserRole` |
| `src/hooks/tracker/useUserRole.tsx` | Detects viewer role from `user_roles` table, exposes `isViewer` |
| `src/contexts/ReadOnlyContext.tsx` | **New** — provides `isReadOnly` boolean via context |
| `src/components/TrackerLayout.tsx` | Wrapped with `ReadOnlyProvider` |
| `src/components/tracker/RoleAwareLayout.tsx` | Routes viewers to dashboard |
| `src/pages/Index.tsx` | Redirects viewers to `/tracker/dashboard` |
| `src/components/tracker/DynamicHeader.tsx` | Filters tabs to 5 for viewers (Dashboard, Orders, Production, Kanban, Schedule) |
| `src/components/tracker/views/ProductionManagerView.tsx` | All action callbacks set to `undefined` when read-only |
| `src/pages/ScheduleBoardPage.tsx` | Hides reschedule button for viewers |

## How to assign a sales user

Insert a row into `user_roles` with `role = 'viewer'` for the user's ID. The existing admin user management UI now shows "viewer" as a role option.

## Remaining work (future)

- Add `isReadOnly` guards to Kanban sub-components (drag-and-drop disable)
- Add `isReadOnly` guards to TrackerProduction action buttons
- Add `isReadOnly` guards to Dashboard action buttons (if any)
