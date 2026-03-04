

# Add Queue Toggle + Responsive Layout to All Operator Dashboards

The toggle/reorder feature currently only exists on `FinishingKanbanDashboard`. It should be added to all other operator dashboards so every group can customize their view.

## Dashboards to Update

### 1. ScoringKanbanDashboard
- Already dynamic (`scoringStages` from permissions) -- straightforward integration
- Add `useStageVisibilityPreferences` + `StageToggleControls` to header
- Replace hardcoded flex layout with dynamic grid based on visible count

### 2. PackagingShippingKanbanDashboard
- Currently hardcoded to 2 columns (Packaging, Shipping)
- Add toggle controls so operators can hide one if they only work packaging or only shipping
- Dynamic grid (1 or 2 columns)

### 3. DtpKanbanDashboard
- Has 4 hardcoded columns: DTP, Proofing, Batch Allocation, Send to Print
- Add toggle so DTP operators can hide columns they don't need
- Dynamic grid based on visible count

### 4. DieCuttingKanbanDashboard
- Machine-based columns -- different pattern (machines + unassigned)
- Skip this one -- machines are dynamically managed, not user-toggleable stages

## Implementation Pattern (same for each)

Each dashboard gets:
1. Import `useStageVisibilityPreferences` and `StageToggleControls`
2. Define stage configs array with `id`, `title`, `backgroundColor`
3. Call `useStageVisibilityPreferences(user?.id)` 
4. Add `StageToggleControls` next to Refresh/ViewToggle buttons
5. Filter rendering through `getVisibleOrderedConfigs`
6. Dynamic grid class based on visible count

## Files to Modify
- `src/components/tracker/factory/ScoringKanbanDashboard.tsx`
- `src/components/tracker/factory/PackagingShippingKanbanDashboard.tsx`
- `src/components/tracker/factory/DtpKanbanDashboard.tsx`

No new files needed -- reuses the existing hook and component.

