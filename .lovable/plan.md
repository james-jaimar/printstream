

## Labels Division Users — Group-Based Access and Auto-Routing

### Overview

Create a "Labels" user group in the existing `user_groups` system. Users assigned to this group will:
- Be redirected straight to `/labels` on login (bypassing the app selector)
- Have the Labels Division as their home base
- Be able to view Tracker/Printstream in read-only mode (no changes needed to those routes for now — just the routing logic)

No new database tables or roles are needed. We leverage the existing `user_groups` + `user_group_memberships` infrastructure.

### Step 1: Create the "Labels" User Group

Insert a new group via the Supabase insert tool:

```sql
INSERT INTO user_groups (name, description, permissions)
VALUES ('Labels', 'Labels Division staff — orders, proofing, production', '{"labels_access": true}'::jsonb);
```

Admins can then assign users to this group through the existing user management UI.

### Step 2: Detect Labels Group Membership

**File: `src/hooks/tracker/useUserRole.tsx`**

Add a new derived property `isLabelsUser` that checks if the user belongs to the "Labels" group. The hook already fetches `groupMemberships` with group names, so we just need to add:

```typescript
const isInLabelsGroup = groupNames.some(name => name.toLowerCase() === 'labels');
```

And expose `isLabelsUser` in the return object.

### Step 3: Auto-Redirect Labels Users on Login

**File: `src/pages/Index.tsx`**

After existing operator redirects, add a check for Labels group membership. If the user is a Labels user (and not an admin/manager), redirect to `/labels`:

```typescript
if (isLabelsUser && !isAdmin && !isManager) {
  navigate('/labels');
  return;
}
```

This requires the `useUserRole` hook to expose `isLabelsUser`, which we add in Step 2.

### Step 4: Update AppSelector for Labels-Only Users

**File: `src/pages/AppSelector.tsx`**

Since Labels-only users go straight to `/labels`, they won't normally see the AppSelector. But if they navigate back to `/`, the existing redirect in Index.tsx will send them to `/labels` again. No changes needed here.

### Step 5: Update RoleAwareLayout for Labels Users

**File: `src/components/tracker/RoleAwareLayout.tsx`**

If a Labels user navigates to `/tracker`, they should still be able to view it (read-only per your preference). The existing `RoleAwareLayout` will default them to the dashboard view, which is fine. No blocking needed.

### Summary of File Changes

| File | Change |
|---|---|
| `src/hooks/tracker/useUserRole.tsx` | Add `isLabelsUser` boolean based on "Labels" group membership; expose in return |
| `src/pages/Index.tsx` | Add Labels user redirect to `/labels` after operator checks |
| Database | Insert "Labels" user group |

### What This Enables

- Assign any existing staff user to the "Labels" group via admin user management
- They auto-land on the Labels dashboard on login
- They can still browse Tracker/Printstream if needed (read-only intent, no enforcement yet)
- Admins/managers with Labels group membership still see the full app selector (they're not restricted)

