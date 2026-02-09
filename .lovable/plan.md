

# Fix Client Portal Login - Add JWT Secret

## What's Happening
The client portal login fails because the edge functions need a secret key to sign/verify login tokens. This key exists in your Supabase project but isn't available to the edge functions yet.

## Steps

### Step 1: You provide the JWT Secret
- Go to **Supabase Dashboard > Settings > API** (or the JWT Keys page you're on)
- Click **"Reveal"** on the Legacy JWT Secret
- Copy the value

### Step 2: Add it as an Edge Function secret
- We'll store it as `JWT_SECRET` so the edge functions can access it

### Step 3: Update Edge Functions with safety checks
- Add a clear error message if the secret is ever missing
- Both `label-client-auth` and `label-client-data` will be updated

### About the "Upgrade to Signing Keys" recommendation
- That upgrade is for Supabase's **built-in auth** (staff login) — not related to our custom client portal
- You can migrate to signing keys later if you want, but it won't affect the client portal at all
- The legacy JWT secret works perfectly for our use case

## Technical Details
- **Files to modify**: `supabase/functions/label-client-auth/index.ts`, `supabase/functions/label-client-data/index.ts`
- **Secret to add**: `JWT_SECRET`
- Both functions already reference `Deno.env.get("JWT_SECRET")` as a fallback, so once the secret is added, login should work immediately

