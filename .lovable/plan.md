

# Fix Plan: PDF Previews, Validation, and AI Layout Creation

## Summary

Three interconnected issues are preventing the workflow from functioning properly:

1. **PDF thumbnails not displaying** - Client-side generation works, but thumbnails aren't reaching the database
2. **PDF analysis stuck at "Pending"** - Client-side validation isn't being persisted, and VPS preflight needs integration
3. **AI Layout creation fails with 400 error** - Database type mismatch (integer column receiving decimal values)

---

## Issue 1: PDF Thumbnails Not Displaying

### Root Cause
The `LabelItemsDropZone` generates thumbnails and passes them to `onFilesUploaded`, but examining the database records shows `artwork_thumbnail_url: null`. The data flow is:

```text
LabelItemsDropZone                 LabelOrderModal                  Database
       |                                  |                             |
  generates thumbnail ------>  handleFilesUploaded --------> artwork_thumbnail_url: null
  uploads to storage             passes to createItem                    
  returns { thumbnailUrl }       includes thumbnailUrl        
```

The thumbnail upload to storage may be silently failing, or there's a storage permissions issue with the thumbnails subfolder.

### Fix Strategy
1. Add better error handling and logging for thumbnail upload failures
2. Ensure storage policy allows uploading to subdirectories
3. Fall back to data URL storage if thumbnail upload fails (store directly in the database as base64 for reliability)

---

## Issue 2: PDF Validation Not Persisting

### Current Behavior
- Client-side validation runs via `validatePdfDimensions()`
- Status is passed to `createItem` as `preflight_status`
- Database shows `preflight_status: 'pending'` for all items

### Root Cause
The validation runs, but examining the code flow:
- `LabelItemsDropZone` sets `preflightStatus` from validation result
- `LabelOrderModal` passes it to `createItem` correctly
- However, if thumbnail generation fails, the entire `try` block may be skipped

Also, we should integrate with the VPS `/preflight` endpoint after item creation for deeper analysis (fonts, color spaces, DPI checks).

### Fix Strategy
1. Ensure validation result is saved even if thumbnail generation fails
2. After item creation, trigger VPS preflight check asynchronously
3. Store validation details in `preflight_report` JSON field for the visual display

---

## Issue 3: AI Layout Creation - 400 Error

### Root Cause
The Postgres logs show:
```
invalid input syntax for type integer: "61.33333333333333"
```

The `label_runs.frames_count` column is defined as `integer` in the database, but the layout optimizer calculates:
```typescript
frames: calculateFramesNeeded(...) // Returns decimal like 61.33
```

### Database Schema
```sql
frames_count: integer  -- Cannot store decimals
estimated_duration_minutes: integer
```

The `calculateFramesNeeded` function returns decimal values that need to be rounded before insertion.

### Fix Strategy
Option A: Round values before database insertion (recommended - minimal change)
Option B: Change database column to numeric (requires migration)

Going with Option A - round the calculated values in the layout optimizer and run creation hook.

---

## Implementation Details

### File Changes

| File | Change |
|------|--------|
| `src/components/labels/items/LabelItemsDropZone.tsx` | Improve thumbnail upload error handling; save validation even on thumbnail failure |
| `src/components/labels/order/LabelOrderModal.tsx` | Add VPS preflight trigger after item creation |
| `src/hooks/labels/useLabelRuns.ts` | Round `frames_count` and `estimated_duration_minutes` to integers |
| `src/utils/labels/layoutOptimizer.ts` | Ensure `frames` values are always integers |
| `src/components/labels/items/LabelItemCard.tsx` | Show validation details from database `preflight_report` |
| `src/components/labels/items/LabelItemsGrid.tsx` | Map database validation data to card props |

### 1. Fix Decimal-to-Integer Issue (AI Layout)

In `src/utils/labels/layoutOptimizer.ts`, update `calculateFramesNeeded` and run creation:

```typescript
// Ensure frames is always an integer
const frames = Math.ceil(quantity / labelsPerFrame);
```

In `src/hooks/labels/useLabelRuns.ts`, sanitize values before insert:

```typescript
.insert({
  ...
  frames_count: input.frames_count ? Math.round(input.frames_count) : null,
  estimated_duration_minutes: input.estimated_duration_minutes 
    ? Math.round(input.estimated_duration_minutes) : null,
  ...
})
```

### 2. Improve Thumbnail Reliability

In `LabelItemsDropZone.tsx`:
- Add explicit error logging for storage upload failures
- If storage upload fails, store a data URL directly (fallback)
- Separate validation from thumbnail generation to ensure validation always saves

### 3. Persist Validation Results

Store the full validation result in `preflight_report`:

```typescript
await createItem.mutateAsync({
  ...
  preflight_status: validation?.preflightStatus || 'pending',
  preflight_report: validation ? {
    dimensions: {
      actual_width_mm: validation.actual_width_mm,
      actual_height_mm: validation.actual_height_mm,
      expected_width_mm: validation.expected_width_mm,
      expected_height_mm: validation.expected_height_mm,
    },
    status: validation.status,
    issues: validation.issues,
    can_auto_crop: validation.can_auto_crop,
  } : undefined,
});
```

### 4. Trigger VPS Preflight After Creation

Add async preflight check in `LabelOrderModal.tsx`:

```typescript
// After item creation succeeds
if (result.artwork_pdf_url) {
  runPreflight({ pdf_url: result.artwork_pdf_url, item_id: result.id })
    .then(preflightResult => {
      // Update item with full preflight report
      updateItem.mutate({
        id: result.id,
        updates: {
          preflight_status: preflightResult.status,
          preflight_report: preflightResult.report,
          is_cmyk: preflightResult.report.has_cmyk,
          min_dpi: preflightResult.report.min_dpi,
        }
      });
    })
    .catch(err => console.warn('Preflight check failed:', err));
}
```

### 5. Display Validation in Cards

Update `LabelItemsGrid.tsx` to read validation from the database item's `preflight_report`:

```typescript
const validationStatus = item.preflight_report?.status || 
  (item.preflight_status as ValidationStatus) || 
  'pending';

const validationIssues = item.preflight_report?.issues || [];
```

---

## Order of Implementation

1. Fix decimal-to-integer issue in layout optimizer and run creation (unblocks AI layout)
2. Improve thumbnail upload reliability with fallback
3. Persist validation results to database
4. Add VPS preflight trigger after item creation
5. Update UI to read validation from database

---

## Expected Outcome

After these fixes:
- PDF thumbnails display reliably after upload
- Dimension validation runs immediately and shows correct status badges
- VPS preflight runs in background for deeper analysis
- AI Layout "Apply" button works without 400 errors
- Users get clear feedback on artwork issues before production

