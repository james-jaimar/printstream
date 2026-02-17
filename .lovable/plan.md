

## VPS Diagnostic Tool: Direct Health Check and Test Imposition

### Problem

Runs are failing on LBL-2026-0003 but all 9 succeeded on LBL-2026-0001. The edge function logs are empty in analytics (likely a retention/indexing lag). You need to determine whether failures are caused by:

- (a) The VPS Docker container being unavailable/overloaded
- (b) The edge function invocation failing before reaching the VPS
- (c) Network issues between Supabase edge functions and your VPS

### Solution: Two-Part Diagnostic

#### 1. New Edge Function: `label-vps-health`

A lightweight edge function that hits the VPS directly and reports back detailed diagnostics:

- **Ping test**: `GET /` or `/health` on `pdf-api.jaimar.dev` -- measures response time
- **Endpoint probe**: `POST /imposition/labels` with a minimal invalid payload to confirm the endpoint is alive and authenticating (expects a 400/422, NOT a 503)
- **DNS + TLS timing**: Records how long the connection takes
- Returns a structured report:
  - VPS reachable: yes/no
  - Response time (ms)
  - HTTP status received
  - Response body snippet
  - Timestamp

#### 2. Client-Side "Test VPS" Button

Add a "Test VPS" button to the Labels page (near the order detail or in a diagnostics section) that:

- Calls the `label-vps-health` edge function
- Displays the result in a toast or dialog
- Shows: reachable/unreachable, response time, any error details

#### 3. Enhanced Batch Error Capture

Right now, `supabase.functions.invoke()` can fail silently when the edge function itself fails to boot (cold start timeout, memory limit). The `createImposition` function in `vpsApiService.ts` throws on `error` but does not capture HTTP-level failures from the invoke response.

Add a check: if `supabase.functions.invoke` returns a non-2xx response in `data`, log the full response before throwing.

### Technical Details

**New file: `supabase/functions/label-vps-health/index.ts`**

```typescript
// Hits VPS with 3 probes:
// 1. GET / (basic connectivity)
// 2. GET /health (if endpoint exists)  
// 3. POST /imposition/labels with empty body (confirm auth + endpoint alive)
// Returns timing and status for each probe
```

**Modified file: `src/services/labels/vpsApiService.ts`**

- Add `checkVpsHealth()` function that calls the new edge function (replace the existing naive health check)

**Modified file: `src/components/labels/LabelOrderDetail.tsx`** (or wherever the order detail/runs UI lives)

- Add a "Test VPS Connection" button
- Display results in a dialog showing all 3 probe results with timing

### What This Tells You

| Result | Meaning |
|--------|---------|
| All 3 probes succeed, fast (<500ms) | VPS Docker is healthy; failures are in the Supabase edge function layer |
| Probes timeout or get connection refused | Docker container is down or networking issue |
| Probe 3 returns 503 | VPS is up but busy (other Docker container hogging resources) |
| Probe 1 works but probe 3 returns 503 | The imposition endpoint specifically is overloaded |

### Files

| File | Action |
|------|--------|
| `supabase/functions/label-vps-health/index.ts` | New -- VPS diagnostic edge function |
| `src/services/labels/vpsApiService.ts` | Update `checkVpsHealth` to use new edge function |
| `src/components/labels/LabelRunsCard.tsx` (or equivalent) | Add "Test VPS" button with result display |

