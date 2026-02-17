

## Fix: Signed Upload URL Construction Bug

### Root Cause

The `createSignedUploadUrl()` Supabase method returns `{ signedUrl, token, path }` -- there is no `fullPath` property. The current code references `productionUploadData.fullPath` which evaluates to `undefined`, producing upload URLs like `PUT:/undefined?token=...` which the VPS then fails on with a 404.

### Fix

**File: `supabase/functions/label-impose/index.ts`**

Two changes:

1. **Line 107** -- Replace the manual URL construction for production:
   - Before: `` `${supabaseUrl}/storage/v1/${productionUploadData.fullPath}?token=${productionUploadData.token}` ``
   - After: `productionUploadData.signedUrl`

2. **Line 92** -- Replace the manual URL construction for proof:
   - Before: `` `${supabaseUrl}/storage/v1/${proofUploadData.fullPath}?token=${proofUploadData.token}` ``
   - After: `proofUploadData.signedUrl`

### Why This Works

`createSignedUploadUrl()` already returns a fully-formed, ready-to-use signed URL in the `signedUrl` property. There is no need to manually construct it from parts.

### Technical Detail

The Supabase JS v2 `createSignedUploadUrl` return shape:
```text
{
  data: {
    signedUrl: string   // <-- full URL, ready for PUT
    token: string
    path: string
  }
}
```

No other files need changes. After this fix + redeploy, the VPS will receive valid upload URLs and can PUT the generated PDFs directly to storage.

