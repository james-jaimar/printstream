

# Proof Viewer: Missing Data & PDF Visibility Fixes

## Root Cause Analysis

### Issue 1: Missing job info when pasting URL directly

The `production_jobs` table has **no public SELECT policy**. All its SELECT policies require `auth.uid() IS NOT NULL` (authenticated users only).

The `job_stage_instances` table DOES have a public policy: "Public can view stage via valid proof link". So when a non-authenticated visitor loads the proof page:
- `proof_links` query works (has public SELECT policy by token)
- `job_stage_instances` query works (has public policy via proof link)
- But the **nested join to `production_jobs`** returns `null` because `production_jobs` blocks anonymous access

When clicking from email in a browser where you're already logged in, `auth.uid()` is set, so the join succeeds. Pasting the URL in incognito or a different browser = no session = no job data.

**Fix**: Add a public SELECT policy on `production_jobs` scoped to jobs that have a valid (non-expired, non-used) proof link:

```sql
CREATE POLICY "Public can view job via valid proof link"
ON production_jobs
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM proof_links
    WHERE proof_links.job_id = production_jobs.id
    AND proof_links.expires_at > now()
    AND proof_links.is_used = false
  )
);
```

### Issue 2: Customers not seeing the PDF

The `PdfViewer` component loads PDFs via an external iframe: `mozilla.github.io/pdf.js/web/viewer.html?file=<signed_url>`. This external domain tries to fetch the PDF from Supabase storage, which will be blocked by **CORS** (Supabase storage doesn't whitelist `mozilla.github.io` as an allowed origin). Additionally, `getSignedUrl` uses `download: true`, setting `Content-Disposition: attachment` which prevents inline display.

**Fix**: Change the `PdfViewer` to use the signed URL directly in the iframe (browsers have native PDF rendering), or use `download: false` for the signed URL and embed directly. The simplest reliable approach:

1. In `src/utils/pdf/urlUtils.ts`: Remove `download: true` from the `createSignedUrl` call (or add a parameter to control it)
2. In `src/components/pdf/PdfViewer.tsx`: Use the signed URL directly in an `<iframe src={signedUrl}>` instead of going through the external `mozilla.github.io` viewer

## Files to Change

| File | Change |
|------|--------|
| Database migration | Add public SELECT policy on `production_jobs` for proof link access |
| `src/utils/pdf/urlUtils.ts` | Add option to generate non-download signed URLs |
| `src/components/pdf/PdfViewer.tsx` | Use direct iframe with signed URL instead of external PDF.js viewer |

