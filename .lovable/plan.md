

# Filter Backfill to Current Orders Only

## Problem
The backfill query fetches **all** production jobs with `paper_specifications` — including completed, cancelled, and archived jobs. This is wasteful and slow.

## Fix

### `src/utils/backfillPaperSpecifications.ts`
Add a status filter to the query to exclude completed/cancelled jobs:

```typescript
.not('paper_specifications', 'is', null)
.not('status', 'in', '("Completed","Cancelled","cancelled","completed")')
```

This ensures only active/current orders are processed. Also update the UI description text in `BackfillPaperSpecs.tsx` to clarify it only processes current orders.

### Files
| File | Change |
|------|--------|
| `src/utils/backfillPaperSpecifications.ts` | Add `.not('status', 'in', ...)` filter to exclude completed/cancelled jobs |
| `src/pages/BackfillPaperSpecs.tsx` | Update description text to say "current orders only" |

