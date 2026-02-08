
# Fix Plan: PDF Previews and Validation

## Problem Summary
Two main issues are preventing the PDF workflow from working:

1. **Missing Previews**: Thumbnails ARE being generated client-side but are NOT being saved to the database - the data flow is broken between upload and database insert
2. **Pending Analysis**: The VPS `/analyze-pdf` endpoint doesn't exist yet, so all items show "pending" status. We need client-side validation as the primary method.

---

## Root Cause Analysis

### Thumbnail Data Flow (Currently Broken)

```text
LabelItemsDropZone                    LabelOrderModal                   useLabelItems
      |                                     |                               |
  generates thumbnail ─→ passes to callback ─→ MISSING: doesn't pass    ─→ MISSING: doesn't
  uploads to storage      onFilesUploaded       thumbnailUrl to            include in insert
      |                                         createItem.mutateAsync()
  returns { url, name, thumbnailUrl }           
```

### Validation Flow (Broken)
- Edge function tries VPS API → 404 error → returns "pending" status
- No client-side fallback for dimension validation
- Items stuck at "pending" forever

---

## Fix 1: Complete the Thumbnail Data Flow

### Changes Required

**1. Update Type: `src/types/labels.ts`**
Add `artwork_thumbnail_url` to `CreateLabelItemInput`:
```typescript
export interface CreateLabelItemInput {
  order_id: string;
  name: string;
  quantity: number;
  artwork_pdf_url?: string;
  artwork_thumbnail_url?: string;  // ADD THIS
  width_mm?: number;
  height_mm?: number;
  notes?: string;
}
```

**2. Update Hook: `src/hooks/labels/useLabelItems.ts`**
Include `artwork_thumbnail_url` in the insert statement:
```typescript
const { data, error } = await supabase
  .from('label_items')
  .insert({
    ...
    artwork_thumbnail_url: input.artwork_thumbnail_url,  // ADD THIS
    ...
  })
```

**3. Update Modal: `src/components/labels/order/LabelOrderModal.tsx`**
Pass `thumbnailUrl` to the create mutation:
```typescript
const result = await createItem.mutateAsync({
  order_id: order.id,
  name: file.name.replace('.pdf', ''),
  quantity: 1,
  artwork_pdf_url: file.url,
  artwork_thumbnail_url: file.thumbnailUrl,  // ADD THIS
  width_mm: order.dieline?.label_width_mm,
  height_mm: order.dieline?.label_height_mm,
});
```

---

## Fix 2: Client-Side PDF Dimension Validation

Since the VPS API doesn't exist yet, implement primary validation client-side using pdf.js (already available via `getPdfDimensionsMm()`).

### Approach
Move validation to the upload phase in `LabelItemsDropZone`:
1. After generating thumbnail, read PDF dimensions using `getPdfDimensionsMm()`
2. Compare against dieline specs (trim + bleed)
3. Determine status: `passed`, `no_bleed`, `too_large`, `too_small`, `needs_crop`
4. Pass validation result to callback
5. Store in database (via `preflight_status` field or new field)

### New Utility Function: `validatePdfDimensions()`
Add to `src/utils/pdf/thumbnailUtils.ts`:
```typescript
export interface ValidationResult {
  status: 'passed' | 'no_bleed' | 'too_large' | 'too_small' | 'needs_crop';
  issues: string[];
  actual_width_mm: number;
  actual_height_mm: number;
  can_auto_crop: boolean;
}

export function validatePdfDimensions(
  actualWidth: number,
  actualHeight: number,
  expectedTrimWidth: number,
  expectedTrimHeight: number,
  bleedLeft: number,
  bleedRight: number,
  bleedTop: number,
  bleedBottom: number,
  toleranceMm: number = 1.0
): ValidationResult
```

### Update LabelItemsDropZone
1. After thumbnail generation, call `getPdfDimensionsMm(file)`
2. Run `validatePdfDimensions()` with dieline specs
3. Include validation result in callback data
4. Skip edge function call (or make it optional for VPS-side CMYK/preflight)

### Store Validation in Database
Two options:
- **Option A**: Use existing `preflight_status` field (map validation status to preflight status)
- **Option B**: Store validation in `preflight_report` JSON field

Recommend Option A for simplicity - map `passed` → `passed`, `no_bleed`/`needs_crop` → `warnings`, `too_large`/`too_small` → `failed`

---

## Fix 3: Display Thumbnails from Database

### Update LabelItemsGrid
The current code already looks for `item.artwork_thumbnail_url`:
```typescript
thumbnailUrl={analysis?.thumbnail_url || item.artwork_thumbnail_url || undefined}
```
This will work once thumbnails are saved to the database.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/labels.ts` | Add `artwork_thumbnail_url` to `CreateLabelItemInput` |
| `src/hooks/labels/useLabelItems.ts` | Include `artwork_thumbnail_url` in insert statement |
| `src/components/labels/order/LabelOrderModal.tsx` | Pass `thumbnailUrl` to createItem mutation |
| `src/utils/pdf/thumbnailUtils.ts` | Add `validatePdfDimensions()` function |
| `src/components/labels/items/LabelItemsDropZone.tsx` | Add client-side validation, pass preflight data |

---

## Implementation Sequence

1. **Quick win - Fix thumbnail saving** (3 files)
   - Update type, hook, and modal to pass thumbnail URL through

2. **Add client-side validation** (2 files)
   - Add validation function to thumbnailUtils
   - Integrate into LabelItemsDropZone

3. **Map validation to preflight status** 
   - Store status in database for persistence

---

## Expected Outcome

After these fixes:
- Thumbnails display immediately after upload
- Dimension validation runs client-side (no VPS dependency)
- Items show correct status badges (Passed, No Bleed, Too Large, etc.)
- VPS can still be called later for advanced preflight (CMYK, fonts, etc.)
