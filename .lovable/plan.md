
# Fix: Make "Awaiting Payment" Hold Accessible

## Problem

The "Hold for Payment" functionality was built but is currently inaccessible because:

1. **Data not fetched**: `useAccessibleJobs` doesn't query `payment_status` from `production_jobs`, so it's always `undefined`
2. **Conditional rendering bug**: The `PaymentHoldBanner` in `EnhancedJobDetailsModal` is only rendered when `payment_status === 'awaiting_payment'` — but the "Hold for Payment" button (for marking a paid job as on-hold) only shows when status is `'paid'`. So you can never reach it.
3. **Missing type**: `payment_status` and `payment_hold_reason` aren't in the `AccessibleJob` interface

## Changes

### 1. Add `payment_status` to `AccessibleJob` type

**File**: `src/hooks/tracker/useAccessibleJobs/types.ts`

Add two new optional fields:
- `payment_status?: string`
- `payment_hold_reason?: string | null`

### 2. Fetch `payment_status` in the accessible jobs query

**File**: `src/hooks/tracker/useAccessibleJobs/` (the query file)

Include `payment_status` and `payment_hold_reason` in the select query and map them into the returned job objects.

### 3. Fix the conditional rendering in `EnhancedJobDetailsModal`

**File**: `src/components/tracker/factory/EnhancedJobDetailsModal.tsx`

Change the condition from:
```
{(job as any).payment_status === 'awaiting_payment' && (
```
To always render the banner (it handles both states internally):
```
<PaymentHoldBanner
  jobId={job.job_id}
  paymentStatus={job.payment_status || 'paid'}
  paymentHoldReason={job.payment_hold_reason}
  onReleased={onClose}
/>
```

This way:
- When status is `'paid'`, admins/managers see a **"Hold for Payment"** button
- When status is `'awaiting_payment'`, the amber banner with **"Release"** button appears

### 4. Add payment hold option to the job actions menus

**File**: `src/components/tracker/views/components/JobRow.tsx` and `src/components/tracker/jobs/JobTableActions.tsx`

Add a "Hold for Payment" / "Release Payment" menu item in the job dropdown actions, so you can toggle it directly from the jobs list without opening the detail modal.

## Summary

| File | Change |
|------|--------|
| `src/hooks/tracker/useAccessibleJobs/types.ts` | Add `payment_status` and `payment_hold_reason` fields |
| `src/hooks/tracker/useAccessibleJobs/` (query file) | Fetch payment columns |
| `src/components/tracker/factory/EnhancedJobDetailsModal.tsx` | Always render `PaymentHoldBanner`, remove `(job as any)` casts |
| `src/components/tracker/views/components/JobRow.tsx` | Add payment hold toggle to dropdown menu |
| `src/components/tracker/jobs/JobTableActions.tsx` | Add payment hold toggle to dropdown menu |
