

# Read-Only Sales User Login

## Approach

Add a new `viewer` role to the existing `user_roles` system. Sales users get this role and can see 5 tracker tabs (Dashboard, Orders, Production, Kanban, Schedule) -- all fully read-only. No new database tables needed, just a new enum value and UI guards.

## Database Migration

Add `'viewer'` to the `app_role` enum:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
```

## Code Changes

### 1. Update type definitions

**`src/types/user-types.ts`** and **`src/hooks/tracker/useUserRole.tsx`**: Add `'viewer'` to `UserRole` type.

### 2. Update `useUserRole` hook

- Add `isViewer: boolean` to `UserRoleResponse`
- Detect `viewer` role from `user_roles` table (same pattern as admin check)
- Return `isViewer` derived property: `userRole === 'viewer'`

### 3. Update `RoleAwareLayout` routing

When `isViewer` is true, redirect `/tracker` to `/tracker/dashboard` (same as admin/manager). No special layout needed -- they use the same `TrackerLayout`.

### 4. Update `Index.tsx` routing

Add viewer users to the redirect logic: send them to `/tracker/dashboard` on login.

### 5. Filter navigation tabs for viewers

**`src/components/tracker/DynamicHeader.tsx`**: When `isViewer`, only show tabs: Dashboard, Orders, Production, Kanban, Schedule. Hide: Worksheets, Setup.

### 6. Create a `ReadOnlyGuard` context

**New file: `src/contexts/ReadOnlyContext.tsx`**

A React context that provides `isReadOnly: boolean` based on `isViewer` from `useUserRole`. Wrap the tracker layout with this provider.

### 7. Disable edit actions across the 5 allowed views

Use the `isReadOnly` context to conditionally hide or disable:
- **Orders (TrackerJobs)**: Hide "New Job", "Upload", "Edit", "Delete" buttons. Disable drag-drop, inline editing.
- **Production (TrackerProduction)**: Hide stage action buttons (advance, complete, move). Disable status toggles.
- **Kanban (TrackerKanban)**: Disable drag-and-drop between columns. Hide action menus on cards.
- **Dashboard (TrackerDashboard)**: Already mostly read-only; hide any action buttons if present.
- **Schedule (ScheduleBoardPage)**: Disable drag-to-reschedule. Hide scheduling controls.

The pattern: check `const { isReadOnly } = useReadOnly()` in each component, and conditionally render action elements with `{!isReadOnly && <ActionButton />}`.

### 8. User management

Admins can assign the `viewer` role to sales users through the existing user management UI (`TrackerUsers` page). The role dropdown already pulls from `UserRole` type -- adding `'viewer'` there makes it available.

## Summary of files to change

| File | Change |
|------|--------|
| Migration SQL | Add `viewer` to `app_role` enum |
| `src/types/user-types.ts` | Add `'viewer'` to `UserRole` |
| `src/hooks/tracker/useUserRole.tsx` | Detect viewer role, expose `isViewer` |
| `src/contexts/ReadOnlyContext.tsx` | New context providing `isReadOnly` |
| `src/components/tracker/RoleAwareLayout.tsx` | Route viewers to dashboard |
| `src/pages/Index.tsx` | Redirect viewers to tracker |
| `src/components/tracker/DynamicHeader.tsx` | Filter tabs for viewers |
| `src/components/TrackerLayout.tsx` | Wrap with ReadOnlyProvider |
| Various view components | Guard edit actions with `isReadOnly` |

