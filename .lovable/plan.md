

# Plan: Separate Label Customers from Staff Users

## What's Wrong

When you add a contact in the Labels customer area and tick "Create portal login", the system creates a Supabase auth account for that contact. This means those customer contacts appear alongside your staff in the Setup/Admin users list. Customers and staff should be completely separate.

## What Will Change

### 1. Remove the "Create portal login" Feature from Contacts

The contact form currently has a checkbox to create a login account. This will be removed entirely since customer contacts should not be auth users.

**Files changed:**
- `src/components/labels/customers/ContactFormDialog.tsx` -- Remove the "Create portal login" checkbox, password field, and related logic
- `src/hooks/labels/useCustomerContacts.ts` -- Remove `create_login`, `password` from `CreateContactInput` and remove the `signUp` logic from the mutation

### 2. Clean Up Existing Customer Auth Accounts

A database migration will:
- Set `user_id = NULL` on all 4 affected `label_customer_contacts` rows
- Delete the 4 customer entries from `user_roles` 
- Delete the 4 customer entries from `profiles`

The affected accounts are:
- dwain@klintscales.co.za
- james@jaimar.dev
- michael@ontrendmedia.co.za
- bianca@ontrendmedia.co.za

**Note:** The actual `auth.users` entries cannot be deleted via SQL migration (that's a reserved schema). You'll need to manually delete those 4 users from the Supabase Auth dashboard after this migration runs, or we can use an edge function to do it.

### 3. Simplify the `is_label_client` Security Function

Currently `is_label_client()` checks if a `user_id` exists in `label_customer_contacts`. Since contacts will no longer have auth accounts, this function should simply return `false` (no authenticated user will ever be a "label client"). This keeps all existing RLS policies working without changes.

---

## Technical Details

### Migration SQL
```sql
-- Clear user_id references from label_customer_contacts
UPDATE label_customer_contacts SET user_id = NULL WHERE user_id IS NOT NULL;

-- Remove customer entries from user_roles and profiles
DELETE FROM user_roles WHERE user_id IN (
  '6396a811-2807-473c-b429-437a75ec161c',
  '2182756a-51c7-40c9-be51-dc2d6c44ccd9',
  '722e154c-6716-42c6-af09-76024812e77c',
  'e6f69018-c10d-441d-bc68-e44084c0192b'
);
DELETE FROM profiles WHERE id IN (
  '6396a811-2807-473c-b429-437a75ec161c',
  '2182756a-51c7-40c9-be51-dc2d6c44ccd9',
  '722e154c-6716-42c6-af09-76024812e77c',
  'e6f69018-c10d-441d-bc68-e44084c0192b'
);

-- Simplify is_label_client to always return false
CREATE OR REPLACE FUNCTION public.is_label_client(check_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT false $$;
```

### Frontend Changes

**ContactFormDialog.tsx**: Remove ~30 lines covering the create_login checkbox, password input, and related state/validation.

**useCustomerContacts.ts**: Remove `create_login` and `password` from `CreateContactInput`. Remove the `signUp` block from the mutation. Always set `user_id: null` on insert.

### Post-Migration Manual Step

After the migration, delete these 4 users from the Supabase Auth dashboard:
- dwain@klintscales.co.za
- james@jaimar.dev
- michael@ontrendmedia.co.za
- bianca@ontrendmedia.co.za

### Future Consideration

If you later want customers to have portal access (e.g., to view proofs online), a separate authentication system can be built using a `label_customer_auth` table with hashed passwords, completely independent of the staff auth system. This would be a separate feature.

