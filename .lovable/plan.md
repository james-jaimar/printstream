

# Plan: Extract PDF Page Boxes (TrimBox, BleedBox, ArtBox)

## Summary

The current system only reads the **MediaBox** from uploaded PDFs (showing 123.28 × 73.28mm), but does not extract the **TrimBox** (100 × 50mm) or **BleedBox** which are essential for accurate dimension validation. This is causing PDFs to be flagged as "Too Large" when they are actually correctly formatted with proper trim and bleed areas.

---

## Current Problem

Looking at the uploaded screenshot:
- **MediaBox (what we read)**: 123.28 × 73.28mm (full page including bleed margins)
- **TrimBox (what we need)**: 100 × 50mm (actual label size)
- **Bleed margins**: ~11.6mm on each side

The PDF.js library's `getViewport()` method only returns the MediaBox dimensions. The TrimBox and BleedBox are stored in the PDF's page dictionary but are not exposed through PDF.js's public API.

---

## Technical Analysis

### Why PDF.js Can't Read TrimBox

PDF.js is designed for rendering PDFs in browsers, not for prepress analysis. While the internal worker has access to page boxes via `this.pageDict.map.TrimBox`, this is:
- Not exposed in the public API
- Would require modifying the pdf.worker.js file
- Not a recommended approach for production

### The VPS Preflight Returns 404

The edge function `label-preflight` calls `https://pdf-api.jaimar.dev/preflight`, but the VPS returns 404, meaning this endpoint doesn't exist on the Python FastAPI server yet.

---

## Proposed Solution

### 1. VPS API Enhancement (Backend - Your Python Server)

Add a `/page-boxes` or update `/preflight` endpoint on the VPS that extracts all PDF page boxes:

```text
POST /page-boxes
Request: { "pdf_url": "..." }
Response: {
  "mediabox": { "width": 349.61, "height": 207.81 },  // in points
  "cropbox": { "width": 349.61, "height": 207.81 },
  "bleedbox": { "width": 349.61, "height": 207.81 },
  "trimbox": { "width": 283.46, "height": 141.73 },   // 100 x 50mm
  "artbox": null
}
```

Using `pikepdf` or `pypdf` on your VPS (both can read these boxes):

```text
# Example with pikepdf
import pikepdf

pdf = pikepdf.open(file_path)
page = pdf.pages[0]

mediabox = page.MediaBox  # Always present
trimbox = page.TrimBox    # May be None
bleedbox = page.BleedBox  # May be None
artbox = page.ArtBox      # May be None
```

### 2. Edge Function Update

Modify `label-preflight` or create a new `label-page-boxes` edge function to call the VPS and return structured box data.

### 3. Client Integration

Update the upload flow to:
1. Upload PDF to storage
2. Call edge function to get page boxes from VPS
3. Use TrimBox (or fallback to MediaBox) for validation
4. Display accurate dimensions with box type indicator

---

## Implementation Steps

### Step 1: VPS API Update (On Your Python Server)

Add endpoint to extract PDF page boxes using `pikepdf`:

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/page-boxes` | POST | `{ pdf_url: string }` | All box dimensions in points |

### Step 2: Create/Update Edge Function

Create `label-page-boxes` edge function that:
- Receives PDF URL
- Calls VPS `/page-boxes` endpoint
- Converts points to mm (1 pt = 0.3528 mm)
- Returns structured box data

### Step 3: Update Client Validation

Modify `LabelItemsDropZone.tsx` and validation logic to:
- Call edge function after upload
- Use TrimBox for validation (if available), otherwise fall back to MediaBox
- Store box data in the database `preflight_report`

### Step 4: Update UI Display

Modify `LabelItemCard.tsx` to show:
- Which box type was used for validation
- All detected boxes with their dimensions
- Clear status based on TrimBox vs expected dieline

---

## Edge Function Code (New or Updated)

```text
File: supabase/functions/label-page-boxes/index.ts

Endpoint: POST
Input: { pdf_url: string }

Flow:
1. Call VPS /page-boxes with pdf_url
2. Convert all box dimensions from points to mm
3. Return structured response with all boxes

Response Format:
{
  success: true,
  boxes: {
    mediabox: { width_mm: 123.28, height_mm: 73.28 },
    trimbox: { width_mm: 100.0, height_mm: 50.0 },
    bleedbox: { width_mm: 123.28, height_mm: 73.28 },
    artbox: null
  },
  primary_box: "trimbox",  // The box used for validation
  dimensions_mm: { width: 100.0, height: 50.0 }  // From primary box
}
```

---

## Client-Side Changes

### LabelItemsDropZone.tsx

After PDF upload:
1. Call `label-page-boxes` edge function
2. Store box data in `preflight_report`
3. Use trimbox dimensions (if present) for validation

### thumbnailUtils.ts

Update `validatePdfDimensions` to accept a `boxes` object and use the appropriate box for validation:
- If TrimBox exists: validate against trim dimensions directly
- If only MediaBox: calculate expected size with bleed

### LabelItemCard.tsx

Display box information clearly:
- "TrimBox: 100 × 50mm ✓"
- "BleedBox: 123.28 × 73.28mm"
- Validation status based on correct box

---

## Database Changes

No schema changes required. The existing `preflight_report` JSON field can store:

```text
{
  boxes: {
    mediabox: { width_mm, height_mm },
    trimbox: { width_mm, height_mm },
    bleedbox: { width_mm, height_mm }
  },
  primary_box: "trimbox",
  validation_status: "passed",
  issues: []
}
```

---

## Required VPS Work

Before the client-side changes can be implemented, your VPS at `pdf-api.jaimar.dev` needs a new endpoint. Using `pikepdf`:

```text
from fastapi import FastAPI
import pikepdf
import requests
import tempfile

@app.post("/page-boxes")
async def get_page_boxes(pdf_url: str):
    # Download PDF
    response = requests.get(pdf_url)
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(response.content)
        tmp.flush()
        
        pdf = pikepdf.open(tmp.name)
        page = pdf.pages[0]
        
        def box_to_dict(box):
            if box is None:
                return None
            return {
                "x1": float(box[0]),
                "y1": float(box[1]),
                "x2": float(box[2]),
                "y2": float(box[3]),
                "width": float(box[2]) - float(box[0]),
                "height": float(box[3]) - float(box[1])
            }
        
        return {
            "mediabox": box_to_dict(page.MediaBox),
            "cropbox": box_to_dict(getattr(page, 'CropBox', None)),
            "bleedbox": box_to_dict(getattr(page, 'BleedBox', None)),
            "trimbox": box_to_dict(getattr(page, 'TrimBox', None)),
            "artbox": box_to_dict(getattr(page, 'ArtBox', None))
        }
```

---

## Summary of Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| VPS: `/page-boxes` endpoint | Create | Extract all PDF boxes using pikepdf |
| `supabase/functions/label-page-boxes/index.ts` | Create | Edge function to call VPS and return box data |
| `src/utils/pdf/thumbnailUtils.ts` | Modify | Update validation to use TrimBox when available |
| `src/components/labels/items/LabelItemsDropZone.tsx` | Modify | Call page-boxes endpoint after upload |
| `src/components/labels/items/LabelItemCard.tsx` | Modify | Display box information in UI |
| `src/types/labels.ts` | Modify | Add box types to PreflightReport interface |

---

## Next Step Required

Before I can implement the client-side changes, the VPS endpoint needs to be created. Please confirm:

1. Can you add the `/page-boxes` endpoint to your Python FastAPI server?
2. Or would you like me to update the existing `/preflight` endpoint specification?

Once the VPS endpoint is available, I'll implement all the edge function and client-side changes.

