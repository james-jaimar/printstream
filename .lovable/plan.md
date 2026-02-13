

# Fix: Print-Ready Upload Flow and Item Filtering

## Problems Identified

1. **Print-ready uploads create new items instead of matching existing proof children**: When uploading a multi-page print-ready PDF, the name-matching logic fails because child items are named "Pizza Picasso Labels - Page 1" while the file is "Pizza Picasso Labels.pdf". So it falls through to creating brand new items.

2. **New print-ready items appear in proof view**: The upload handler sets `artwork_pdf_url` and `artwork_thumbnail_url` for ALL uploads (even print-ready), causing them to match the proof filter (`proof_pdf_url || artwork_pdf_url`).

3. **Split mode detection is wrong**: The split function call passes `artworkTab === 'print' ? 'print' : 'proof'` but by the time the async VPS callback fires, `artworkTab` may not reflect the original upload intent. The `isProof` flag from the file should be used instead.

4. **Print-ready view shows nothing for new uploads**: Items need `print_pdf_url` set to appear in the print view, but this only happens after a secondary update call.

## Solution

### 1. Fix `handleDualFilesUploaded` in `LabelOrderModal.tsx`

**For print-ready uploads (`!file.isProof`):**
- Before creating a new item, search for existing child items (from proof split) that match by normalized parent name
- If a multi-page print-ready PDF is uploaded and matching proof children exist, skip item creation entirely -- just store the PDF and trigger `label-split-pdf` in `print` mode to update the existing children's `print_pdf_url`
- For single-page print-ready files, try to match against existing proof items more broadly (fuzzy name match or by position/order)

**For all uploads:**
- Set `proof_pdf_url` (not `artwork_pdf_url`) when `isProof` is true
- Set `print_pdf_url` directly when `isProof` is false, and do NOT set `artwork_pdf_url`
- This ensures items appear in the correct filtered view immediately

### 2. Fix split mode in VPS callback

- Capture the `isProof` boolean from the file in the closure, and pass `isProof ? 'proof' : 'print'` to `splitPdf()` instead of reading `artworkTab` state

### 3. Update `filteredItems` logic

- Proof view: show items that have `proof_pdf_url` OR (`artwork_pdf_url` AND no `print_pdf_url`)
- Print-ready view: show ALL visible items (not just those with `print_pdf_url`), since the side-by-side card handles showing "no print file" state. This way admins can see which proofed items still need print-ready artwork.

### 4. Fix `CreateLabelItemInput` type

- Ensure `proof_pdf_url` and `print_pdf_url` are accepted fields in the create input type so we can set them directly on creation

## Files to Change

| File | Change |
|------|--------|
| `src/components/labels/order/LabelOrderModal.tsx` | Fix upload handler to properly route proof vs print-ready files; fix split mode; update filteredItems logic |
| `src/types/labels.ts` | Add `proof_pdf_url` and `print_pdf_url` to `CreateLabelItemInput` if missing |
| `src/hooks/labels/useLabelItems.ts` | Support `proof_pdf_url` / `print_pdf_url` in create mutation insert |

## Technical Detail: Print-Ready Multi-Page Upload Flow

```text
Upload print-ready multi-page PDF
  |
  v
Check: do proof children exist for this order with matching parent name?
  |
  +-- YES --> Store PDF, call splitPdf(parentId, url, orderId, 'print')
  |           --> Edge function matches pages to existing children by source_page_number
  |           --> Updates print_pdf_url on each child
  |
  +-- NO  --> Create new parent item with print_pdf_url set
              --> Split in 'print' mode creates children with print_pdf_url
```

