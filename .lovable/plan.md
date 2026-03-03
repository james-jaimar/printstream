

# Fix: Restore Paper Specs on Schedule Board Printing Cards

## Root Cause

The schedule reader query (`useScheduleReader.tsx` line 197) does NOT include `paper_specifications` in the production_jobs select:

```
.select("id, wo_no, customer, finishing_specifications, due_date, original_committed_due_date")
```

Meanwhile:
- **Priority 1** (`job_print_specifications` table): Currently scheduled printing jobs (D430792, D430796, D430803, D430827) have **0 rows** in this table -- they were never manually assigned specs
- **Priority 2** (stage instance notes): All printing stage instances have **null** notes -- nothing to parse

The actual paper data exists in the `production_jobs.paper_specifications` JSONB column (populated by the matrix parser), e.g.:
- D430792: `"Stock - Bond, 80gsm, White, 750x530"`  
- D430796: `"HI-Q Titan (Gloss), 128gsm, White, 640x915"`
- D430803: `"HI-Q Titan (Matt), 250gsm, White, 530x750"`

But the code never reads it.

## Fix (single file: `src/hooks/useScheduleReader.tsx`)

### Change 1: Add `paper_specifications` to the job query (line 197)

```
.select("id, wo_no, customer, finishing_specifications, paper_specifications, due_date, original_committed_due_date")
```

### Change 2: Add Priority 3 fallback after the notes check (after line 366)

When neither `job_print_specifications` nor stage notes have paper data, parse the first key of `paper_specifications` JSONB using regex to extract weight (e.g., "80gsm", "128gsm") and type (e.g., "Bond", "Gloss", "Matt"):

```text
JSONB key example: "Stock - Bond, 80gsm, White, 750x530"
Regex extracts:    weight = "80gsm", type = "Bond"
Display:           "80gsm Bond"

JSONB key example: "HI-Q Titan (Gloss), 128gsm, White, 640x915"  
Regex extracts:    weight = "128gsm", type = "Gloss"
Display:           "128gsm Gloss"
```

The parsing logic:
1. Get first key of `paper_specifications` JSONB from the job
2. Extract weight with regex: `/(\d+gsm)/i`
3. Extract type by checking for known types: Gloss, Matt, Bond, Silk, Uncoated, FBB, or extract from parentheses like "(Gloss)"
4. Combine as `"weight type"` for display

This matches the existing pattern used by `useJobPaperSpecs` and `SubSpecificationBadge` which already do this fallback elsewhere in the codebase.

## Expected Result

All scheduled printing stage cards will show paper spec badges like "80gsm Bond", "128gsm Gloss", "250gsm Matt" -- exactly as they did before, using the JSONB data that's already in the database.

