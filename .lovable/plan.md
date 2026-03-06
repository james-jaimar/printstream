

# Rewrite Backfill Script to Use Auto-Resolver with Pagination

## Problem
The existing `backfillPaperSpecifications.ts` has two issues:
1. Uses the old `PaperSpecificationSaver` (fuzzy name matching) instead of the new `PaperSpecAutoResolver` (proper `excel_import_mappings` lookup)
2. Fetches jobs with a single query, hitting the 1000-row Supabase limit -- will miss jobs beyond that

## Fix

### File: `src/utils/backfillPaperSpecifications.ts`

Rewrite to:
- **Paginate** fetches in batches of 500 using `.range()` to get ALL jobs with `paper_specifications` JSONB
- **Use `autoResolvePaperSpecifications()`** instead of `PaperSpecificationSaver` -- this is the same resolver now integrated into the job creators, ensuring consistent mapping logic
- Keep the existing results/stats structure so the UI page works unchanged

The `autoResolvePaperSpecifications` already handles:
- Skipping jobs that already have `job_print_specifications` entries
- Exact match + normalized spacing fallback against `excel_import_mappings`
- Inserting resolved `paper_type` and `paper_weight` specification IDs

No changes needed to `BackfillPaperSpecs.tsx` (UI page) or routing -- it's already at `/admin/backfill-paper-specs` behind `AdminRoute`.

