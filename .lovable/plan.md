

## Fix Imposition: Stop Passing Base64 Through Edge Function

### Root Cause Analysis

There are three cascading failures:

1. **Edge function memory limit (150MB)**: The VPS returns the entire imposed PDF as base64 in the JSON response. The edge function then decodes it with `atob()` and converts to `Uint8Array` -- for a multi-meter 4x3 grid PDF, this easily exceeds 150MB and crashes the edge function.

2. **VPS crash**: The heavy PDF processing on the first request can also crash/exhaust the VPS, making it return `503 - no available server` for all subsequent calls.

3. **Rapid-fire requests**: When calls fail fast (503 in ~100ms), the sequential loop fires all 7+ runs within seconds, hammering the dead VPS.

### Solution: Two-Part Fix

#### Part 1 -- Edge Function: Have VPS upload directly to storage (eliminates base64)

Change the architecture so the edge function sends Supabase storage credentials to the VPS, and the VPS uploads the PDFs directly -- returning only the URLs. This eliminates the massive base64 payload entirely.

**File: `supabase/functions/label-impose/index.ts`**

Changes:
- Stop sending `return_base64: true`
- Instead, send a `storage_config` object with: bucket name, upload path, and a short-lived signed upload URL (or service role key)
- The VPS saves to disk, uploads via HTTP PUT to the signed URL, and returns just the public URLs
- Remove all `atob()` / `Uint8Array` / storage upload logic from the edge function
- The edge function only updates the `label_runs` table with the URLs the VPS returns

The payload to the VPS will change from:
```text
{
  dieline: {...},
  slots: [...],
  meters: 1,
  include_dielines: true,
  return_base64: true        <-- REMOVED
}
```

To:
```text
{
  dieline: {...},
  slots: [...],
  meters: 1,
  include_dielines: true,
  upload_config: {
    production_upload_url: "<signed-upload-url-for-production.pdf>",
    proof_upload_url: "<signed-upload-url-for-proof.pdf>",
    production_public_url: "<public-url-for-production.pdf>",
    proof_public_url: "<public-url-for-proof.pdf>"
  }
}
```

The edge function will generate signed upload URLs using `supabase.storage.from('label-files').createSignedUploadUrl(path)` before calling the VPS.

#### Part 2 -- Client: Add delay and abort-on-failure

**File: `src/hooks/labels/useBatchImpose.ts`**

Changes:
- Add a 2-second delay between each run to give the VPS time to clear memory
- If 2 consecutive runs fail, abort the remaining runs (stop hammering a dead server)
- Show the actual error message from the VPS in the toast (e.g., "503 - no available server") instead of generic "Unknown error"

### VPS-Side Changes Required (outside Lovable)

Your VPS `/imposition/labels` endpoint will need a small update:
- Accept the `upload_config` object
- After generating the PDFs, upload them directly to the signed URLs via HTTP PUT
- Return the public URLs in the response instead of base64 data
- This keeps the heavy PDF data on the VPS (8GB RAM) rather than routing it through the 150MB edge function

### Sequence After Fix

```text
Client                    Edge Function              VPS (8GB)            Storage
  |                            |                       |                    |
  |-- impose run 1 ---------->|                       |                    |
  |                            |-- create signed URLs ------------------>  |
  |                            |-- POST /imposition/labels (with URLs) -->|
  |                            |                       |-- generate PDF    |
  |                            |                       |-- PUT upload ---->|
  |                            |                       |-- return URLs --->|
  |                            |<-- URLs only (tiny)---|                    |
  |                            |-- update label_runs   |                    |
  |<-- success ----------------|                       |                    |
  |                            |                       |                    |
  | (2 second delay)           |                       |                    |
  |                            |                       |                    |
  |-- impose run 2 ---------->|                       |                    |
  ...
```

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/label-impose/index.ts` | Generate signed upload URLs, send to VPS, remove base64 decoding/upload logic |
| `src/hooks/labels/useBatchImpose.ts` | Add 2s delay between runs, abort after 2 consecutive failures, better error messages |

### Technical Notes

- `createSignedUploadUrl` generates a short-lived URL that allows one PUT upload -- no need to expose the service role key to the VPS
- The edge function memory usage drops from potentially 100MB+ to under 1MB (just JSON with URLs)
- The VPS already has `httpx` installed, so uploading via signed URL is straightforward
- Your VPS endpoint will need to accept the new `upload_config` field and handle the upload -- this is a Python-side change you will need to make

