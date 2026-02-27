# Project Rules

## Lateral Thinking Rule

When implementing any UI status indicator, badge, visual cue, or informational element:

1. **Apply across ALL views** — not just the view the user is currently looking at. If a badge or indicator is relevant to a job, it must appear in every component that renders job cards, job lists, job rows, or job detail views (e.g., Production, Kanban, Manager Dashboard, DTP area, Order Modals, etc.).

2. **Proactively recommend** — If you think of a place the user hasn't mentioned where the feature would be useful, suggest it. Think like a human who uses the app daily across multiple screens.

3. **Audit all job-rendering components** when adding any new job-level visual indicator. The current list includes (but is not limited to):
   - `JobRow.tsx` (main orders list)
   - `EnhancedKanbanJobCard.tsx` (kanban board)
   - `EnhancedJobCard.tsx` (enhanced card view)
   - `ProductionJobCard.tsx` (production card)
   - `BatchJobCard.tsx` (batch master card)
   - `BatchAwareJobCard.tsx` (batch-aware card)
   - `ProductionJobsList.tsx` (production list view)
   - `EnhancedProductionJobCard.tsx` (enhanced production card)
   - `CompactJobCard.tsx` (compact card)
   - `FilteredJobsList.tsx` (dashboard filtered list)
   - `FilteredJobsView.tsx` (production filtered view)
   - `ManagerDashboard.tsx` (manager dashboard job rows)
   - `JobOverviewCard.tsx` (job detail overview)
