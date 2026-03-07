

# Fix Paper Specification Pipeline: Mapping Not Reaching Schedule Board

## Problem Traced

For job D430816, the full data flow is:

1. **Excel text**: `"Distak Semi Gloss, 80gsm, White, 1000x700"`
2. **Mapping exists** in `excel_import_mappings`: maps to `paper_type = "Paper Adhesive"` + `paper_weight = "080gsm"` (correct)
3. **JSONB saved** to `production_jobs.paper_specifications`: raw text stored correctly
4. **`job_print_specifications` table**: **EMPTY** for this job — the mapping was never written
5. **Schedule board fallback**: parses JSONB with regex, extracts "80gsm" + "Gloss" (partial match from "Semi Gloss") → displays "80gsm Gloss" (wrong)

## Root Cause

Neither job creator automatically looks up `excel_import_mappings` to resolve paper specs into `job_print_specifications`. The `enhancedJobCreator` only does this if `userApprovedMappings` explicitly contains a `paperSpecification` field — which depends on the UI flow. The `DirectJobCreator` tries to match against `print_specifications.name` directly, but raw Excel text like "Distak Semi Gloss, 80gsm, White, 1000x700" never matches.

## Fix (Two Parts)

### Part 1: Auto-resolve paper specs during job creation

Add a shared utility function that runs after a job is created. It reads the job's `paper_specifications` JSONB keys, looks them up in `excel_import_mappings` (where `mapping_type = 'paper_specification'`), and saves the resolved `paper_type_specification_id` / `paper_weight_specification_id` to `job_print_specifications`.

**New file**: `src/services/PaperSpecAutoResolver.ts`
```text
- Takes job_id and paper_specifications JSONB
- For each key in the JSONB object:
  - Query excel_import_mappings WHERE excel_text = key AND mapping_type = 'paper_specification'
  - If found and has paper_type_specification_id / paper_weight_specification_id:
    - Upsert into job_print_specifications with categories 'paper_type' and 'paper_weight'
- Skip if job_print_specifications already has entries (don't overwrite)
```

**Modified**: `src/services/DirectJobCreator.ts` — call auto-resolver after job creation (line ~164)
**Modified**: `src/utils/excel/enhancedJobCreator.ts` — call auto-resolver as fallback after the userApprovedMappings block (line ~549)

### Part 2: Fix JSONB fallback parser

In `src/hooks/useScheduleReader.tsx` (lines 376-386), the `knownTypes` matching extracts "Gloss" from "Semi Gloss". Fix by using word-boundary matching to avoid partial matches.

```text
Current:  firstKey.toLowerCase().includes(kt.toLowerCase())
Fixed:    new RegExp(`\\b${kt}\\b`, 'i').test(firstKey)
          — BUT also exclude "Semi Gloss" from matching "Gloss"
          — Add "Semi Gloss" and "Adhesive" to knownTypes list
          — Check longer compound types before shorter ones
```

### Files Modified
- **New**: `src/services/PaperSpecAutoResolver.ts`
- **Edit**: `src/services/DirectJobCreator.ts` — integrate auto-resolver
- **Edit**: `src/utils/excel/enhancedJobCreator.ts` — integrate auto-resolver as fallback
- **Edit**: `src/hooks/useScheduleReader.tsx` — fix JSONB fallback type extraction

