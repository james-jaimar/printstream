

# Add Queue Visibility Toggle + Responsive Layout to Operator Dashboard

## What the user wants
The T250 operator sees 5 queues (Hunkeler, Large Format, 7900, HP 12000, T250) but only needs 2 (T250 + Hunkeler). They want to:
1. Toggle off queues they don't need — persistent per user via localStorage
2. Remaining queues fill the screen responsively (2 queues = 2 equal columns filling full width)
3. Ability to reorder columns left/right

## Current state
- `FinishingKanbanDashboard.tsx` dynamically builds `QUEUE_CONFIGS` from `consolidatedStages` (user's permitted stages)
- Grid is hardcoded to `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` — doesn't adapt to visible queue count
- `QueueToggleControls.tsx` exists but is hardcoded to 3 print queues only — not used here
- `useFactoryFloorPreferences.ts` exists with generic stage hide/show logic via localStorage — can be reused

## Plan

### 1. Create `StageToggleControls` component
A new generic version of `QueueToggleControls` that works with dynamic stage lists (not hardcoded). It will:
- Accept the full list of `QUEUE_CONFIGS` as a prop
- Use localStorage key `operator-stage-preferences-{userId}` for per-user persistence
- Show switches for each stage with drag handles for reordering (up/down arrows to keep it simple)
- Return the filtered and ordered list of visible stage IDs

### 2. Add toggle + reorder hook: `useStageVisibilityPreferences`
New hook that manages:
- `hiddenStageIds: string[]` — which stages are hidden
- `stageOrder: string[]` — custom ordering of stages (left to right)
- Persisted to localStorage keyed by user ID
- Returns `getVisibleOrderedConfigs(configs)` that filters hidden and sorts by custom order

### 3. Update `FinishingKanbanDashboard.tsx`
- Import and use the new hook + toggle component
- Add the toggle button to the header (next to search/refresh)
- Filter `QUEUE_CONFIGS` through the hook to get only visible, ordered queues
- Replace hardcoded `grid-cols-4` with dynamic grid classes based on visible count:
  - 1 queue: `grid-cols-1`
  - 2 queues: `grid-cols-2`
  - 3 queues: `grid-cols-3`
  - 4+: `grid-cols-4`
- Apply this to both card and list view grids

### Files to create
- `src/hooks/tracker/useStageVisibilityPreferences.ts`
- `src/components/tracker/factory/StageToggleControls.tsx`

### Files to modify
- `src/components/tracker/factory/FinishingKanbanDashboard.tsx` — integrate toggle + dynamic grid

