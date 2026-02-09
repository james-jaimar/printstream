

# Plan: Independent Client Portal Authentication

## Overview

Build a self-contained authentication system for label customers that is completely separate from the staff `auth.users` system. Customers will log in with email + password stored in a dedicated `label_client_auth` table, with sessions managed via a custom JWT issued by an edge function.

## How It Works

**Login flow:**
1. Customer enters email + password on the portal login page
2. Frontend calls an edge function `label-client-auth`
3. Edge function looks up the contact in `label_customer_contacts`, verifies the bcrypt password hash from `label_client_auth`, and returns a signed JWT containing `contact_id`, `customer_id`, and `email`
4. Frontend stores the token in localStorage and uses it for all portal API calls

**Data access flow:**
1. Portal pages call a second edge function `label-client-data` with the JWT in the Authorization header
2. The edge function verifies the JWT, extracts `customer_id`, and queries Supabase using the service role key (bypassing RLS)
3. Returns only orders/items belonging to that customer

**Admin sets passwords:**
1. In the Contacts dialog, admin gets a "Set Portal Password" field
2. Password is sent to the `label-client-auth` edge function with the admin's staff JWT for authorization
3. Edge function hashes the password with bcrypt and stores it in `label_client_auth`

## Database Changes

### New table: `label_client_auth`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| contact_id | uuid (FK -> label_customer_contacts.id, UNIQUE) | Links to the contact |
| password_hash | text | bcrypt hash |
| is_active | boolean | Can this contact log in? |
| last_login_at | timestamptz | Tracks last login |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

RLS: Enabled with no SELECT policy (only accessed via edge functions using service role).

## Edge Functions

### 1. `label-client-auth`

Handles three operations:
- **POST /login**: Accepts `{ email, password }`, verifies credentials, returns a signed JWT
- **POST /set-password**: Accepts `{ contact_id, password }` with admin JWT auth, creates/updates the password hash
- **POST /verify**: Accepts `{ token }`, verifies the JWT and returns the decoded payload

Uses the `SUPABASE_SERVICE_ROLE_KEY` to access `label_client_auth` (bypasses RLS). Signs JWTs using `SUPABASE_JWT_SECRET`.

### 2. `label-client-data`

Handles customer data requests, verified via the custom JWT:
- **GET /orders**: Returns all orders for the customer
- **GET /order/:id**: Returns a specific order with items/runs
- **GET /approvals/:orderId**: Returns approval history
- **POST /approve**: Submit proof approval/rejection

## Frontend Changes

### 1. Client Auth Context (`src/hooks/labels/useClientAuth.tsx`)

A new, separate auth context for the portal (not connected to the staff `AuthProvider`):
- Stores JWT token in localStorage under `label_client_token`
- Provides `login()`, `logout()`, `isAuthenticated`, `contact` info
- Auto-checks token validity on mount

### 2. Client Portal Guard (`src/components/labels/portal/ClientPortalGuard.tsx`)

Replaces the current `<ProtectedRoute>` wrapper on portal routes. Checks `label_client_token` instead of Supabase session.

### 3. Updated Portal Login (`ClientPortalLogin.tsx`)

- Calls `label-client-auth` edge function instead of `supabase.auth.signInWithPassword`
- Stores returned JWT in localStorage

### 4. Updated Portal Dashboard + Order Detail

- Replace `useClientOrders`, `useClientOrder`, `useClientProfile` hooks to call `label-client-data` edge function instead of direct Supabase queries
- Create new `useClientPortalData.ts` hook that calls the edge function with the stored JWT

### 5. Contact Form Enhancement

- Add a "Portal Access" section in `ContactFormDialog.tsx` with a password field
- When admin sets a password, calls `label-client-auth/set-password` with the admin's staff auth token
- Shows a badge on contacts that have portal access enabled

### 6. Route Changes in `App.tsx`

- Replace `<ProtectedRoute>` with `<ClientPortalGuard>` for `/labels/portal` and `/labels/portal/order/:orderId`

## Files to Create

- `supabase/functions/label-client-auth/index.ts` -- Login, set-password, verify
- `supabase/functions/label-client-data/index.ts` -- Orders, approvals, proof actions
- `src/hooks/labels/useClientAuth.tsx` -- Client auth context + provider
- `src/hooks/labels/useClientPortalData.ts` -- Data hooks calling edge function
- `src/components/labels/portal/ClientPortalGuard.tsx` -- Route guard

## Files to Modify

- `src/pages/labels/portal/ClientPortalLogin.tsx` -- Use new auth flow
- `src/pages/labels/portal/ClientPortalDashboard.tsx` -- Use new data hooks
- `src/pages/labels/portal/ClientOrderDetail.tsx` -- Use new data hooks
- `src/components/labels/customers/ContactFormDialog.tsx` -- Add portal password field
- `src/hooks/labels/useClientPortal.ts` -- Remove old auth-dependent hooks (keep admin-only hooks)
- `src/App.tsx` -- Swap ProtectedRoute for ClientPortalGuard on portal routes

## Security Considerations

- Passwords are bcrypt-hashed server-side in the edge function (never stored in plaintext)
- `label_client_auth` table has RLS enabled with no public policies -- only accessible via service role in edge functions
- JWTs are signed with `SUPABASE_JWT_SECRET` and have a 24-hour expiry
- The `label-client-data` edge function scopes ALL queries to the authenticated customer's `customer_id` -- no cross-customer data leakage
- Admin set-password endpoint validates the caller is an authenticated staff user before allowing password changes

