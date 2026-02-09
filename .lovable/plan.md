

# Comprehensive Labels Division Workflow Architecture

## Current State Analysis

Based on my exploration, the system currently has:

### Existing Components
- **Layout Optimizer**: AI-driven run planning with visual diagrams
- **Artwork Upload**: PDF drop zone with client-side validation
- **Basic Preflight**: Dimension checking via VPS `/page-boxes` endpoint
- **Imposition Edge Function**: `label-impose` calls VPS `/impose/labels`
- **Client Portal**: Authenticated proofing with approval/rejection flow
- **Database Structure**: `label_items` table with single `artwork_pdf_url` field

### Current Gaps
1. **Single artwork field** - No distinction between proof artwork and print-ready artwork
2. **No cropping workflow** - VPS can crop, but no UI/trigger exists
3. **No artwork status tracking** - Items only track preflight status, not artwork readiness
4. **Imposition not triggered** - No UI to generate imposed PDFs per run
5. **Client portal can't upload** - Clients can only approve/reject, not upload new artwork

---

## Proposed Architecture

### Phase 1: Dual Artwork Model

Extend `label_items` to support separate proof and production artwork:

```text
label_items table additions:
+-------------------------+----------+------------------------------------------+
| Column                  | Type     | Purpose                                  |
+-------------------------+----------+------------------------------------------+
| proof_pdf_url           | text     | Proof artwork (may have dielines)        |
| proof_thumbnail_url     | text     | Thumbnail for proof display              |
| print_pdf_url           | text     | Print-ready artwork (no dielines)        |
| print_pdf_status        | text     | 'pending' | 'ready' | 'processing'       |
| requires_crop           | boolean  | VPS should auto-crop to bleed            |
| crop_amount_mm          | jsonb    | {left, right, top, bottom}               |
| artwork_source          | text     | 'admin' | 'client'                       |
+-------------------------+----------+------------------------------------------+
```

### Phase 2: Artwork Upload Workflow

```text
                    ┌─────────────────────────────────────────┐
                    │          ARTWORK UPLOAD FLOW            │
                    └─────────────────────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
       ┌──────────┐             ┌──────────┐             ┌──────────┐
       │  Client  │             │  Admin   │             │ Acc Exec │
       │  Portal  │             │  Upload  │             │  Upload  │
       └────┬─────┘             └────┬─────┘             └────┬─────┘
            │                        │                        │
            ▼                        ▼                        ▼
       Upload to                Upload BOTH:              Upload BOTH:
       proof_pdf_url            - proof_pdf_url           - proof_pdf_url
       (auto-validated)         - print_pdf_url           - print_pdf_url
            │                        │                        │
            ▼                        ▼                        ▼
       ┌─────────────────────────────────────────────────────────┐
       │              VALIDATION PIPELINE                        │
       │  1. label-page-boxes (TrimBox extraction)               │
       │  2. Size check against dieline                          │
       │  3. Auto-crop decision (within 1mm tolerance)           │
       │  4. Deep preflight (async): DPI, CMYK, fonts            │
       └─────────────────────────────────────────────────────────┘
```

### Phase 3: Artwork Status States

