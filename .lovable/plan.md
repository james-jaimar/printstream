

# Fix: Barcode Scanner Failing After Job Completion

## Problem
After completing a DTP stage and moving to the next job, barcode scanning intermittently fails, requiring an F5 refresh. This is an app-side issue, not internet speed.

## Root Cause
Two related bugs cause the barcode listener to drop scans:

**1. Stale closure / listener re-registration during scan**
`handleBarcodeDetected` in `DtpKanbanDashboard.tsx` (line 251) is a plain function, not wrapped in `useCallback`. Every re-render creates a new function reference. Since `GlobalBarcodeListener` has `onBarcodeDetected` in its `useEffect` dependency array, each new reference causes:
- Effect cleanup: removes `keydown` listener, clears barcode buffer
- Effect setup: adds new listener

If a re-render happens **mid-scan** (scanner sends keystrokes over ~50-100ms), the buffer is cleared and the scan is lost. After completing a job, multiple refetches trigger rapid re-renders (action success callback + realtime subscription + job sync effect), making this very likely.

**2. Job sync effect causes unnecessary re-renders**
The `useEffect` on lines 228-235 watches `[jobs, selectedJob]` and calls `setSelectedJob(updatedJob)` on every jobs refresh, even when the selected job's data hasn't meaningfully changed (deep JSON comparison is fragile). This adds more re-renders during the critical scan window.

## Fix

### File 1: `src/components/tracker/factory/DtpKanbanDashboard.tsx`

- Wrap `handleBarcodeDetected` in `useCallback` with `[selectedJob]` dependency, so it only changes when `selectedJob` changes (not on every render)
- Make `GlobalBarcodeListener` **always active** (not just when modal is open), so it can also detect barcodes to auto-open the correct job -- matching the pattern already used in `FinishingKanbanDashboard` and `SchedulerAwareOperatorDashboard`
- Stabilize the job sync effect to only update when the job's stage status actually changes (compare specific fields instead of full JSON)

### File 2: `src/components/tracker/factory/GlobalBarcodeListener.tsx`

- Use a `ref` for the `onBarcodeDetected` callback instead of putting it in the `useEffect` dependency array. This prevents the listener from being torn down and re-registered on every callback change, preserving the barcode buffer mid-scan. The ref always points to the latest callback.

### File 3: Apply same `useCallback` fix to other dashboards
- `ScoringKanbanDashboard.tsx`
- `PackagingShippingKanbanDashboard.tsx`

These use the same pattern and have the same bug.

## Expected Result
- Barcode scans no longer dropped during re-renders
- No F5 refresh needed between jobs
- Smoother operator workflow with faster modal transitions

