

# Fix: Single-Page Dieline Imposition

## Problem

The system sends `meters_to_print` (e.g., 103m) to the VPS, causing it to generate hundreds of repeated frames. You just need **one page** matching the dieline layout with each slot's PDF placed at the correct position.

For a 70x100mm label (4 across, 3 down): one PDF page, 292mm x 309mm, with 12 PDFs placed on it. Done.

## Changes

### 1. Edge Function: `supabase/functions/label-impose/index.ts`

- Remove `meters` from the VPS payload entirely (or send `meters: 0` / `frames: 1` depending on the VPS API contract)
- The VPS should produce exactly **one page** -- the dieline layout with slots filled
- Remove the `frames_count` and `meters_to_print` fields from the callback update (these are already stored as production metadata from the optimizer, not from the VPS output)

Current payload sent to VPS:
```
{
  dieline: { ... },
  slots: [ ... ],
  meters: 103.82,           // <-- THIS IS THE PROBLEM
  include_dielines: true,
  upload_config: { ... },
  callback_config: { ... }
}
```

After fix:
```
{
  dieline: { ... },
  slots: [ ... ],
  include_dielines: true,
  upload_config: { ... },
  callback_config: { ... }
}
```

No `meters` field. The VPS should interpret this as "produce one frame".

If the VPS requires the field, send `meters: 0` or `frames: 1` -- confirm with your VPS API which parameter controls single-frame output.

### 2. Frontend Hook: `src/hooks/labels/useBatchImpose.ts`

- Remove `meters_to_print` from the `ImpositionRequest` sent to the edge function (line 202)
- Or set it to a sentinel value like `0` if the type requires it

Change line 202 from:
```typescript
meters_to_print: run.meters_to_print || 1,
```
to:
```typescript
meters_to_print: 0,  // Single frame only — printer handles repetition
```

### 3. Type cleanup: `src/services/labels/vpsApiService.ts`

- Add a comment on `meters_to_print` in `ImpositionRequest` clarifying it's not used for PDF generation
- Or make it optional since it's no longer meaningful for the VPS call

## What Does NOT Change

- `meters_to_print` and `frames_count` on `label_runs` table -- these remain as production planning/scheduling metadata from the optimizer
- All UI displays of meters, frames, duration -- still accurate for scheduling
- The optimizer logic -- untouched
- The callback contract -- VPS still PATCHes `label_runs` on completion

## Files Modified

1. `supabase/functions/label-impose/index.ts` -- remove `meters` from VPS payload
2. `src/hooks/labels/useBatchImpose.ts` -- send `meters_to_print: 0`

Two lines. The VPS should then produce a single-page PDF in under a second.

