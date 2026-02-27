
# Lateral Thinking Rule + Payment Badge Everywhere

## 1. Add a project-wide instruction rule

Create `.lovable/rules.md` with a guideline that any UI status indicator, badge, or visual cue must be applied **across all views** where the relevant data is displayed — not just the view the user is currently looking at. This ensures future features get comprehensive coverage automatically.

## 2. Add "AWAITING PAYMENT" badge to all job display components

The badge currently only appears in `JobRow.tsx`. It needs to appear in **every** component that renders a job card or job listing. Here are the components that need updating:

| Component | Location | What to add |
|-----------|----------|-------------|
| `EnhancedKanbanJobCard` | `src/components/tracker/kanban/EnhancedKanbanJobCard.tsx` | Amber badge after the Overdue badge in the header |
| `EnhancedJobCard` | `src/components/tracker/EnhancedJobCard.tsx` | Amber badge in the header badges area |
| `ProductionJobCard` | `src/components/tracker/ProductionJobCard.tsx` | Amber badge in the header section |
| `BatchJobCard` | `src/components/tracker/BatchJobCard.tsx` | Amber badge next to "Batch Master" badge |
| `BatchAwareJobCard` | `src/components/tracker/BatchAwareJobCard.tsx` | Amber badge in both compact and full variants |
| `ProductionJobsList` | `src/components/tracker/production/ProductionJobsList.tsx` | Amber badge next to the WO number |
| `EnhancedProductionJobCard` | `src/components/tracker/production/EnhancedProductionJobCard.tsx` | Amber badge next to the WO number |
| `CompactJobCard` | `src/components/tracker/production/CompactJobCard.tsx` | Amber badge in the header row |
| `FilteredJobsList` (dashboard) | `src/components/tracker/dashboard/FilteredJobsList.tsx` | Amber badge next to the job title |
| `FilteredJobsView` (production) | `src/components/tracker/production/FilteredJobsView.tsx` | Amber badge inline with the WO number |
| `ManagerDashboard` | `src/components/tracker/factory/ManagerDashboard.tsx` | Amber badge in the "Recent Progress" and "Attention Required" job rows |
| `JobOverviewCard` | `src/components/tracker/factory/JobOverviewCard.tsx` | Amber badge next to the Status badge |

Each component will get a consistent amber badge using the `PaymentHoldBanner` component in `variant="badge"` mode (which already exists), or a simple inline badge matching the same styling used in `JobRow.tsx`.

## Technical details

- Import `CreditCard` from lucide-react and `Badge` (already imported in most components)
- The condition is: `job.payment_status === 'awaiting_payment'`
- The badge markup is consistent everywhere:
```tsx
{job.payment_status === 'awaiting_payment' && (
  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
    <CreditCard className="h-2.5 w-2.5 mr-0.5" />
    AWAITING PAYMENT
  </Badge>
)}
```
- For components that don't use `AccessibleJob` type directly (like `BatchAwareJobCard`), the `payment_status` field will be added to their local interface as an optional property.
