

## Fix Label Imposition: Two Root Causes

The imposition is failing due to two separate issues that compound each other.

### Problem 1: Storage File Size Limit (413 Payload Too Large)

The `label-files` storage bucket has a **50MB file size limit**. A production PDF with 84 frames in a 4x3 grid of 73x103mm labels easily exceeds this. This is what the VPS hits when it tries to PUT the generated PDF to the signed URL.

**Fix:** Increase the bucket's `file_size_limit` to 500MB (or remove it entirely) via a SQL migration:

```sql
UPDATE storage.buckets 
SET file_size_limit = 524288000  -- 500MB
WHERE id = 'label-files';
```

### Problem 2: Edge Function Timeout (504 Gateway Timeout)

The edge function calls the VPS and **waits synchronously** for it to finish generating + uploading the PDF. For large runs (84+ frames), this exceeds the ~150s edge function timeout.

**Fix:** Make the VPS call fire-and-forget. The edge function should:
1. Generate signed upload URLs
2. Send the request to the VPS **without awaiting** the full response (or with a very short timeout just to confirm the VPS accepted the job)
3. Return immediately to the client with a "processing" status
4. The VPS uploads directly to storage and updates `label_runs` via a callback or the edge function polls

However, a simpler intermediate fix: **have the VPS call back a small edge function** to update the `label_runs` table when done, and change the current edge function to fire-and-forget.

### Implementation Plan

**Step 1 — SQL Migration**: Increase `label-files` bucket size limit to 500MB.

**Step 2 — Edge Function (`label-impose/index.ts`)**: Change the VPS call to not await the full response. Instead:
- Send the request to VPS with the upload config AND a callback payload (run_id, public URLs)
- Return immediately with `{ success: true, status: "processing" }`
- The VPS handles uploading + updating the DB itself

**Step 3 — VPS update (`imposition.py`)**: After uploading PDFs to storage, the VPS makes a small PATCH call to Supabase (using the service role key passed in the request) to update `label_runs` with the PDF URLs, frame count, and status.

**Step 4 — Frontend (`useBatchImpose.ts`)**: After firing the impose request, poll the `label_runs` table for status changes instead of relying on a synchronous response. Show a "processing" state per run.

### Technical Details

**Edge function changes:**
- Remove the `await` on the VPS fetch call (or use a 5s timeout just to confirm acceptance)
- Pass `supabase_url`, `supabase_service_key`, and `run_id` in the VPS payload so the VPS can update the DB directly
- Remove the post-VPS `label_runs` update (VPS will do it)
- Return immediately with processing status

**VPS changes (user deploys manually):**
- After uploading PDFs, make a PATCH request to Supabase REST API to update `label_runs`
- Set status to `approved`, update `imposed_pdf_url`, `frames_count`, `meters_to_print`

**Frontend changes:**
- `useBatchImpose`: After calling impose, start polling `label_runs` for each run's status (e.g., every 3 seconds)
- Update progress based on DB status changes rather than synchronous responses
- Show "Generating..." state while waiting

This makes the entire flow asynchronous and removes both the file size and timeout bottlenecks.
