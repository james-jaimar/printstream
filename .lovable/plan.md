

# Fix: RPC Uses Single Paper for All Stages

## Problem
The SQL function `initialize_job_stages_with_multi_specs` extracts ONE paper key globally (line 58, `LIMIT 1`) and sets the same `v_paper_note` on every printing stage (line 160-161). For book jobs with Cover + Text (two different papers), both printing stages get the same paper note.

## What's Already Working
- The frontend (`p_consolidated_stages` JSON) already passes `paper_specification` per stage (e.g., "FBB 230gsm" for Cover, "Bond 070gsm" for Text)
- `SubSpecificationBadge` already reads `partAssignment` to pick cover vs text paper
- `useJobPaperSpecs` reads from notes to display paper — if notes are correct, display will be correct
- The `job_stage_instances` table already has `part_name` and `notes` columns

## Root Cause
Lines 56-62 of the RPC: `SELECT (jsonb_each(pj.paper_specifications)).key INTO v_paper_spec_raw_key ... LIMIT 1`
Line 160: `IF v_stage_group_id = v_printing_stage_group_id AND v_paper_spec_text IS NOT NULL THEN v_paper_note := 'Paper: ' || v_paper_spec_text;`

This sets the SAME paper note for all printing stages regardless of their part type.

## Fix — Single Migration (No Schema Changes)

Update the RPC function to read `paper_specification` from the per-stage consolidated data instead of the global lookup.

**Inside the stage loop** (after line 158), replace the paper note logic:

```sql
-- Instead of using global v_paper_spec_text for all printing stages,
-- read per-stage paper_specification from the consolidated stage data
v_paper_note := NULL;
IF v_stage_group_id = v_printing_stage_group_id THEN
  -- Try per-stage paper spec first (from consolidated stages payload)
  v_paper_note := v_stage_record->'specifications'->0->>'paper_specification';
  IF v_paper_note IS NOT NULL THEN
    v_paper_note := 'Paper: ' || v_paper_note;
  ELSIF v_paper_spec_text IS NOT NULL THEN
    -- Fallback to global paper spec (single-paper jobs)
    v_paper_note := 'Paper: ' || v_paper_spec_text;
  END IF;
END IF;
```

This way:
- Cover stage gets "Paper: FBB 230gsm" from its own `specifications[0].paper_specification`
- Text stage gets "Paper: Bond 070gsm" from its own `specifications[0].paper_specification`
- Single-paper jobs still work via the global fallback

The global STEP 1 extraction (lines 56-126) can remain as-is for the `job_print_specifications` save in STEP 4 and as fallback.

## Files Changed
1. **New SQL migration** — Update `initialize_job_stages_with_multi_specs` to read per-stage `paper_specification` from `p_consolidated_stages` instead of applying the global paper to all stages

No frontend changes needed. No schema changes needed.

