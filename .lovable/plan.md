

# Fix: Print-Ready PDF Processing Issues

## What Happened

The print-ready PDF upload for LBL-2026-0028 **did actually process successfully** — the edge function split all 14 pages and updated children with `print_pdf_url`. The DB confirms all 14 children have print PDFs and `print_pdf_status: 'ready'`.

**Two problems:**

1. **Missing thumbnails** — `print_thumbnail_url` is NULL for all 14 children. The post-split thumbnail generation in `LabelOrderModal.tsx` (lines 218-238) ran but likely failed silently because the `print_pdf_url` returned by the edge function is a **signed URL** (with token and expiration), and the client-side thumbnail generator may have failed to fetch it due to CORS or expiration timing.

2. **UI shows "No print file" incorrectly** — In `PrintReadyItemCard.tsx` (line 82-88), when `print_pdf_url` exists but `print_thumbnail_url` is null, the card shows "No print file" instead of a fallback like a PDF icon with "Generating preview..." or generating the thumbnail on demand.

3. **Duplicate parent item created** — A second parent `310e376f` was created because filename matching failed ("V2 No Trace" vs "V2"). This is a minor issue but clutters the order.

## Fixes

### 1. `PrintReadyItemCard.tsx` — Show correct state when print PDF exists but thumbnail is missing

Currently line 82-88 shows "No print file" when there's no thumbnail. Change to:
- If `hasPrintFile` is true but no thumbnail: show a PDF icon with "Print file ready" text, and trigger on-demand thumbnail generation
- Only show "No print file" when `print_pdf_url` is actually null

### 2. `LabelOrderModal.tsx` — Fix post-split thumbnail generation

The thumbnail generation at lines 218-238 uses `child.print_pdf_url` which is a signed URL from the edge function. These can fail on client-side fetch. Fix:
- Use the storage path to generate a fresh signed URL for thumbnail generation
- Add error logging so failures aren't silent
- If thumbnail generation fails, still show the item as having a print file (not "No print file")

### 3. Add on-demand thumbnail generation in `PrintReadyItemCard`

When a print file exists but no thumbnail, generate one client-side:
- Call `generatePdfThumbnailFromUrl` with the `print_pdf_url`
- Upload the thumbnail and update the item
- Show a spinner while generating

### 4. Clean up duplicate parent item

The duplicate item `310e376f` ("...No Trace") should be deleted since the children already have their print PDFs. This is a one-time data fix — the name normalizer should also strip "No_Trace" and "Trace" to prevent this in future uploads.

### 5. `LabelOrderModal.tsx` — Improve name normalization

Add "trace", "no_trace", "notrace" to the list of stripped suffixes in `normalizeItemName` to handle this common filename pattern.

## Files to Change

- `src/components/labels/items/PrintReadyItemCard.tsx` — Fix the "no print file" display when PDF exists but thumbnail is missing; add on-demand thumbnail generation
- `src/components/labels/order/LabelOrderModal.tsx` — Improve name normalizer; fix post-split thumbnail generation resilience

