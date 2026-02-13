

# Client Portal Account Management & Password Reset

## Overview

Add full account management for client portal users, including a self-service password reset flow (via email), a client-side account/profile page, and enhanced admin-side portal access controls with visibility into login status.

## What's Being Built

### 1. Client-Side: Forgot Password Flow
- **"Forgot password?" link** on the login page (`ClientPortalLogin.tsx`)
- Clicking it shows an email input -- client enters their email and receives a password reset link via Resend
- The link contains a time-limited token (1 hour expiry) and directs to `/labels/portal/reset-password?token=...`
- New **Reset Password page** where they enter a new password

### 2. Client-Side: Account/Profile Page
- New route `/labels/portal/account` accessible from the dashboard header
- Shows: name, email, company name (read-only from their contact record)
- **Change Password** section: current password + new password + confirm
- **Sign Out** button (already exists in dashboard header, also here)

### 3. Edge Function: New Endpoints on `label-client-auth`
- **`POST /forgot-password`**: Accepts `{ email }`, generates a reset token (random UUID stored in a new `password_reset_token` + `password_reset_expires` column on `label_client_auth`), sends email via Resend with reset link
- **`POST /reset-password`**: Accepts `{ token, new_password }`, validates token hasn't expired, hashes new password, clears token
- **`POST /change-password`**: Accepts `{ current_password, new_password }` with client JWT auth, verifies current password, updates hash

### 4. Database Migration
Add columns to `label_client_auth`:
```sql
ALTER TABLE public.label_client_auth
  ADD COLUMN IF NOT EXISTS password_reset_token uuid,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;
```

### 5. Admin-Side: Enhanced Portal Access Indicators
In `CustomerDetailPanel.tsx`, update the contact list to show:
- "Portal Active" badge (green) when `label_client_auth` record exists and `is_active = true`
- "Last Login" timestamp from `last_login_at`
- Add "Revoke Portal Access" option in the 3-dot menu (sets `is_active = false` on auth record)
- Add "Send Password Reset" option in the 3-dot menu (triggers the forgot-password flow for that contact's email)

## Technical Flow

```text
CLIENT FORGOT PASSWORD:
  Login page --> "Forgot password?" link
    --> Enter email --> POST /forgot-password
    --> Edge fn generates reset token, stores in DB
    --> Sends email via Resend with link to /labels/portal/reset-password?token=xxx
    --> Client clicks link --> enters new password
    --> POST /reset-password --> validates token + expiry --> updates hash --> done

CLIENT CHANGE PASSWORD (logged in):
  Account page --> current + new password
    --> POST /change-password (with JWT)
    --> Verifies current password, updates hash

ADMIN CONTROLS:
  Customer detail panel --> 3-dot menu on contact
    --> "Set Portal Password" (existing)
    --> "Send Password Reset" (new - triggers email)
    --> "Revoke Portal Access" (new - disables auth)
```

## Files Summary

| File | Action |
|------|--------|
| `supabase/functions/label-client-auth/index.ts` | Add 3 new endpoints: forgot-password, reset-password, change-password |
| `src/pages/labels/portal/ClientPortalLogin.tsx` | Add "Forgot password?" link + email input mode |
| `src/pages/labels/portal/ClientResetPassword.tsx` | New page for token-based password reset |
| `src/pages/labels/portal/ClientAccount.tsx` | New page for profile view + change password |
| `src/pages/labels/portal/index.ts` | Export new pages |
| `src/pages/labels/portal/ClientPortalDashboard.tsx` | Add "Account" link in header |
| `src/components/labels/customers/CustomerDetailPanel.tsx` | Add portal status badges, revoke access + send reset options |
| `src/hooks/labels/useClientAuth.tsx` | Add changePassword method to context |
| `src/App.tsx` | Add routes for `/labels/portal/reset-password` and `/labels/portal/account` |
| Database migration | Add `password_reset_token` and `password_reset_expires_at` columns to `label_client_auth` |

