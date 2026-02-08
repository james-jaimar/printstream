
# Enhanced Label Order Workflow Plan

## Summary
This plan transforms the label order creation and management experience into a streamlined, PDF-aware workflow with:
1. Large modal-based UX (90% viewport) for both order creation and order management
2. Intelligent PDF dimension validation against dieline specifications (including bleed requirements)
3. Drag-and-drop multi-file upload for label items with automatic preflight analysis
4. Visual preview grid with inline quantity editing

---

## 1. Modal Size Enhancement

### Current State
- `NewLabelOrderDialog` uses `max-w-2xl` (672px max width)
- Order detail is a full page route (`/labels/orders/:orderId`)

### Changes Required
**NewLabelOrderDialog.tsx**
- Change `DialogContent` className to use 90vh/90vw sizing:
  ```
  className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto"
  ```

**Order Detail as Modal**
- Create new `LabelOrderModal.tsx` component that wraps the order detail content
- The modal opens from the orders list or after creating a new order
- Uses same 90% viewport sizing
- Retains all current functionality (items table, AI layout, runs, etc.)

---

## 2. Dieline Bleed Specification

### Database Changes
Add bleed fields to `label_dielines` table:
- `bleed_left_mm` (numeric, default 1.5)
- `bleed_right_mm` (numeric, default 1.5)
- `bleed_top_mm` (numeric, default 1.5)
- `bleed_bottom_mm` (numeric, default 1.5)

This allows asymmetric bleed (e.g., 1.5mm on left, 2.5mm on right as mentioned).

### Expected PDF Size Calculation
When a dieline is selected for an order, the system calculates:
- **Trim Size**: `label_width_mm` x `label_height_mm` (e.g., 100x50mm)
- **Bleed Size**: Trim + bleeds (e.g., 103mm x 52.5mm with 1.5mm left + 2.5mm right, 1.5mm top/bottom)

### Types Update
Update `LabelDieline` interface to include:
```typescript
bleed_left_mm: number;
bleed_right_mm: number;
bleed_top_mm: number;
bleed_bottom_mm: number;
```

---

## 3. PDF Dimension Validation System

### New Edge Function: `label-pdf-analyze`
Creates a new edge function to analyze uploaded PDFs before full preflight:

**Endpoint**: POST `/functions/v1/label-pdf-analyze`

**Request**:
```json
{
  "pdf_url": "https://...",
  "expected_trim_width_mm": 100,
  "expected_trim_height_mm": 50,
  "expected_bleed_left_mm": 1.5,
  "expected_bleed_right_mm": 2.5,
  "expected_bleed_top_mm": 1.5,
  "expected_bleed_bottom_mm": 1.5,
  "tolerance_mm": 1.0
}
```

**Response**:
```json
{
  "success": true,
  "dimensions": {
    "mediabox_width_mm": 103,
    "mediabox_height_mm": 52.5,
    "trimbox_width_mm": 100,
    "trimbox_height_mm": 50,
    "bleedbox_width_mm": 103,
    "bleedbox_height_mm": 52.5
  },
  "validation": {
    "status": "passed" | "no_bleed" | "too_large" | "too_small" | "needs_crop",
    "issues": ["No bleed detected - PDF matches trim size exactly"],
    "can_auto_crop": true,
    "crop_amount_mm": { "left": 1.5, "right": 1.5, "top": 0.5, "bottom": 0.5 }
  }
}
```

### Validation Logic
- **Exactly trim size** (100x50mm): Flag "No bleed" - warning status
- **Within tolerance** (up to ~1mm larger than needed): Flag "needs_crop", auto-crop on VPS
- **Too large** (more than tolerance): Flag "too_large" - error, reject
- **Has correct bleed** (103x52.5mm): "passed" - proceed normally

---

## 4. Drag-and-Drop Label Items Upload

### New Component: `LabelItemsDropZone.tsx`
A comprehensive drag-and-drop zone for the Label Items section:

**Features**:
- Accept multiple PDF files (drag multiple or select multiple)
- Visual drop zone with clear instructions
- Processing indicator for each file
- Grid layout for item cards

**Flow**:
1. User drops 3 PDFs onto the zone
2. Each PDF is uploaded to `label-files` bucket (`label-artwork/orders/{order_id}/{filename}`)
3. Edge function `label-pdf-analyze` is called for each with dieline specs
4. Results displayed in a grid of preview cards

### Item Preview Card Component: `LabelItemCard.tsx`
Each uploaded PDF becomes a visual card showing:
- **Thumbnail**: First page preview (generated via VPS API or pdf.js)
- **File name**: Editable label
- **Status badge**: Passed / No Bleed / Too Large / Processing
- **Validation details**: Expandable to show dimension info
- **Quantity input**: Number field below the preview
- **Actions**: Delete, View full size

**Card Layout** (for 24+ items):
- Grid layout: 4-6 columns on desktop, 2-3 on tablet
- Compact cards: ~150-200px wide
- Thumbnail: ~120px height
- Quantity input prominent below

---

## 5. Storage Bucket

### Create `label-files` Bucket
The edge functions reference this bucket but it doesn't exist. Migration required:
```sql
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('label-files', 'label-files', true, ARRAY['application/pdf']);
```

With RLS policies for authenticated upload access.

---

## Technical Implementation Details

### File Structure Changes

**New Files**:
- `src/components/labels/order/LabelOrderModal.tsx` - 90% viewport modal wrapper for order detail
- `src/components/labels/items/LabelItemsDropZone.tsx` - Drag-and-drop upload component
- `src/components/labels/items/LabelItemCard.tsx` - Individual item preview card
- `src/components/labels/items/LabelItemsGrid.tsx` - Grid container for item cards
- `src/hooks/labels/usePdfAnalysis.ts` - Hook for PDF dimension analysis
- `src/services/labels/pdfAnalysisService.ts` - Client-side service for PDF analysis API
- `supabase/functions/label-pdf-analyze/index.ts` - New edge function for PDF dimension analysis

**Modified Files**:
- `src/components/labels/NewLabelOrderDialog.tsx` - Update modal sizing
- `src/pages/labels/LabelsOrderDetail.tsx` - Refactor content into reusable component
- `src/pages/labels/LabelsOrders.tsx` - Launch order modal instead of navigate
- `src/types/labels.ts` - Add bleed fields to dieline interface
- `src/hooks/labels/useLabelItems.ts` - Add batch create mutation

### Dieline Form Updates
- Add bleed input fields (left, right, top, bottom) to dieline creation/edit forms
- Show calculated "Artwork size with bleed" preview

### Upload Flow Sequence
```
User drops PDFs
       |
       v
Upload to Supabase Storage
       |
       v
Call label-pdf-analyze for each
       |
       v
Show validation status on cards
       |
       v
User enters quantities
       |
       v
Create label_items records (batch)
       |
       v
Optionally run full preflight
```

---

## Migration Summary

1. **Database**: Add bleed columns to `label_dielines`
2. **Storage**: Create `label-files` bucket with policies
3. **Edge Function**: Create `label-pdf-analyze` function
4. **UI**: New modal-based workflow with drag-and-drop

---

## Order of Implementation

1. Database migration for bleed fields and storage bucket
2. Create `label-pdf-analyze` edge function
3. Build `LabelItemsDropZone` with drag-and-drop
4. Build `LabelItemCard` with previews and validation display
5. Update `NewLabelOrderDialog` sizing
6. Create `LabelOrderModal` for order detail view
7. Wire up the complete flow and test
