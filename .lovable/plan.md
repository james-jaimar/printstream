

# Fix Plan: PDF Previews, Validation Status & VPS Preflight Integration

## Summary

Three issues are preventing the PDF workflow from functioning:

1. **PDF.js Worker Fails to Load** - The CDN URL is returning 404, blocking thumbnail generation
2. **Thumbnails Not Accessible** - Using public URLs but user needs signed URLs for private bucket
3. **VPS Preflight Not Running** - No integration triggers the VPS /preflight endpoint after item creation

---

## Issue 1: PDF.js Worker Loading Failure (404)

### Root Cause
The current worker configuration uses a dynamic CDN URL that constructs the path from `pdfjsLib.version`. The installed version is `4.0.379`, but CloudFlare CDN may not have this exact version available or the URL format has changed for v4.x.

Current problematic code:
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
```

### Solution
Use the local worker from `node_modules` bundled by Vite, or use a known working CDN path. The most reliable approach is to import the worker directly from the installed package.

### Changes
**File: `src/utils/pdf/thumbnailUtils.ts`**
- Replace CDN URL with local import from pdfjs-dist
- Add fallback error handling if worker fails
- Log worker initialization status for debugging

```typescript
// Use local worker bundled with the package
import * as pdfjsLib from 'pdfjs-dist';

// Import the worker entry from the package
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
```

---

## Issue 2: Thumbnails Not Accessible (Signed URLs)

### Root Cause  
The code uses `getPublicUrl()` which generates a public URL, but the `label-files` bucket may be private. User confirmed they want **signed URLs**.

### Solution
Replace `getPublicUrl()` with `createSignedUrl()` for thumbnail retrieval. Signed URLs provide temporary access tokens for private bucket content.

### Changes

**File: `src/components/labels/items/LabelItemsDropZone.tsx`**
- After uploading thumbnail, create a signed URL instead of public URL
- Store the signed URL or the file path (path preferred, generate signed URL on render)

**File: `src/components/labels/items/LabelItemCard.tsx`**  
- If thumbnailUrl is a storage path (not full URL), generate signed URL on render
- Add loading state while generating signed URL

**File: `src/hooks/labels/useLabelItems.ts`**
- Add helper to generate signed URLs for thumbnail paths
- Consider creating a dedicated hook `useThumbnailUrl(path)` that handles signed URL generation

**Alternative Approach (Recommended)**:
Store only the relative path in `artwork_thumbnail_url` and generate signed URLs at display time in the component. This keeps URLs fresh and avoids expiration issues.

---

## Issue 3: VPS Preflight Not Triggered After Creation

### Root Cause
No code calls the VPS `/preflight` endpoint after item creation. The `label-preflight` edge function exists and works, but nothing invokes it.

### Solution
After an item is created successfully, fire an async call to `runPreflight()` from `vpsApiService.ts`. Update the item record with the preflight results when complete.

### Changes

**File: `src/components/labels/order/LabelOrderModal.tsx`**
Add async preflight trigger after item creation:

```typescript
import { runPreflight } from '@/services/labels/vpsApiService';
import { useUpdateLabelItem } from '@/hooks/labels/useLabelItems';

// Inside handleFilesUploaded, after createItem succeeds:
if (result.artwork_pdf_url) {
  // Fire async - don't await
  runPreflight({ 
    pdf_url: result.artwork_pdf_url, 
    item_id: result.id 
  })
    .then(preflightResult => {
      updateItem.mutate({
        id: result.id,
        updates: {
          preflight_status: preflightResult.status,
          preflight_report: preflightResult.report,
          is_cmyk: preflightResult.report.has_cmyk,
          min_dpi: preflightResult.report.min_dpi,
          has_bleed: preflightResult.report.has_bleed,
        }
      });
    })
    .catch(err => {
      console.warn('VPS preflight failed, using client validation:', err);
      // Keep existing client-side validation status
    });
}
```

**File: `src/hooks/labels/useLabelItems.ts`**
- Ensure `useUpdateLabelItem` accepts all preflight fields
- Add is_cmyk, min_dpi, has_bleed to update mutation

---

## Issue 4: AI Layout Integer Fix Verification

### Current Status
The `useLabelRuns.ts` already rounds `frames_count` and `estimated_duration_minutes` to integers before database insertion. The `layoutOptimizer.ts` uses `Math.ceil()` for frame calculations.

### Action
Verify the fix is complete by checking all places where decimal values might be passed:
- `createGangedRun()` function
- `createSingleItemRun()` function  
- `createOptimizedRuns()` function

All should use `Math.ceil()` for frame counts to ensure integers.

---

## Implementation Files

| File | Changes |
|------|---------|
| `src/utils/pdf/thumbnailUtils.ts` | Fix PDF.js worker path to use local package |
| `src/components/labels/items/LabelItemsDropZone.tsx` | Generate signed URLs for thumbnails |
| `src/components/labels/order/LabelOrderModal.tsx` | Add async VPS preflight trigger after item creation |
| `src/hooks/labels/useLabelItems.ts` | Add signed URL helper, ensure all preflight fields in update |
| `src/components/labels/items/LabelItemCard.tsx` | Handle signed URL thumbnail display |
| `src/utils/labels/layoutOptimizer.ts` | Verify all frame calculations use Math.ceil |

---

## Implementation Sequence

1. **Fix PDF.js worker path** - Enables thumbnail generation
2. **Switch to signed URLs** - Makes thumbnails accessible
3. **Add VPS preflight trigger** - Runs full preflight analysis async
4. **Verify layout optimizer integers** - Ensures AI Layout works

---

## Expected Outcome

After these fixes:
- PDF thumbnails generate successfully (worker loads correctly)
- Thumbnails display in the UI (signed URLs work for private bucket)
- VPS preflight runs in background after upload
- Items update with full preflight report (fonts, DPI, CMYK, bleed)
- AI Layout "Apply" button creates runs without database errors
- Users see clear validation feedback instantly (client-side) with enhanced VPS results appearing after a few seconds

