

## Fix: Add "Viewer" role to UserForm dropdown

The edit user dialog on `/tracker/admin` uses `src/components/users/UserForm.tsx`, which has its own hardcoded `roleOptions` array (line 51-57) that's missing the `viewer` option. The `RoleSelector.tsx` we updated previously is a different component not used in this dialog.

### Changes

**1. `src/components/users/UserForm.tsx`** (line 51-57)
Add `{ value: 'viewer', label: 'Viewer' }` to the `roleOptions` array.

**2. `src/components/users/PremiumUserManagement.tsx`** (line 102-139)
Add a `viewer` case to the `getRoleConfig` switch so viewer users display with a proper badge/label instead of falling through to the default "User" label.

