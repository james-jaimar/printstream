

## Add Imposed PDF Downloads Section to Production Runs

### What This Does
Adds a new "Print Files" section at the top of the Production Runs card that lists all runs with imposed PDFs ready for download. Each entry shows the run number, order number, and the calculated number of copies the printer needs to produce.

### Copies Calculation
For Run 7 example: 500 labels per slot, 3 columns across (labels per row on the page), so the printer needs **500 / 3 = 167 copies** of that run's imposed PDF. The formula is:
```
copies = max quantity_in_slot / columns_across
```

### Changes

#### 1. Fix Edge Function: Stop Overwriting Production Metrics
**File:** `supabase/functions/label-impose/index.ts` (lines 172-183)

Remove `frames_count` and `meters_to_print` from the synchronous success update -- the VPS returns single-frame values (1 frame, ~0.3m) that overwrite the optimizer's correct calculations.

Before:
```typescript
imposed_pdf_url: productionPublicUrl,
imposed_pdf_with_dielines_url: proofPublicUrl || null,
frames_count: vpsResult.frame_count,
meters_to_print: vpsResult.total_meters,
status: "approved",
```

After:
```typescript
imposed_pdf_url: productionPublicUrl,
imposed_pdf_with_dielines_url: proofPublicUrl || null,
status: "approved",
```

#### 2. Add Print Files Section to LabelRunsCard
**File:** `src/components/labels/LabelRunsCard.tsx`

Add a new section above the existing run list that appears when any runs have `imposed_pdf_url` set. It will:

- Filter runs that have an `imposed_pdf_url`
- Sort by run number
- Display each as a downloadable row with:
  - **Run number** and **order number** (from parent context)
  - **Copies to print**: `Math.ceil(maxQuantityInSlot / dieline.columns_across)`
  - A download button that creates a signed URL from the storage path and triggers download
  - A "Download All" button to grab all imposed PDFs

The section uses a `FileDown` icon and is styled distinctly (e.g., blue background tint) to stand out as the operator's action area.

#### Technical Details

**Signed URL generation:** The `imposed_pdf_url` is stored as a full public URL. To download from the private bucket, we extract the storage path (everything after `/object/public/label-files/`) and call `supabase.storage.from('label-files').createSignedUrl(path, 3600)`.

**Copies calculation per run:**
```typescript
const maxQty = Math.max(...run.slot_assignments.map(s => s.quantity_in_slot));
const copies = Math.ceil(maxQty / (dieline?.columns_across || 1));
```

**Download naming:** Files are named like `Run-1_LBL-2026-0001_167-copies.pdf` for easy identification by the print operator.

**New imports needed:** `FileDown`, `Download` from lucide-react, `supabase` client for signed URL generation.

