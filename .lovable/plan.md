

# Fix: Duplicate Check Missing Jobs Due to Supabase Default Row Limit

## Root Cause

The console log confirms: `Duplicate check complete: 36 new jobs, 0 duplicates found` -- the check runs but finds zero duplicates, even though D430770 exists in the database.

The problem is in `checkParsedJobsForDuplicates` in `src/utils/jobDeduplication.ts` (line 72):

```typescript
const { data: existingJobs, error } = await supabase
  .from('production_jobs')
  .select('wo_no');
```

**Supabase's default `.select()` returns a maximum of 1,000 rows.** The database has 2,074 production jobs, so only ~1,000 WO numbers are loaded into the lookup set. If D430770 falls outside that first 1,000, it is not found and the job passes through as "new."

## Fix

**File: `src/utils/jobDeduplication.ts`**

### Option 1 (targeted -- preferred): Only query WO numbers that are in the import batch

Instead of fetching all 2,074 WO numbers, query only the specific ones we need to check:

```typescript
// Extract normalized WO numbers from parsed jobs
const woNumbers = parsedJobs
  .map(job => formatWONumber(job.wo_no))
  .filter(Boolean);

const { data: existingJobs, error } = await supabase
  .from('production_jobs')
  .select('wo_no')
  .in('wo_no', woNumbers);
```

This is faster, avoids the 1,000-row limit issue entirely, and scales regardless of how many total jobs exist.

### Backup: Also fix `findDuplicateJobs` (same file, line 16)

The `findDuplicateJobs` function has the same 1,000-row limit issue. Add pagination or use the `.in()` approach where applicable.

## Changes

1. **`src/utils/jobDeduplication.ts`** -- `checkParsedJobsForDuplicates`: Replace broad `select('wo_no')` with targeted `.in('wo_no', woNumbers)` query using the batch's WO numbers
2. **`src/utils/jobDeduplication.ts`** -- `findDuplicateJobs`: Add pagination loop to fetch all rows (this function needs all jobs)

