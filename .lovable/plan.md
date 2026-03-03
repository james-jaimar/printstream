

# Performance Analysis: System-Wide Lag

## Findings

### Critical Issue 1: N+1 Batch Query Storm (20+ individual requests per page load)

The network logs show **20+ individual queries** to `batches?select=id&name=eq.D430xxx` with `.single()`, all fired simultaneously and all returning **406 errors** (no matching rows). This is a classic N+1 query problem.

**Root cause chain:**
1. Every job in a list renders a `BatchSplitButton` component
2. `BatchSplitButton` wraps each job in a `BatchSplitDetector`
3. `BatchSplitDetector` logs extensively for EVERY job (even non-batch jobs) -- confirmed by the 30+ console log entries
4. Meanwhile, `useBatchAwareProductionJobs.tsx` (lines 287-307) runs a **serial loop** querying `batches` table individually for each BATCH- prefixed job using `.single()`

The 406 errors happen because regular jobs (D430800 etc.) are being looked up in the `batches` table by name, but they don't exist there. This wastes API calls and generates unnecessary errors.

### Critical Issue 2: BatchSplitDetector runs for EVERY job

`BatchSplitDetector` (line 72-79) logs a debug object for **every single job** on every render, even when `isBatchJob` is `false`. This is pure waste -- both in console noise and in component overhead.

### Critical Issue 3: Verbose console logging throughout

The `BatchSplitDetector` alone produces 30+ log entries per page load. Combined with other hooks logging (useAccessibleJobs, useDataManager), this creates significant I/O overhead.

## Plan

### 1. Eliminate N+1 batch queries in `useBatchAwareProductionJobs.tsx`

Replace the serial loop (lines 287-307) that queries `batches` one-by-one with a single batched `.in()` query:

```
// Instead of:  for each batchJob -> query batches by name -> query batch_job_references
// Do:          collect all batch names -> single .in('name', names) query -> single batch refs query
```

### 2. Remove verbose logging from BatchSplitDetector

Remove the `console.log` at lines 72-79 in `BatchSplitDetector.tsx`. It fires for every job on every render and provides no value for non-batch jobs.

### 3. Short-circuit BatchSplitButton for non-batch jobs

In `BatchSplitButton.tsx` or the parent `JobActionButtons.tsx`, skip rendering `BatchSplitDetector` entirely when the job is clearly not a batch master (no `is_batch_master` flag and no `BATCH-` prefix). This eliminates unnecessary component mounts and effect runs.

### 4. Remove excessive debug logging across hooks

Strip or gate behind a debug flag the verbose logging in:
- `useAccessibleJobsSimple.tsx` (lines with emoji prefixes)
- `useDataManager.tsx` auto-refresh logs
- `BatchSplitDetector.tsx`

### Summary of Impact

| Fix | Queries Saved | Impact |
|-----|--------------|--------|
| Batch N+1 elimination | ~20-40 per page load | Major DB/network reduction |
| BatchSplitDetector short-circuit | ~30 component mounts | Reduces render overhead |
| Logging cleanup | N/A | Reduces I/O + easier debugging |

These are all app-side bottlenecks, not internet speed issues. The lag is caused by the app firing dozens of unnecessary individual database queries per page load.

