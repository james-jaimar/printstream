
# Auto-Crop PDF to BleedBox

## Problem
When a PDF contains crop marks, the MediaBox is much larger than the actual artwork. The BleedBox (e.g., 104x54mm) and TrimBox (e.g., 100x50mm) are embedded correctly in the PDF metadata, but the system has no way to automatically trim the oversized page down to the BleedBox dimensions. This is critical for imposition -- the VPS needs artwork at exactly the bleed size.

## Solution
Add a new `crop_to_bleed` action to the `label-prepare-artwork` edge function and wire it into the UI so it can be triggered automatically or manually.

## Changes

### 1. Edge Function: `label-prepare-artwork/index.ts`
Add a new `crop_to_bleed` action that:
- Fetches the item's PDF page boxes from VPS (`/page-boxes`)
- Reads the BleedBox dimensions (falls back to TrimBox if no BleedBox)
- If the MediaBox is larger than the BleedBox, calculates the crop offsets: `(MediaBox - BleedBox) / 2` on each side
- Calls VPS `/manipulate/crop` with those offsets
- Uploads the cropped PDF and updates `print_pdf_url` + `print_pdf_status = 'ready'`

### 2. Client Hook: `src/hooks/labels/usePrepareArtwork.ts`
Add `crop_to_bleed` to the `PrepareAction` type so the client can invoke this action.

### 3. Validation Logic: `src/utils/pdf/thumbnailUtils.ts`
Update `validatePdfDimensions` to detect the "has crop marks" scenario:
- When the TrimBox matches expected trim size AND the PDF has a BleedBox, but the MediaBox is significantly larger than the BleedBox, return a new status `needs_crop` with `can_auto_crop = true` and a message indicating crop marks need trimming.

### 4. Proof Item Card: `src/components/labels/items/LabelItemCard.tsx`
When validation status is `needs_crop` and bleed is confirmed, show a "Crop to Bleed" button that triggers the `crop_to_bleed` action.

### 5. Layout Optimizer: `src/components/labels/LayoutOptimizer.tsx`
Update the bulk "Prepare All" logic to use `crop_to_bleed` for items where the PDF is oversized (has crop marks) but bleed info is present.

### 6. Upload Analysis: `supabase/functions/label-pdf-analyze/index.ts`
Update the validation function to detect the crop-marks scenario: when `mediabox >> bleedbox`, flag as `needs_crop` with crop offsets calculated from the difference between MediaBox and BleedBox.

## Technical Details

**New action in `label-prepare-artwork`:**
```text
case "crop_to_bleed":
  1. Fetch PDF URL from item
  2. Call VPS /page-boxes to get MediaBox + BleedBox
  3. Calculate crop offsets = (MediaBox - BleedBox) / 2 per side
  4. Call VPS /manipulate/crop with those offsets
  5. Upload result, update item with print_pdf_url + status "ready"
```

**Crop offset calculation:**
```text
Given:
  MediaBox  = 130 x 80 mm  (includes crop marks)
  BleedBox  = 104 x 54 mm  (label + bleed)

Crop offsets:
  left   = (130 - 104) / 2 = 13mm
  right  = (130 - 104) / 2 = 13mm
  top    = (80 - 54) / 2   = 13mm
  bottom = (80 - 54) / 2   = 13mm
```

**Files to modify:**
- `supabase/functions/label-prepare-artwork/index.ts` -- add `crop_to_bleed` case
- `supabase/functions/label-pdf-analyze/index.ts` -- detect crop marks scenario
- `src/hooks/labels/usePrepareArtwork.ts` -- add type
- `src/components/labels/items/LabelItemCard.tsx` -- add crop button
- `src/components/labels/LayoutOptimizer.tsx` -- update bulk prepare logic
