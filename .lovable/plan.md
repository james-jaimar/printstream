

# Fix Multi-Page PDF Processing

## Problem
The upload flow detects multi-page PDFs (shows a toast) but never actually triggers the split. Three gaps exist:

1. **`CreateLabelItemInput`** is missing `needs_rotation` and `page_count` fields, so these values can't be saved when creating items.
2. **`handleDualFilesUploaded` in `LabelOrderModal.tsx`** doesn't include `needs_rotation` or `page_count` in its type signature, doesn't pass them to `createItem`, and doesn't save them after VPS page-boxes returns.
3. **No code calls `splitPdf()`** -- the edge function exists and works, but nothing triggers it when a multi-page PDF is uploaded.

## Fix

### 1. Update `CreateLabelItemInput` type
**File**: `src/types/labels.ts` (line ~327)

Add optional fields:
- `needs_rotation?: boolean`
- `page_count?: number`

### 2. Update `useCreateLabelItem` hook
**File**: `src/hooks/labels/useLabelItems.ts`

Include `needs_rotation` and `page_count` in the insert data passed to Supabase.

### 3. Update `handleDualFilesUploaded` in `LabelOrderModal.tsx`

- Expand the callback type signature to include `needs_rotation` and `page_count`
- Pass `needs_rotation` and `page_count` to `createItem.mutateAsync()`
- After VPS page-boxes returns, also save `needs_rotation` and `page_count` to the item
- After item creation, if `page_count > 1`, call `splitPdf(itemId, pdfUrl, orderId)` to create child items

### 4. Implementation flow after fix

```text
Upload PDF
  --> getPdfDimensionsMm() returns page_count
  --> createItem with page_count + needs_rotation
  --> VPS page-boxes returns page_count + validation
  --> if page_count > 1: call splitPdf(item_id, pdf_url, order_id)
      --> Edge function splits PDF into pages
      --> Creates child label_items with parent_item_id
      --> Toast: "Split into N items"
```

### Files to modify
- `src/types/labels.ts` -- add fields to `CreateLabelItemInput`
- `src/hooks/labels/useLabelItems.ts` -- pass new fields in insert
- `src/components/labels/order/LabelOrderModal.tsx` -- wire up `needs_rotation`, `page_count`, and call `splitPdf()`

