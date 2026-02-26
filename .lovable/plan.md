

# Production Flexibility: Partial Rework, Payment Holds, and Schedule Placement

## Status: ✅ IMPLEMENTED

### Workstream 1: Partial Rework System ✅
- `usePartialRework.ts` — hook for calculating rework percentages, creating rework stage instances, scheduling
- `PartialReworkDialog.tsx` — modal with shortfall qty input, auto-percentage calc, editable per-stage qty table
- `ReworkSchedulePlacementDialog.tsx` — 4 scheduling options after rework (Expedite, Tomorrow, Custom, Unscheduled)
- `ReworkBadge.tsx` — orange badge showing rework qty on job cards/modals

### Workstream 2: Rework Visibility ✅
- Rework badge shown in EnhancedJobDetailsModal header
- Rework history section in Notes tab
- "Partial Rework" button replaces old placeholder in workflow tab
- Rework stages created with `is_rework = true` and reduced quantities

### Workstream 3: Payment Hold ✅
- `payment_status` column on `production_jobs` (default: 'paid')
- `PaymentHoldBanner.tsx` — amber banner with release button (admin/manager only)
- Stage start blocked in `useStageActions` when `payment_status = 'awaiting_payment'`
- "Hold for Payment" button available to admin/manager on paid jobs
- **Note**: Imported jobs default to 'paid'. Manual hold when needed.

### Database Columns Added
- `rework_qty`, `rework_percentage`, `rework_requested_at`, `rework_requested_by`
- `payment_status`, `payment_hold_reason`, `payment_held_at`, `payment_released_at`, `payment_released_by`

## Previous: Layout Optimizer (Equal-Quantity Strategy) ✅
- AI prompt updated with equal-quantity clustering strategy
- Local `createEqualQuantityRuns` fallback algorithm added
- Registered as 'equal-qty' layout option
