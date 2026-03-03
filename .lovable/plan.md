

## Fix: Add "Viewer" role to RoleSelector dropdown

The `RoleSelector.tsx` component has a hardcoded `roleOptions` array that doesn't include the `viewer` role. Need to add it.

### Change: `src/components/users/RoleSelector.tsx`

Add a new entry to the `roleOptions` array:

```ts
{
  value: 'viewer',
  label: 'Viewer',
  description: 'Read-only access for sales and external staff'
}
```

This will make the "Viewer" option appear in the Role dropdown when editing or creating users.

