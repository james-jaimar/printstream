

# Force Re-Resolve Paper Specifications

## Problem
You already have the backfill tool at `/admin/backfill-paper-specs`, but it **skips** any job that already has paper specs in `job_print_specifications`. After updating mappings, you need a way to **clear and re-resolve** all paper specs using the updated mappings.

## Plan

### 1. Add "Force Mode" to `backfillPaperSpecifications()` (`src/utils/backfillPaperSpecifications.ts`)
- Accept an optional `forceResolve: boolean` parameter
- When `true`, delete existing `paper_type` and `paper_weight` entries from `job_print_specifications` for each job **before** calling `autoResolvePaperSpecifications`
- This lets the auto-resolver re-run with the updated mapping library

### 2. Update the UI page (`src/pages/BackfillPaperSpecs.tsx`)
- Add a toggle/checkbox: **"Force re-resolve (overwrite existing paper specs)"**
- When checked, pass `forceResolve: true` to the backfill function
- Add a warning alert when force mode is selected, explaining it will replace existing paper specs with new mappings
- Show results as before (processed, skipped, unmapped, etc.)

### Files
| File | Change |
|------|--------|
| `src/utils/backfillPaperSpecifications.ts` | Add `forceResolve` param; delete existing specs before re-resolving when enabled |
| `src/pages/BackfillPaperSpecs.tsx` | Add force-mode checkbox + warning |

