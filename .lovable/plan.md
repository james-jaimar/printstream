

# Fix Multi-Page PDF: Thumbnails, Duplicates, and Ordering

## Issues Found

### Issue 1: No thumbnails for split pages
The `label-split-pdf` edge function creates child items with `artwork_pdf_url` but never generates or stores `artwork_thumbnail_url`. The card component tries to display a thumbnail but finds none, so it shows a generic file icon.

### Issue 2: Original parent item still shows alongside child pages
The `filteredItems` in `LabelOrderModal.tsx` (line 69-83) shows all items that have `artwork_pdf_url` or `proof_pdf_url`. After splitting, both the parent item (page 1's original upload) AND all 12 child items appear. The parent should be hidden once it has been split into children.

### Issue 3: Random ordering
Items are ordered by `item_number` (line 19 in `useLabelItems.ts`). Child items get sequential `item_number` values starting after the max, but these are assigned in a loop using `Date.now()` in the storage path, meaning the async upload order might vary. The real fix is to sort child items by `source_page_number` in the UI, and ensure `item_number` is assigned sequentially.

---

## Fix 1: Generate thumbnails in `label-split-pdf` edge function

**File**: `supabase/functions/label-split-pdf/index.ts`

For each split page, after uploading the page PDF, also render a thumbnail image from the first (only) page of that single-page PDF. Since we're server-side (Deno), we can't use canvas rendering. Instead, we'll store the PDF URL as the artwork URL and generate a client-side thumbnail after the split completes, OR we generate a simple PNG thumbnail using the VPS.

**Chosen approach**: After uploading each page PDF, create a signed URL and store it as `artwork_pdf_url`. Then have the frontend generate thumbnails client-side after refetch (same pattern as the initial upload). This requires no VPS changes.

**Alternative (simpler)**: Copy the parent's thumbnail approach -- the frontend already generates thumbnails from PDF URLs via `useThumbnailUrl` hook, which signs URLs from storage paths. The child items already have `artwork_pdf_url` set. The issue is that `artwork_thumbnail_url` is null.

Looking at `LabelItemCard`, it uses `thumbnailPath` which comes from `LabelItemsGrid` line 113-115:
```
const thumbnailUrl = viewMode === 'print'
  ? analysis?.thumbnail_url || item.artwork_thumbnail_url || undefined
  : analysis?.thumbnail_url || item.proof_thumbnail_url || item.artwork_thumbnail_url || undefined;
```

So it falls back to `artwork_thumbnail_url`. The split function doesn't set this. We need to either:
- Generate thumbnails server-side (complex)
- Set `artwork_thumbnail_url` to the PDF storage path and let `useThumbnailUrl` handle signing (it already handles PDF-to-image conversion if it's a data URL or path)

Actually, looking at `useThumbnailUrl` -- it just signs storage paths. It doesn't render PDFs to images. The thumbnails are generated during upload in `DualArtworkUploadZone` using `generatePdfThumbnail()` and uploaded to storage.

**Best fix**: In the `label-split-pdf` edge function, after creating each child item, call back to a thumbnail generation step. But since we can't render PDFs in Deno, the simplest approach is to **trigger thumbnail generation on the frontend after the split completes**. We'll add a post-split step in `LabelOrderModal.tsx` that generates thumbnails for each child item from their PDF URLs.

## Fix 2: Hide parent items that have been split

**File**: `src/components/labels/order/LabelOrderModal.tsx`

In `filteredItems`, exclude items where `page_count > 1` (parent items that have child pages). Child items have `parent_item_id` set and `page_count === 1`.

```
// Filter out parent items that have been split into children
const visibleItems = items.filter(item => 
  !(item.page_count > 1 && !item.parent_item_id)
);
```

## Fix 3: Sort by source_page_number for child items

**File**: `src/components/labels/items/LabelItemsGrid.tsx`

Sort items so that child items (those with `parent_item_id`) are ordered by `source_page_number`. Non-child items keep their `item_number` ordering.

---

## Implementation Details

### Files to modify

1. **`src/components/labels/order/LabelOrderModal.tsx`**
   - In `filteredItems`, add filter to exclude parent items with `page_count > 1`
   - After `splitPdf()` completes and `refetch()` returns, generate thumbnails for new child items using `generatePdfThumbnailFromUrl()` and upload them to storage, then update each child item's `artwork_thumbnail_url`

2. **`src/components/labels/items/LabelItemsGrid.tsx`**
   - Sort items: group by parent, then sort children by `source_page_number`

3. **`supabase/functions/label-split-pdf/index.ts`**
   - Assign `item_number` values sequentially (already done, but ensure ordering is deterministic by processing pages in order)

### Thumbnail generation flow after split
```text
splitPdf() completes
  --> refetch() gets new child items
  --> for each child item without artwork_thumbnail_url:
      --> fetch PDF from artwork_pdf_url
      --> generatePdfThumbnail(file) client-side
      --> upload thumbnail to storage
      --> update item.artwork_thumbnail_url
```

This reuses the existing thumbnail generation pattern from the upload flow.
