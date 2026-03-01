
# Fix: Proof Reminder Settings Save Failing

## Problem

The "Save Settings" button fails because the `app_settings` table has Row Level Security (RLS) enabled with only a **SELECT** policy. There are no INSERT or UPDATE policies, so the upsert from the frontend is blocked by Supabase.

## Solution

Add an INSERT and UPDATE RLS policy to the `app_settings` table, restricted to admin users only.

## Technical Detail

### Database Migration

Add two RLS policies to `app_settings`:

1. **INSERT policy** (`admin_insert_app_settings`): Allows authenticated users with `role = 'admin'` in the `user_roles` table to insert rows.
2. **UPDATE policy** (`admin_update_app_settings`): Same admin check for updating rows.

```sql
CREATE POLICY admin_insert_app_settings ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY admin_update_app_settings ON public.app_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );
```

No frontend code changes needed -- the existing save logic will work once the policies are in place.
