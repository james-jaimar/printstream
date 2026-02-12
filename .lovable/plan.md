
# Rework Label Artwork Workflow: Proof-First with Print Matching

## Current Problem

When proof artwork (24-page PDF) is uploaded, it splits into 24 child items. When the print-ready version of the same file is uploaded later, the split creates **another 24 child items** instead of updating the existing ones. This causes:
- 48 items displayed instead of 24
- Quantities doubled (52,000 instead of 26,000)
- No link between proof and print-ready versions of the same page

## Proposed Workflow

```text
Phase 1: Upload Proofs + Set Quantities
  Upload multi-page proof PDF --> splits into 24 items
  Admin enters quantity per item (e.g., 1000 each)
  Admin can toggle "Bypass Proof" for repeat orders

Phase 2: Upload Print-Ready Artwork  
  Upload multi-page print PDF --> splits into pages
  Pages are matched to existing items by source_page_number
  Matched items get print_pdf_url updated (no new rows created)
  Unmatched pages create new items (edge case)

Individual Page Replacement:
  Upload single-page PDF on Print-Ready tab
  Match by filename or manual selection
  Updates print_pdf_url on existing item
```

## Technical Changes

### 1. Edge Function: `supabase/functions/label-split-pdf/index.ts`

Add a `mode` parameter ("proof" or "print") to the request body. When `mode === "print"`:
- After splitting, look for existing child items with `parent_item_id` matching the order's proof parent and matching `source_page_number`
- Instead of inserting new rows, **update** existing items' `print_pdf_url` and `print_pdf_status`
- Only create new child items for pages that have no match
- Return which items were updated vs created

New request shape:
```
{
  item_id: string,      // The parent item being split
  pdf_url: string,
  order_id: string,
  mode: "proof" | "print"  // NEW
}
```

When `mode === "print"`, the function will:
1. Split the PDF into pages as before
2. Query existing child items: `SELECT * FROM label_items WHERE order_id = ? AND parent_item_id IS NOT NULL AND source_page_number IS NOT NULL`
3. For each split page, find a child item with matching `source_page_number`
4. If found: UPDATE that item's `print_pdf_url`, `print_pdf_status = 'ready'`
5. If not found: INSERT new child item (fallback)

### 2. Upload Handler: `src/components/labels/order/LabelOrderModal.tsx`

Update `handleDualFilesUploaded` to pass the `mode` based on `artworkTab`:
- When `artworkTab === 'proof'`: pass `mode: "proof"` to `splitPdf()`
- When `artworkTab === 'print'`: pass `mode: "print"` to `splitPdf()`

This ensures multi-page PDFs on the Print-Ready tab update existing items rather than creating duplicates.

### 3. VPS Service: `src/services/labels/vpsApiService.ts`

Update the `splitPdf()` function signature to accept and forward the `mode` parameter to the edge function.

### 4. Item Count Fix: `src/hooks/labels/useLabelItems.ts`

The `updateOrderTotalCount` function currently sums quantities from all non-parent items. Since proof and print items are now the **same rows**, this is already correct -- no double-counting will occur after the matching fix. However, add a safeguard: only count items where `print_pdf_url IS NOT NULL` OR items where `proof_pdf_url IS NOT NULL` (deduplicate by ensuring we don't count both proof-only and print-only versions of the same logical item).

### 5. Bypass Proof Toggle: `src/components/labels/order/LabelOrderModal.tsx`

Add a Switch component in the order header area:
- Label: "Bypass Proof Approval"
- When toggled ON: sets all items' `proofing_status` to `'approved'` and marks them ready for production
- Store this as a field on the order or simply batch-update items
- This is for repeat orders where admin trusts the artwork

### 6. Filtered Item Count (Already Fixed)

The count in the header already excludes split parents. After this fix, proof and print share the same items, so the count will correctly show 24.

## Summary of File Changes

| File | Change |
|------|--------|
| `supabase/functions/label-split-pdf/index.ts` | Add `mode` param; match existing items by `source_page_number` when mode is "print" |
| `src/services/labels/vpsApiService.ts` | Pass `mode` through to edge function |
| `src/components/labels/order/LabelOrderModal.tsx` | Pass `artworkTab` as mode to split; add Bypass Proof toggle |
| `src/hooks/labels/useLabelItems.ts` | Safeguard against double-counting (minor) |

## Expected Results

- Upload 24-page proof: 24 items created, each with `proof_pdf_url`
- Set quantities: e.g., 1000 each = 24,000 total
- Upload 24-page print-ready: existing 24 items updated with `print_pdf_url`, no new items
- Item count stays at 24, total stays at 24,000
- Bypass toggle allows skipping client approval for repeat orders
