

# Orientation-Aware Validation, Rotation, and Multi-Page Support

## Summary
Now that the VPS endpoints are confirmed working (`/manipulate/rotate`, `/manipulate/split`, and `/page-boxes` with `page_count`), this plan implements all the Lovable-side changes: database columns, type updates, orientation-aware validation, rotation during imposition, and a new edge function for splitting multi-page PDFs.

---

## Step 1: Database Migration

Add four new columns to `label_items`:

- `needs_rotation` (boolean, default false) -- artwork needs 90-degree rotation to match dieline
- `page_count` (integer, default 1) -- number of pages in uploaded PDF
- `parent_item_id` (uuid, nullable, FK to label_items) -- links split pages back to original
- `source_page_number` (integer, nullable) -- which page this item was extracted from

---

## Step 2: Update TypeScript Types

**`src/types/labels.ts`**
- Add `needs_rotation`, `page_count`, `parent_item_id`, `source_page_number` to `LabelItem`
- Add `needs_rotation?: boolean` to `SlotAssignment`

---

## Step 3: Orientation-Aware Validation

**`src/utils/pdf/thumbnailUtils.ts`**
- Update `ValidationResult` to include `needs_rotation: boolean`
- In `validatePdfDimensions()`: if normal W x H fails but swapped H x W passes against the dieline, return `status: 'passed'` with `needs_rotation: true`
- Update `getPdfDimensionsMm()` to also return `page_count` from the PDF

---

## Step 4: Upload Zone Updates

**`src/components/labels/items/DualArtworkUploadZone.tsx`**
- Pass `needs_rotation` and `page_count` through to item creation
- Show info toast when rotation will be applied
- Detect multi-page PDFs and show notification

---

## Step 5: Edge Function Updates

**`supabase/functions/label-page-boxes/index.ts`**
- Add `page_count` to the `VpsPageBoxesResponse` interface
- Pass `page_count` through in the response

**`supabase/functions/label-pdf-analyze/index.ts`** (if it exists)
- Add orientation-aware check in server-side validation

**`supabase/functions/label-impose/index.ts`**
- Map `needs_rotation: true` to `rotation: 90` per slot when calling VPS imposition

---

## Step 6: New Edge Function -- `label-split-pdf`

**`supabase/functions/label-split-pdf/index.ts`**
- Accepts `{ item_id, pdf_url, order_id }`
- Calls VPS `/manipulate/split`
- Uploads each extracted page PDF to Supabase storage
- Creates child `label_items` records with `parent_item_id` and `source_page_number`
- Updates parent item's `page_count`

---

## Step 7: VPS API Service Updates

**`src/services/labels/vpsApiService.ts`**
- Add `rotatePdf()` client function
- Add `splitPdf()` client function
- Add `page_count` to `PageBoxesResponse`

---

## Technical Details

### Files to Create
- `supabase/functions/label-split-pdf/index.ts`

### Files to Modify
- `src/types/labels.ts`
- `src/utils/pdf/thumbnailUtils.ts`
- `src/components/labels/items/DualArtworkUploadZone.tsx`
- `src/services/labels/vpsApiService.ts`
- `supabase/functions/label-page-boxes/index.ts`
- `supabase/functions/label-impose/index.ts`
- `supabase/config.toml` (add `label-split-pdf` entry)

### Orientation Check Logic
```text
actualW x actualH vs expectedW x expectedH  -->  normal match?
actualH x actualW vs expectedW x expectedH  -->  rotated match?

If only rotated matches: status = "passed", needs_rotation = true
```

### Implementation Order
1. Database migration (new columns)
2. Types update
3. Validation logic (thumbnailUtils)
4. Upload zone UI updates
5. Edge function updates (page-boxes, impose)
6. New split-pdf edge function
7. VPS API service client functions

