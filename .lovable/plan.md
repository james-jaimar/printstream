
# Fix Plan: Kanban and Setup Pages Errors

## Problem Summary

Both the Kanban and Setup (Admin) pages are broken with the following errors:
1. **Kanban**: "Error loading multi-stage kanban" / "Failed to load job stages"
2. **Setup/Admin**: "Something went wrong" (caught by error boundary)

## Root Cause Analysis

After thorough investigation, I've identified that both issues share a common root cause:

### Issue 1: Database Function Missing `proof_approved_at` Return Field

The `get_user_accessible_jobs` RPC function is **missing the `proof_approved_at` field** in its return type:

**Current return type** (from database):
```
job_id, wo_no, customer, contact, status, due_date, reference, category_id, 
category_name, category_color, current_stage_id, current_stage_name, 
current_stage_color, current_stage_status, user_can_view, user_can_edit, 
user_can_work, user_can_manage, workflow_progress, total_stages, 
completed_stages, display_stage_name, qty, started_by, started_by_name, 
proof_emailed_at  -- ENDS HERE, missing proof_approved_at!
```

**But the code expects** (in `src/hooks/tracker/useAccessibleJobs/types.ts`):
```typescript
proof_emailed_at?: string | null;
proof_approved_at?: string | null;  // EXPECTED BUT NOT RETURNED
```

This causes downstream issues when components try to access `job.proof_approved_at`.

### Issue 2: Code Safely Handles Missing Field But Side Effects Occur

While the TypeScript code safely handles the missing field with:
```typescript
proof_approved_at: (job as any).proof_approved_at || null,
```

Multiple components depend on this field for logic decisions, which may cause unexpected behavior leading to crashes.

---

## Solution

### Step 1: Update Database Function to Include `proof_approved_at`

Create a migration to update the `get_user_accessible_jobs` function to include `proof_approved_at` in its return type.

**Migration SQL:**
```sql
-- Update get_user_accessible_jobs to include proof_approved_at
CREATE OR REPLACE FUNCTION public.get_user_accessible_jobs(
  p_user_id uuid DEFAULT NULL::uuid, 
  p_permission_type text DEFAULT 'work'::text, 
  p_status_filter text DEFAULT NULL::text, 
  p_stage_filter text DEFAULT NULL::text
)
RETURNS TABLE(
  job_id uuid,
  wo_no text,
  customer text,
  contact text,
  status text,
  due_date text,
  reference text,
  category_id uuid,
  category_name text,
  category_color text,
  current_stage_id uuid,
  current_stage_name text,
  current_stage_color text,
  current_stage_status text,
  user_can_view boolean,
  user_can_edit boolean,
  user_can_work boolean,
  user_can_manage boolean,
  workflow_progress numeric,
  total_stages integer,
  completed_stages integer,
  display_stage_name text,
  qty integer,
  started_by uuid,
  started_by_name text,
  proof_emailed_at timestamp with time zone,
  proof_approved_at timestamp with time zone  -- ADD THIS FIELD
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- ... existing function body with proof_approved_at added to SELECT
$$;
```

### Step 2: Verify the Current Function Implementation

Before creating the migration, I need to retrieve the full current function body to ensure we preserve all existing logic while adding the missing field.

---

## Files to Create/Modify

1. **New Migration File**: `supabase/migrations/YYYYMMDDHHMMSS_fix_accessible_jobs_proof_approved.sql`
   - Add `proof_approved_at` to the return type of `get_user_accessible_jobs`
   - Update the SELECT statement to include `pj.proof_approved_at`

---

## Technical Details

The `production_jobs` table already has the `proof_approved_at` column (confirmed via database query):
- Column: `proof_approved_at`  
- Type: `timestamp with time zone`

The fix simply requires updating the database function to include this column in its output.

---

## Immediate Workaround

If you need the app working immediately before the migration is applied, you can temporarily comment out the components/code that strictly depend on `proof_approved_at`, but this is not recommended as it would break proof tracking functionality.

---

## Next Steps

1. I'll create a migration that retrieves the current function body and updates it to include `proof_approved_at`
2. The migration will be applied to the database
3. After the fix, both Kanban and Setup pages should work correctly
