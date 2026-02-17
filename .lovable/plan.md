

## Fix: Send Bleed Dimensions to VPS Imposition Engine

### The Problem
The VPS imposition engine receives `label_width_mm: 70` and `label_height_mm: 100` but has no bleed information. The dieline has 1.5mm bleed on each side (3mm total), so the actual cell size on the imposed sheet should be:
- Width: 70 + 1.5 + 1.5 = **73mm** per label
- Height: 100 + 1.5 + 1.5 = **103mm** per label

Expected page dimensions: 73 x 4 = **292mm wide**, 103 x 3 = **309mm high** (plus gaps)

Current wrong output: 320 x 306mm with 11 labels instead of 12.

### The Fix
Add bleed fields to the dieline config sent to the VPS at every layer of the pipeline.

### Changes

#### 1. Client Service Types (`src/services/labels/vpsApiService.ts`)
Add bleed fields to `DielineConfig`:

```typescript
export interface DielineConfig {
  roll_width_mm: number;
  label_width_mm: number;
  label_height_mm: number;
  columns_across: number;
  rows_around: number;
  horizontal_gap_mm: number;
  vertical_gap_mm: number;
  corner_radius_mm?: number;
  bleed_left_mm?: number;
  bleed_right_mm?: number;
  bleed_top_mm?: number;
  bleed_bottom_mm?: number;
}
```

#### 2. Hook (`src/hooks/labels/useBatchImpose.ts`)
Pass bleed values when building `dielineConfig`:

```typescript
const dielineConfig: DielineConfig = {
  // ...existing fields...
  bleed_left_mm: dieline.bleed_left_mm ?? 0,
  bleed_right_mm: dieline.bleed_right_mm ?? 0,
  bleed_top_mm: dieline.bleed_top_mm ?? 0,
  bleed_bottom_mm: dieline.bleed_bottom_mm ?? 0,
};
```

#### 3. Edge Function (`supabase/functions/label-impose/index.ts`)
Add bleed fields to the `ImposeRequest` interface and pass them through to the VPS payload:

```typescript
interface ImposeRequest {
  // ...existing fields...
  dieline: {
    // ...existing fields...
    bleed_left_mm?: number;
    bleed_right_mm?: number;
    bleed_top_mm?: number;
    bleed_bottom_mm?: number;
  };
}
```

No other changes needed in the edge function -- the `dieline` object is already passed directly to the VPS in the payload body (`dieline: imposeRequest.dieline`), so the new fields will flow through automatically.

#### 4. Redeploy Edge Function
Deploy the updated `label-impose` function, then re-impose runs to get corrected PDFs.

### What This Achieves
- VPS receives bleed dimensions and can calculate correct cell sizes (73mm x 103mm)
- Page will be the correct 292mm x 309mm (plus gaps)
- All 12 grid positions will be filled correctly