```text
┌─────────────────────────────────────────────────────────────┐
│                    ITEM ARTWORK STATUS                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NO_ARTWORK ─► PROOF_ONLY ─► READY_FOR_PRINT               │
│       │            │              │                         │
│       │            │              ▼                         │
│       │            │         PROCESSING                     │
│       │            │         (VPS cropping)                 │
│       │            │              │                         │
│       │            │              ▼                         │
│       │            │         PRINT_READY                    │
│       │            │                                        │
│       ▼            ▼                                        │
│  Client must   Admin reviews,                               │
│  upload        uploads print file                           │
│  artwork       or triggers crop                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: Final Output / Imposition Workflow

```text
┌─────────────────────────────────────────────────────────────┐
│               PRODUCTION OUTPUT WORKFLOW                     │
└─────────────────────────────────────────────────────────────┘

   1. LAYOUT APPROVED
          │
          ▼
   2. CHECK ALL ITEMS PRINT-READY
          │ (all items must have print_pdf_status = 'ready')
          │
          ▼
   3. CROP ARTWORK (if needed)
          │ VPS /manipulate/crop endpoint
          │ Updates print_pdf_url with cropped version
          │
          ▼
   4. GENERATE IMPOSITION PER RUN
          │
          ├──► Run 1 ──► VPS /impose/labels ──► production_1.pdf
          │                                      proof_1.pdf (with dielines)
          │
          ├──► Run 2 ──► VPS /impose/labels ──► production_2.pdf
          │                                      proof_2.pdf
          │
          └──► Run 3 ──► VPS /impose/labels ──► production_3.pdf
                                                 proof_3.pdf
          │
          ▼
   5. STORE PDFs
          │ Supabase Storage: label-runs/{order_id}/{run_id}/
          │   - production_{timestamp}.pdf (for press)
          │   - proof_{timestamp}.pdf (for client review)
          │
          ▼
   6. UPDATE RUNS
          │ label_runs.imposed_pdf_url = production URL
          │ label_runs.imposed_pdf_with_dielines_url = proof URL
```

---

## Implementation Plan

### Database Changes

**Migration: Add dual artwork columns to `label_items`**

```sql
ALTER TABLE label_items
ADD COLUMN proof_pdf_url text,
ADD COLUMN proof_thumbnail_url text,
ADD COLUMN print_pdf_url text,
ADD COLUMN print_pdf_status text DEFAULT 'pending' 
  CHECK (print_pdf_status IN ('pending', 'ready', 'processing', 'needs_crop')),
ADD COLUMN requires_crop boolean DEFAULT false,
ADD COLUMN crop_amount_mm jsonb,
ADD COLUMN artwork_source text DEFAULT 'admin' 
  CHECK (artwork_source IN ('admin', 'client'));

-- Copy existing artwork to proof column (migration)
UPDATE label_items 
SET proof_pdf_url = artwork_pdf_url,
    proof_thumbnail_url = artwork_thumbnail_url
WHERE artwork_pdf_url IS NOT NULL;
```

### New VPS Endpoint: `/manipulate/crop`

VPS needs a cropping endpoint (you'll add this to your VPS codebase):

```text
POST /manipulate/crop
{
  "pdf_url": "https://...",
  "crop_mm": {
    "left": 0.5,
    "right": 0.5,
    "top": 0.5,
    "bottom": 0.5
  }
}

Response:
{
  "cropped_pdf_base64": "...",
  "original_size_mm": { "width": 104, "height": 54 },
  "cropped_size_mm": { "width": 103, "height": 53 }
}
```

### New Edge Function: `label-prepare-artwork`

Handles cropping and print-readiness:

```text
POST /functions/v1/label-prepare-artwork
{
  "item_id": "uuid",
  "action": "crop" | "mark_ready" | "validate"
}

Actions:
- crop: Call VPS /manipulate/crop, save result as print_pdf_url
- mark_ready: Set print_pdf_status = 'ready' (use proof as print)
- validate: Re-run preflight checks
```

### Updated Components

**1. Enhanced Artwork Upload Dialog**

New dialog for admin/acc exec uploads with two file inputs:
- Proof artwork (with dieline overlay allowed)
- Print-ready artwork (clean, to bleed specification)

```text
┌─────────────────────────────────────────────────┐
│           Upload Artwork for Item               │
├─────────────────────────────────────────────────┤
│                                                 │
│  PROOF ARTWORK                                  │
│  ┌─────────────────────────────────────────┐   │
│  │  [Drop PDF or click to browse]           │   │
│  │  This file is shown to clients           │   │
│  │  May include dieline overlay             │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  PRINT-READY ARTWORK                           │
│  ┌─────────────────────────────────────────┐   │
│  │  [Drop PDF or click to browse]           │   │
│  │  Clean artwork to exact bleed spec       │   │
│  │  Will be used for imposition             │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ☑ Same file for both (auto-crop if needed)   │
│                                                 │
│  [Cancel]                    [Upload & Validate]│
└─────────────────────────────────────────────────┘
```

**2. Item Status Dashboard**

Show artwork readiness on `LabelItemCard`:

```text
┌─────────────────┐
│   [thumbnail]   │
│                 │
│  ● Proof: ✓     │
│  ● Print: ⏳    │
│                 │
│  Status: NEEDS  │
│  CROP (0.5mm)   │
│                 │
│  [Prepare →]    │
└─────────────────┘
```

**3. Client Portal Artwork Upload**

Allow clients to upload replacement artwork when proof is rejected:

```text
ClientOrderDetail.tsx additions:

