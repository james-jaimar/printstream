

# Fix: Proof Emails Not Sending

## Root Cause

The `label-notify` edge function code exists but was **never deployed** because it's missing from `supabase/config.toml`. When the "Send Proof" flow calls `supabase.functions.invoke('label-notify', ...)`, the function doesn't exist on the server, so the call fails silently (the error is caught and logged but the user just sees a generic failure).

## Changes Required

### 1. Register `label-notify` in `supabase/config.toml`
Add the function entry with `verify_jwt = false` (it's called server-side with service role context, and the function itself validates the request body).

### 2. Fix CORS Headers in `label-notify/index.ts`
Update the `Access-Control-Allow-Headers` to include all required Supabase client headers:
- `x-supabase-client-platform`
- `x-supabase-client-platform-version`
- `x-supabase-client-runtime`
- `x-supabase-client-runtime-version`

### 3. Fix Sender Address for Proof Requests
Change the `from` address for `proof_request` and `artwork_request` emails from:
- `PrintStream Labels <notifications@printstream.lovable.app>`

To:
- `Proofing at Impress Web <proofing@printstream.impressweb.co.za>`

This matches the verified Resend sender used by the main proofing system (`handle-proof-approval`).

## Technical Details

**File: `supabase/config.toml`**
- Add `[functions.label-notify]` with `verify_jwt = false`

**File: `supabase/functions/label-notify/index.ts`**
- Line 12: Update CORS headers to include all required headers
- Line 146: Change `from` address for multi-contact emails to use `proofing@printstream.impressweb.co.za`
- Line 286: Change `from` address for single-recipient emails to use `proofing@printstream.impressweb.co.za`

After these changes the function will be auto-deployed, and "Send Proof for Approval" will successfully send emails via Resend.

