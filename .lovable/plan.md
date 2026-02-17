

## Fix Imposition Dimensions, Progress Counter, and VPS Queuing

### 1. Fix Page Dimensions (Critical)

The VPS is using `roll_width_mm` (320mm) as the page width. The correct page dimensions are simply:

```text
page_width  = (label_width + bleed_left + bleed_right) * columns_across
page_height = (label_height + bleed_top + bleed_bottom) * rows_around
```

For this order: 73 * 4 = 292mm wide, 103 * 3 = 309mm high. No gaps added -- labels are butted together.

**File:** `supabase/functions/label-impose/index.ts`

Before building the VPS payload (line ~165), calculate correct dimensions and override `roll_width_mm`:

```typescript
const d = imposeRequest.dieline;
const cellWidth = d.label_width_mm + (d.bleed_left_mm || 0) + (d.bleed_right_mm || 0);
const cellHeight = d.label_height_mm + (d.bleed_top_mm || 0) + (d.bleed_bottom_mm || 0);
const pageWidth = cellWidth * d.columns_across;
const pageHeight = cellHeight * d.rows_around;

console.log(`Calculated page: ${pageWidth}mm x ${pageHeight}mm (cell: ${cellWidth}x${cellHeight})`);
```

Then in the VPS payload, override `roll_width_mm` with `pageWidth` and add `page_height_mm: pageHeight`:

```typescript
const vpsPayload = JSON.stringify({
  dieline: {
    ...imposeRequest.dieline,
    roll_width_mm: pageWidth,
    page_height_mm: pageHeight,
  },
  slots: slotsWithRotation,
  meters: 0,
  include_dielines: imposeRequest.include_dielines,
  upload_config: uploadConfig,
  callback_config: callbackConfig,
});
```

---

### 2. Fix Progress Counter

Currently shows "0/9 Completed" because it counts `status === 'completed'` (post-printing). After imposition, runs are `approved`, not `completed`.

**File:** `src/components/labels/LabelRunsCard.tsx`

Change the counter to show the most relevant metric:
- Add an `imposedRuns` count: runs that have an `imposed_pdf_url`
- Show "X/Y Imposed" when there are imposed runs but none completed yet
- Show "X/Y Completed" once printing has started

```typescript
const imposedRuns = runs.filter(r => r.imposed_pdf_url).length;
// Display logic:
// If any completed -> show completed count
// Else if any imposed -> show imposed count  
// Else -> show 0/total
```

---

### 3. Add Delay Between Runs (VPS Breathing Room)

**File:** `src/hooks/labels/useBatchImpose.ts`

Add a 3-second delay between sequential runs in the batch loop (after each run finishes, before starting the next). This gives the VPS time to finish cleanup and reduces 503 errors:

```typescript
// After each run completes (around line 175, before the next iteration)
if (i < targetRuns.length - 1) {
  await delay(3000);
}
```

---

### Deployment

Redeploy the `label-impose` edge function, then "Reprocess All" to generate correctly-sized PDFs.

### Summary

| File | Change |
|------|--------|
| `supabase/functions/label-impose/index.ts` | Calculate page dimensions from cell size * grid count (no gaps), override roll_width_mm |
| `src/components/labels/LabelRunsCard.tsx` | Show "Imposed" counter when relevant instead of only "Completed" |
| `src/hooks/labels/useBatchImpose.ts` | Add 3s delay between sequential runs |

