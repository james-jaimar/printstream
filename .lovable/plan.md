

# Fix: RunLayoutDiagram Not Showing + VPS Preflight 404 Errors

## Issues Identified

### Issue 1: RunLayoutDiagram Not Rendered in LayoutOptimizer
The `RunLayoutDiagram` component is imported in `LayoutOptimizer.tsx` but never actually used. The component displays layout options as cards but doesn't show the visual diagram when an option is selected.

**Current state:** User clicks "Generate Layout Options" > sees option cards > but no visual preview of the actual roll layout.

### Issue 2: VPS `/preflight` Endpoint Returns 404
The edge function logs show:
```
VPS API error: 404 - {"detail":"Not Found"}
```
The VPS at `pdf-api.jaimar.dev` doesn't have a `/preflight` endpoint. It needs to be added to your VPS codebase (similar to how we added `/page-boxes`).

---

## Fix 1: Add RunLayoutDiagram to LayoutOptimizer

**File:** `src/components/labels/LayoutOptimizer.tsx`

Add a preview section after the options list that shows the visual diagram when an option is selected:

```text
After the layout options list (around line 161), add:

{/* Selected Layout Preview */}
{selectedOption && dieline && (
  <Collapsible open={showPreview} onOpenChange={setShowPreview}>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm" className="w-full justify-between">
        <span className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Preview Layout Diagram
        </span>
        {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-4">
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-4">
          {selectedOption.runs.map((run, idx) => (
            <RunLayoutDiagram
              key={idx}
              runNumber={run.run_number}
              slotAssignments={run.slot_assignments}
              dieline={dieline}
              items={items}
              meters={run.meters}
              frames={run.frames}
              showStats={true}
            />
          ))}
        </div>
      </ScrollArea>
    </CollapsibleContent>
  </Collapsible>
)}
```

This adds a collapsible section that shows the visual grid diagram for each run in the selected layout option.

---

## Fix 2: VPS Preflight Endpoint (Separate VPS Update)

The `/preflight` endpoint needs to be added to your VPS. Here's the file to create:

**New VPS File:** `app/api/preflight.py`

```python
"""
Preflight API - Deep PDF analysis for print quality
Uses pikepdf for comprehensive preflight checks
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging

from app.services.pikepdf_service import PikepdfService
from app.services.file_manager import FileManager

router = APIRouter()
logger = logging.getLogger(__name__)


class PreflightRequest(BaseModel):
    pdf_url: str


class ImageInfo(BaseModel):
    page: int
    width: int
    height: int
    color_space: str
    bits_per_component: int
    estimated_dpi: Optional[float] = None
    is_low_res: bool = False


class FontInfo(BaseModel):
    name: str
    subtype: str
    embedded: bool
    subset: bool


class PreflightResponse(BaseModel):
    page_count: int
    pdf_version: str
    has_bleed: bool
    bleed_mm: Optional[float] = None
    images: List[ImageInfo]
    low_res_images: int
    min_dpi: float
    fonts: List[FontInfo]
    unembedded_fonts: int
    color_spaces: List[str]
    has_rgb: bool
    has_cmyk: bool
    spot_colors: List[str]
    warnings: List[str]
    errors: List[str]


@router.post("", response_model=PreflightResponse)
async def run_preflight(request: PreflightRequest):
    """
    Run comprehensive preflight analysis on a PDF from URL.
    
    Checks:
    - Image resolution (DPI)
    - Font embedding
    - Color spaces (RGB vs CMYK)
    - Spot colors
    - Page boxes (bleed detection)
    """
    file_manager = FileManager()
    pikepdf_service = PikepdfService()
    input_path = None
    
    try:
        logger.info(f"Running preflight for: {request.pdf_url[:80]}...")
        input_path = await file_manager.download_from_url(request.pdf_url)
        
        # Run full preflight check
        report = await pikepdf_service.full_preflight(input_path)
        
        return PreflightResponse(**report)
        
    except Exception as e:
        logger.error(f"Preflight error: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        if input_path:
            await file_manager.cleanup(input_path)
```

**Update VPS:** `app/api/routes.py` to include the new router:

```python
from app.api.preflight import router as preflight_router
# ...
api_router.include_router(preflight_router, prefix="/preflight", tags=["Preflight"])
```

---

## Summary of Changes

| Location | File | Change |
|----------|------|--------|
| Lovable | `LayoutOptimizer.tsx` | Add collapsible preview section with `RunLayoutDiagram` |
| VPS | `app/api/preflight.py` | Create new endpoint for deep PDF analysis |
| VPS | `app/api/routes.py` | Register preflight router |

The VPS changes are separate from this Lovable project - you'll need to update your VPS repository and redeploy.

