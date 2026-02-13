

# Fix Print-Ready Artwork Display and Add CRUD Controls

## Problems

1. **Print-ready thumbnails show proof artwork instead of actual print-ready artwork**: The system stores all thumbnails in a single `artwork_thumbnail_url` field. When proof artwork is uploaded first, this field gets the proof thumbnail. When print-ready artwork is later matched to the same item, no separate print thumbnail is generated or stored -- so the card keeps showing the old proof image.

2. **No edit/delete actions on print-ready cards**: The Print-Ready view cards are completely read-only. Admins cannot delete a print-ready file or replace it with a corrected version.

## Solution

### 1. Add `print_thumbnail_url` column to the database

A new column on `label_items` to store print-ready artwork thumbnails separately from proof thumbnails.

### 2. Update type definitions

Add `print_thumbnail_url` to the `LabelItem` interface and `CreateLabelItemInput` in `src/types/labels.ts`.

### 3. Fix thumbnail generation for print-ready uploads

In `LabelOrderModal.tsx`, when generating thumbnails for print-ready child items after a split:
- Store the thumbnail in `print_thumbnail_url` (not `artwork_thumbnail_url`)
- For single-page print-ready matches, generate and store a print thumbnail too

### 4. Fix PrintReadyItemCard thumbnail resolution

In `PrintReadyItemCard.tsx`, change the print thumbnail path to use a dedicated `print_thumbnail_url` field first, falling back to proof thumbnail only if no print thumbnail exists.

### 5. Add CRUD controls to PrintReadyItemCard

Add the following interactive controls to the print-ready side of the card:
- **Delete** button (trash icon) to remove the print-ready file (clears `print_pdf_url` and `print_thumbnail_url`, resets `print_pdf_status` to `pending`)
- **Replace** button (upload icon) to upload a replacement print-ready PDF

This requires passing `onDeletePrintFile` and `onReplacePrintFile` callbacks from `LabelItemsGrid` into `PrintReadyItemCard`.

## Files to Change

| File | Change |
|------|--------|
| Database migration | Add `print_thumbnail_url TEXT` column to `label_items` |
| `src/types/labels.ts` | Add `print_thumbnail_url` to `LabelItem` and `CreateLabelItemInput` |
| `src/hooks/labels/useLabelItems.ts` | Include `print_thumbnail_url` in create mutation |
| `src/components/labels/items/PrintReadyItemCard.tsx` | Use `print_thumbnail_url` for the print side; add delete and replace buttons |
| `src/components/labels/items/LabelItemsGrid.tsx` | Wire up delete/replace handlers and pass them to `PrintReadyItemCard` |
| `src/components/labels/order/LabelOrderModal.tsx` | Store print thumbnails in `print_thumbnail_url`; generate thumbnails for print-ready splits into the correct field |

