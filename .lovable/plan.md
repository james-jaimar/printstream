

## Fix: Add VPS 503 Retry Logic in Edge Function

### The Problem
The VPS imposition server returns `503 - Server is busy` when it's already processing a job. The `label-impose` edge function treats this as a hard failure and returns an error immediately, which causes the batch to fail after 2 consecutive 503s.

### The Fix
Add retry-with-backoff logic in `supabase/functions/label-impose/index.ts` specifically for 503 responses. Before giving up, the edge function should wait and retry a few times.

### Changes

#### Edge Function: `supabase/functions/label-impose/index.ts`

Add a retry loop around the VPS fetch call:

```text
Retry strategy:
- Max retries: 3
- Delay between retries: 5s, 10s, 15s (linear backoff)
- Only retry on 503 status
- All other errors fail immediately as before
```

The retry loop wraps the existing `fetch()` call to the VPS endpoint. On a 503 response, instead of returning an error, the function waits and tries again. If all retries are exhausted, it falls back to the existing error handling (reset status to "planned" and return error).

### Technical Detail

In the edge function, replace the single fetch + error handling block with:

```typescript
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5000; // 5s, 10s, 15s

let response: Response | null = null;
let lastError: string = '';

for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  if (attempt > 0) {
    const waitMs = attempt * RETRY_BASE_DELAY_MS;
    console.log(`VPS busy, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  const controller = new AbortController();
  const acceptTimeout = setTimeout(() => controller.abort(), 10000);

  try {
    response = await fetch(VPS_URL, { ...options, signal: controller.signal });
    clearTimeout(acceptTimeout);

    if (response.status === 503 && attempt < MAX_RETRIES) {
      lastError = await response.text();
      response = null; // retry
      continue;
    }
    break; // success or non-503 error
  } catch (fetchError) {
    clearTimeout(acceptTimeout);
    if (fetchError.name === "AbortError") {
      // VPS accepted, processing async
      response = null;
      break;
    }
    // Connection error -- no retry
    throw fetchError;
  }
}
```

The rest of the existing response handling (success path, error path, AbortError path) remains unchanged.

### No Other Changes Needed
- The `useBatchImpose` hook already has sequential execution and consecutive failure tracking
- The polling logic is unaffected
- The client-side code doesn't need changes

