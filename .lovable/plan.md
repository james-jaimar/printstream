
# Plan: Add /page-boxes Endpoint to VPS

## Problem Diagnosis

The edge function `label-page-boxes` is calling `POST /page-boxes` on your VPS, but that endpoint doesn't exist yet (404). Your VPS currently has `/preflight/check` which DOES return page boxes, but it requires file upload (multipart/form-data) rather than accepting a URL.

## Solution: Add /page-boxes Endpoint to VPS

You need to add this endpoint to your Python FastAPI server at `pdf-api.jaimar.dev`:

---

### VPS Endpoint Specification

```text
POST /page-boxes
Content-Type: application/json
X-API-Key: <your-api-key>

Request Body:
{
  "pdf_url": "https://example.com/path/to/file.pdf"
}

Response (200 OK):
{
  "mediabox": { "x1": 0, "y1": 0, "x2": 349.61, "y2": 207.81, "width": 349.61, "height": 207.81 },
  "cropbox": { "x1": 0, "y1": 0, "x2": 349.61, "y2": 207.81, "width": 349.61, "height": 207.81 },
  "bleedbox": { "x1": 0, "y1": 0, "x2": 349.61, "y2": 207.81, "width": 349.61, "height": 207.81 },
  "trimbox": { "x1": 11.34, "y1": 11.34, "x2": 294.8, "y2": 153.07, "width": 283.46, "height": 141.73 },
  "artbox": null
}
```

All dimensions are in **PDF points** (1 point = 1/72 inch = 0.3528 mm).

---

### Python Implementation (FastAPI + pikepdf)

Add this to your FastAPI server:

```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
import pikepdf
import httpx
import tempfile
import os

class PageBoxesRequest(BaseModel):
    pdf_url: str

class BoxDimensions(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    width: float
    height: float

class PageBoxesResponse(BaseModel):
    mediabox: BoxDimensions | None
    cropbox: BoxDimensions | None
    bleedbox: BoxDimensions | None
    trimbox: BoxDimensions | None
    artbox: BoxDimensions | None


def box_to_dict(box) -> dict | None:
    """Convert pikepdf box array [x1, y1, x2, y2] to dict with dimensions."""
    if box is None:
        return None
    try:
        x1, y1, x2, y2 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "width": abs(x2 - x1),
            "height": abs(y2 - y1)
        }
    except (IndexError, TypeError, ValueError):
        return None


@app.post("/page-boxes", response_model=PageBoxesResponse, tags=["Page Boxes"])
async def get_page_boxes(request: PageBoxesRequest):
    """
    Extract PDF page boxes (MediaBox, CropBox, BleedBox, TrimBox, ArtBox).
    
    Downloads PDF from URL and extracts all page box definitions from the first page.
    Returns dimensions in PDF points (1 pt = 1/72 inch = 0.3528 mm).
    """
    # Download PDF from URL
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(request.pdf_url)
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=400, detail=f"Failed to download PDF: {str(e)}")
    
    # Save to temp file and extract boxes
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(response.content)
        tmp_path = tmp.name
    
    try:
        pdf = pikepdf.open(tmp_path)
        page = pdf.pages[0]
        
        # Extract all boxes (MediaBox is always present, others may be None)
        result = {
            "mediabox": box_to_dict(page.MediaBox),
            "cropbox": box_to_dict(getattr(page, 'CropBox', None) or page.get('/CropBox')),
            "bleedbox": box_to_dict(getattr(page, 'BleedBox', None) or page.get('/BleedBox')),
            "trimbox": box_to_dict(getattr(page, 'TrimBox', None) or page.get('/TrimBox')),
            "artbox": box_to_dict(getattr(page, 'ArtBox', None) or page.get('/ArtBox')),
        }
        
        pdf.close()
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract page boxes: {str(e)}")
    finally:
        os.unlink(tmp_path)
```

---

### Dependencies Required

Make sure your VPS has these packages:
```
pikepdf>=8.0.0
httpx>=0.25.0
```

---

### Expected Response for Your Test PDF

For a PDF with:
- MediaBox: 349.61 x 207.81 pt (123.28 x 73.28 mm - full page with bleed)
- TrimBox: 283.46 x 141.73 pt (100 x 50 mm - actual label size)

The endpoint should return:
```json
{
  "mediabox": { "x1": 0, "y1": 0, "x2": 349.61, "y2": 207.81, "width": 349.61, "height": 207.81 },
  "cropbox": null,
  "bleedbox": null,
  "trimbox": { "x1": 33.07, "y1": 33.04, "x2": 316.53, "y2": 174.77, "width": 283.46, "height": 141.73 },
  "artbox": null
}
```

---

### Testing the Endpoint

After adding the endpoint, you can test it with:

```bash
curl -X POST https://pdf-api.jaimar.dev/page-boxes \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"pdf_url": "https://kgizusgqexmlfcqfjopk.supabase.co/storage/v1/object/public/label-files/label-artwork/orders/b95f5c33-39f7-4811-acc4-7f21f509da82/1770554784133-Eazi_Tool_BROWN__3300__.pdf"}'
```

---

## No Lovable Code Changes Required

The edge function `label-page-boxes` is already correctly implemented and waiting for this VPS endpoint. Once you deploy the `/page-boxes` endpoint on your VPS:

1. The edge function will call it successfully
2. It will return TrimBox dimensions (100 x 50mm)
3. The UI will show "Passed" instead of "Too Large"

---

## Summary

| Component | Status | Action |
|-----------|--------|--------|
| Edge Function `label-page-boxes` | Ready | No changes needed |
| VPS `/page-boxes` endpoint | Missing (404) | Add the Python code above |
| Frontend validation | Ready | Will auto-use TrimBox when available |
| UI display | Ready | Shows TrimBox indicator when detected |

**Next Step**: Add the `/page-boxes` endpoint to your VPS and test it. Let me know when it's deployed and I can verify it works end-to-end.
