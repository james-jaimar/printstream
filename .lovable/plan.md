

# Fix: Generate Print-Ready Thumbnails After Matched Split

## Root Cause

When a print-ready multi-page PDF is uploaded and matched to existing proof children (line 136-163 in `LabelOrderModal.tsx`), the edge function correctly splits the PDF and updates each child's `print_pdf_url`. However, **no thumbnails are generated** for these print-ready pages. Since `print_thumbnail_url` remains empty on all child items, the `PrintReadyItemCard` falls back to `proof_thumbnail_url` / `artwork_thumbnail_url` -- which contains the proof artwork with dieline overlays.

The thumbnail generation logic that handles this correctly already exists in the "new item" code path (lines 272-296), but it is never called from the "matched children" path.

## Fix

After the print-ready split completes and `refetch()` returns updated data, iterate over the matched children and generate a print-ready thumbnail for each one that has a `print_pdf_url` but no `print_thumbnail_url`.

## Technical Details

### File: `src/components/labels/order/LabelOrderModal.tsx`

**Lines ~153-158** -- After `splitPdf` resolves and `refetch()` completes, add thumbnail generation:

```text
splitPdf(existingParentId, pdfUrl, order.id, 'print')
  .then(splitResult => {
    toast.success(`Matched ${splitResult.page_count} print-ready pages`);
    refetch().then(async ({ data: refetchedOrder }) => {
      if (!refetchedOrder?.items) return;
      // Find children that now have print_pdf_url but no print_thumbnail_url
      const childrenNeedingThumbs = refetchedOrder.items.filter(
        i => i.parent_item_id === existingParentId
          && i.print_pdf_url
          && !i.print_thumbnail_url
      );
      for (const child of childrenNeedingThumbs) {
        try {
          // Generate thumbnail from the print-ready PDF (not the proof)
          const { generatePdfThumbnailFromUrl, dataUrlToBlob } = await import(...);
          const dataUrl = await generatePdfThumbnailFromUrl(child.print_pdf_url, 300);
          const blob = dataUrlToBlob(dataUrl);
          const thumbPath = `label-artwork/orders/${order.id}/thumbnails/${child.id}-print.png`;
          const { error } = await supabase.storage
            .from('label-files')
            .upload(thumbPath, blob, { contentType: 'image/png', upsert: true });
          if (!error) {
            updateItem.mutate({
              id: child.id,
              updates: { print_thumbnail_url: thumbPath }
            });
          }
        } catch (err) {
          console.warn('Print thumbnail gen failed for child:', child.id, err);
        }
      }
    });
  })
```

This reuses the exact same thumbnail generation pattern already used in the new-item split path (lines 278-296), but targets `print_pdf_url` as the source and writes to `print_thumbnail_url`.

### No other files need changes

The `PrintReadyItemCard` already correctly prioritizes `print_thumbnail_url` over proof fallbacks (line 33-34). Once the thumbnails are actually generated and stored, the cards will display the correct clean print-ready artwork.