- If order has rejected proof, show "Upload New Artwork" button
- Client uploads to proof_pdf_url
- artwork_source = 'client'
- print_pdf_status reverts to 'pending'
- Admin notified to review and prepare print file
```

**4. Production Readiness Check**

Before imposition can run, validate:
- All items have `print_pdf_status = 'ready'`
- Show blocker if any items need attention

```text
LayoutOptimizer.tsx additions:

if (anyItemNeedsPrep) {
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>Artwork Not Ready</AlertTitle>
      <AlertDescription>
        {itemsNeedingPrep.length} items need print-ready artwork:
        <ul>
          <li>Item 1: needs crop (0.5mm)</li>
          <li>Item 2: no print file uploaded</li>
        </ul>
        <Button onClick={prepareAll}>Prepare All</Button>
      </AlertDescription>
    </Alert>
  );
}
```

**5. Generate Imposition Button**

Per-run imposition trigger:

```text
LabelRunsCard.tsx additions:

<Button onClick={() => generateImposition(run.id)}>
  Generate Production PDF
</Button>

// Shows after runs are approved
// Calls label-impose with print_pdf_url for each slot
// Updates run with imposed_pdf_url
```

---

## File Changes Summary

| Type | File | Change |
|------|------|--------|
| DB | Migration | Add proof/print dual columns |
| Edge | `label-prepare-artwork/index.ts` | New - handles cropping |
| Edge | `label-impose/index.ts` | Update to use `print_pdf_url` |
| VPS | `app/api/manipulate.py` | Add `/manipulate/crop` |
| Hook | `useLabelItems.ts` | Add dual artwork fields |
| Component | `LabelItemsDropZone.tsx` | Support dual upload mode |
| Component | `AdminArtworkUploadDialog.tsx` | New - two-file upload |
| Component | `LabelItemCard.tsx` | Show proof/print status |
| Component | `LayoutOptimizer.tsx` | Add readiness check |
| Component | `LabelRunsCard.tsx` | Add imposition trigger |
| Page | `ClientOrderDetail.tsx` | Allow artwork re-upload |
| Types | `labels.ts` | Add new artwork fields |

---

## Workflow Summary

### Admin/Account Exec Flow

1. Create order with dieline
2. Add items with quantities
3. Upload artwork (proof + print, or single with auto-crop)
4. System validates dimensions, flags any issues
5. Generate layout options (AI optimizer)
6. Approve layout (creates runs)
7. Ensure all items are print-ready
8. Generate imposition per run
9. Download production PDFs for press

### Client Flow

1. Receive email notification for proof review
2. Log into authenticated portal
3. View order with proof thumbnails
4. Approve or reject (with mandatory comment)
5. If rejected: optionally upload new artwork
6. Admin reviews client upload, prepares print file
7. Repeat until approved

### Production Output

For a job with 3 runs of a 100x50mm label (3 across, 6 down):
- Run 1: `production_1.pdf` - Imposed artwork for Label A
- Run 2: `production_2.pdf` - Imposed artwork for Label B  
- Run 3: `production_3.pdf` - Imposed artwork for Label C
- Each matches exactly the dieline template
- VPS auto-crops any artwork within tolerance before imposition

