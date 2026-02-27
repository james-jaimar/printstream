

# Fix: Restore Duplicate Filtering in Standard Excel Import Flow

## Problem

The Excel Import system has two parsing paths:
- **Matrix parser** (`parseMatrixDataToJobs`): Calls `checkParsedJobsForDuplicates` to filter out WO numbers already in the database. This works correctly.
- **Standard parser** (`parseExcelFileWithMapping` / `parseAndPrepareProductionReadyJobs`): Never calls `checkParsedJobsForDuplicates`. All rows pass through regardless of whether they already exist in the database.

The database upsert with `ignoreDuplicates: true` silently drops duplicates at insert time, but the user never sees which ones were skipped during the preview/mapping phase, and the job count shown is misleading.

## Fix

### 1. Add duplicate check to `parseExcelFileWithMapping` in `src/utils/excel/enhancedParser.ts`

After the jobs are parsed (around line 322, after the `dataRows.forEach` loop and before the enhanced mapping), add a call to `checkParsedJobsForDuplicates`:

- Import `checkParsedJobsForDuplicates` from `@/utils/jobDeduplication`
- After building the `mapped` array, call `checkParsedJobsForDuplicates(mapped)`
- Filter out duplicates from the `mapped` array
- Track `duplicatesSkipped` and `duplicateJobs` in the return value
- Log which WO numbers were skipped

### 2. Propagate duplicate info through `parseAndPrepareProductionReadyJobs`

Currently this function calls `parseExcelFileWithMapping` but discards the duplicate info (the return type only has `{ jobs, stats }`). Update it to:
- Capture `duplicatesSkipped` and `duplicateJobs` from the parse result
- Pass them through to the final `EnhancedJobCreationResult`

### 3. Update `ParsedData` type in `src/utils/excel/types.ts`

Ensure `duplicatesSkipped` and `duplicateJobs` are consistently available on the `ParsedData` interface (they already exist as optional fields, so this is just verification).

## Technical Details

The key change is in `parseExcelFileWithMapping` around line 322:

```typescript
// After: const mapped: ParsedJob[] = [];  ... dataRows.forEach(...)

// NEW: Check for duplicates against existing database
const duplicateCheck = await checkParsedJobsForDuplicates(mapped);
const filteredJobs = duplicateCheck.newJobs;
const duplicatesSkipped = duplicateCheck.duplicates.length;
const duplicateJobs = duplicateCheck.duplicates;

if (duplicatesSkipped > 0) {
  logger.addWarning(`Skipped ${duplicatesSkipped} duplicate WO numbers`);
}

// Then use filteredJobs instead of mapped for the rest of the function
```

## Files Changed

1. `src/utils/excel/enhancedParser.ts` -- add import and duplicate check call in `parseExcelFileWithMapping`, propagate in `parseAndPrepareProductionReadyJobs`

