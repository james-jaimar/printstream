
# Fix Plan: PDF Previews, Quantity Input & AI Layout Issues

## Summary of Issues

Based on the console logs and code review, there are three distinct problems:

1. **Missing PDF Previews**: The VPS API endpoint `/analyze-pdf` doesn't exist (404 "Not Found"), so no thumbnails are being generated or returned.

2. **Quantity Input fires on every keystroke**: The input triggers a database mutation on every change event instead of waiting for blur/enter.

3. **AI Layout failure**: Cascading 500 errors from the PDF analysis failures, plus a 400 error when applying layouts.

---

## Fix 1: PDF Preview Generation (Fallback to Client-Side)

### Problem
The edge function `label-pdf-analyze` calls the VPS at `/analyze-pdf`, but that endpoint doesn't exist on the VPS server. Without it, no thumbnail is generated.

### Solution
Generate PDF thumbnails client-side using pdf.js (already installed) before/after upload, eliminating the dependency on the VPS for previews.

### Technical Changes

**New File: `src/utils/pdf/thumbnailUtils.ts`**
Create a utility to generate thumbnails from PDFs using pdfjs-dist:
- Load the PDF from a blob or URL
- Render the first page to a canvas at a reasonable size (e.g., 300px wide)
- Convert canvas to data URL or upload to storage as a thumbnail
- Return the thumbnail URL

**Update: `src/components/labels/items/LabelItemsDropZone.tsx`**
- After uploading the PDF, generate a thumbnail client-side
- Upload the thumbnail to storage alongside the PDF
- Pass the thumbnail URL along with the file data

**Update: `src/hooks/labels/useLabelItems.ts`**
- Add `artwork_thumbnail_url` to the create mutation input

**Update: Edge Function (optional improvement)**
- Make the VPS analysis graceful - return success with just dimensions if thumbnail generation fails
- Or remove the VPS call entirely and do pure client-side validation using pdf.js to read page dimensions

---

## Fix 2: Quantity Input - Only Update on Blur/Enter

### Problem
The `LabelItemCard` component calls `onQuantityChange` on every keystroke via the `onChange` event, triggering a database update immediately.

### Solution
Use local state for the quantity input and only commit changes on blur or Enter key, matching the name field behavior.

### Technical Changes

**Update: `src/components/labels/items/LabelItemCard.tsx`**

```text
Current (problematic):
- Input value bound directly to item.quantity
- onChange calls onQuantityChange immediately

New (fixed):
- Add local state: const [localQuantity, setLocalQuantity] = useState(item.quantity)
- Sync local state when item.quantity changes externally (useEffect)
- Input onChange updates local state only
- onBlur and onKeyDown (Enter) trigger the actual save
```

Key changes:
1. Add `useState` for local quantity
2. Add `useEffect` to sync when `item.quantity` prop changes
3. Create `handleQuantitySave` function similar to `handleNameSave`
4. Update input's `onChange` to only set local state
5. Add `onBlur` and `onKeyDown` handlers to commit changes

---

## Fix 3: AI Layout - Graceful Handling & Edge Function Fix

### Problem A: VPS API Not Found
The `/analyze-pdf` endpoint doesn't exist on the VPS, causing 500 errors that cascade.

### Problem B: 400 Error on Run Creation
The console shows a 400 error from `bal_runs/select` which suggests a schema or data issue when creating runs.

### Solution

**Edge Function: Make analysis optional**
Update `label-pdf-analyze` to gracefully handle VPS failures:
- If VPS is unavailable, attempt basic PDF dimension reading client-side
- Return a "pending" validation status rather than failing entirely

**For now: Skip VPS call, do client-side validation**
Since the VPS endpoint doesn't exist yet, update the edge function to:
- Extract PDF dimensions using a simpler method (or skip entirely)
- Return validation based on expected vs provided specs
- Generate thumbnail via a different method or mark as pending

**DropZone: Handle failures gracefully**
The current code already catches analysis errors and continues. Ensure items display correctly even without analysis data.

**LabelItemsGrid: Show items regardless of analysis**
Items should display with "Pending" status badge when no analysis is available - this already works but ensure thumbnail fallback is functioning.

---

## Implementation Order

1. **Fix Quantity Input** (Quick win - single file change)
   - Update `LabelItemCard.tsx` with local state for quantity

2. **Add Client-Side Thumbnail Generation**
   - Create `src/utils/pdf/thumbnailUtils.ts`
   - Update `LabelItemsDropZone.tsx` to generate thumbnails before upload
   - Update mutation to save `artwork_thumbnail_url`

3. **Improve Edge Function Robustness**
   - Update `label-pdf-analyze` to handle VPS failures gracefully
   - Consider moving dimension reading to client-side using pdf.js

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/labels/items/LabelItemCard.tsx` | Add local state for quantity, save on blur/enter |
| `src/utils/pdf/thumbnailUtils.ts` | **NEW** - PDF thumbnail generation using pdfjs-dist |
| `src/components/labels/items/LabelItemsDropZone.tsx` | Generate thumbnails client-side, pass to callback |
| `src/hooks/labels/useLabelItems.ts` | Ensure `artwork_thumbnail_url` is included in create mutation |
| `supabase/functions/label-pdf-analyze/index.ts` | Handle VPS failures gracefully, return partial success |
