

# Add Quantity to Paper List Report

## Problem
The Paper List currently shows "Est. Min" (estimated minutes) but what's actually needed is the **quantity** (number of sheets/copies) from each stage instance — which is the `quantity` column on `job_stage_instances`.

## Changes

### 1. `src/hooks/useScheduleReader.tsx`
- Add `quantity` to the `job_stage_instances` select query (line ~133)

### 2. `src/hooks/useScheduleReader.tsx` — ScheduledStageData interface
- Add `quantity?: number` field

### 3. `src/hooks/useScheduleReader.tsx` — stage mapping logic
- Pass `quantity` through when building stage data objects

### 4. `src/components/schedule/dialogs/PaperListDialog.tsx`
- Replace `totalMinutes` / "Est. Min" with `totalQty` / "Qty"
- Aggregate `stage.quantity` instead of `stage.estimated_duration_minutes`
- Update the copy-to-clipboard and print outputs accordingly

### Files
| File | Change |
|------|--------|
| `src/hooks/useScheduleReader.tsx` | Add `quantity` to query + interface + mapping |
| `src/components/schedule/dialogs/PaperListDialog.tsx` | Replace Est. Min with Qty aggregation |

