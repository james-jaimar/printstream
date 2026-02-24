

# Fix: Add Barcode Scanning to Finishing Dashboard

## Problem

The **FinishingKanbanDashboard** (used by saddle stitch, binding, handwork operators) is missing barcode scanning entirely. Other dashboards (DTP, Scoring, Packaging) all have:
- A `GlobalBarcodeListener` component
- `scanCompleted` state tracking
- A `handleBarcodeDetected` function with flexible WO matching

The Finishing dashboard has none of these, so when an operator scans barcode `429593` (for job `D429593`), nothing happens.

## The Scan Itself

The barcode value `429593` is correct -- it's the numeric portion of WO `D429593`. The flexible matching logic (`woMatchesBarcode`) used in other dashboards already handles stripping the `D` prefix. The issue is purely that this dashboard never receives the scan event.

## Changes Required

### File: `src/components/tracker/factory/FinishingKanbanDashboard.tsx`

1. **Add `scanCompleted` state** -- `useState(false)`, reset on modal open/close
2. **Add `GlobalBarcodeListener`** -- import and render it in the JSX
3. **Add `handleBarcodeDetected` handler** with the same flexible matching logic used in other dashboards:
   - If modal is open: verify barcode matches selected job, set `scanCompleted = true` on match
   - If modal is closed: search all jobs for a match, auto-open that job's modal with `scanCompleted = true`
4. **Pass `scanCompleted` to `EnhancedJobDetailsModal`** -- currently missing this prop, so the modal always shows "Scan Required"

### Technical Details

The implementation follows the exact same pattern already established in:
- `DtpKanbanDashboard.tsx` (lines 250-273)
- `ScoringKanbanDashboard.tsx`
- `PackagingShippingKanbanDashboard.tsx`
- `SchedulerAwareOperatorDashboard.tsx`

The matching helper:

```text
woMatchesBarcode(woNo, barcodeData):
  - Normalize both strings (uppercase, strip non-alphanumeric)
  - Strip leading letters to get numeric portion
  - Match if either exact match or numeric portions match
  - e.g. "429593" matches "D429593"
```

No database changes needed. Single file edit.

## File Summary

| File | Change |
|------|--------|
| `src/components/tracker/factory/FinishingKanbanDashboard.tsx` | Add GlobalBarcodeListener, scanCompleted state, barcode handler, pass scanCompleted to modal |

