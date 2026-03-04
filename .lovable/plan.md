

# Fix: Paper Specification Notes Not Saved on Printing Stages

## Investigation Summary

The RPC function `initialize_job_stages_with_multi_specs` is **correct** — it reads `paper_specification` from each stage's consolidated data and writes it to `notes`. The problem is **upstream in the frontend**: the `paperSpecification` field is not reliably reaching the RPC.

## Root Cause

The data flows through multiple layers with **mismatched type signatures** that, while not stripping properties at runtime in TypeScript, indicate the property was never intended to flow through certain paths:

1. **`PaginatedJobCreationDialog`** correctly extracts `paperSpecification` and `partType` from row mappings (lines 329-330)
2. **`onSingleJobConfirm` prop type** (line 25) only declares `{groupName, mappedStageId, mappedStageName, category}` — missing `paperSpecification`, `partType`, `quantity`
3. **`handleSingleJobConfirm`** in both `ExcelUpload.tsx` (line 304) and `QuickEasySyncPanel.tsx` (line 215) has the same narrow type
4. **`finalizeProductionReadyJobs`** in `enhancedParser.ts` (line 571) has the same narrow type
5. **`finalizeJobs`** in `enhancedJobCreator.ts` (line 125) has the same narrow type
6. **`finalizeIndividualJob`** (line 355) and **`processIndividualJobInDatabase`** (line 400) — same narrow type

While TypeScript types don't strip properties at runtime, a code change anywhere in this chain that destructures or reconstructs the objects would lose the extra properties. The consistent NULL notes across all recent jobs (since ~Feb 2026) confirms the data is being lost.

## Evidence
- **Last working job**: D430124 (Jan 31, 2026) — has `notes: "Paper: 160gsm El Toro"`
- **All recent book jobs** (D430895–D430908): Cover/Text stages exist with correct `part_name`, but `notes` is NULL
- The RPC is verified correct — it reads per-stage `paper_specification` from consolidated stages JSON

## Fix — Widen Type Signatures Across the Chain

Update all intermediate type annotations to include `paperSpecification`, `partType`, and `quantity` so the data flows explicitly through every layer:

### Files to Change

1. **`src/components/admin/upload/PaginatedJobCreationDialog.tsx`** (line 25)
   - Widen `onSingleJobConfirm` prop type to include `paperSpecification?`, `partType?`, `quantity?`

2. **`src/components/tracker/ExcelUpload.tsx`** (line 304)
   - Widen `handleSingleJobConfirm` parameter type

3. **`src/components/tracker/QuickEasySyncPanel.tsx`** (line 215)
   - Widen `handleSingleJobConfirm` parameter type

4. **`src/utils/excel/enhancedParser.ts`** (line 571)
   - Widen `finalizeProductionReadyJobs` parameter type

5. **`src/utils/excel/enhancedJobCreator.ts`** (lines 125, 355, 400)
   - Widen `finalizeJobs`, `finalizeIndividualJob`, `processIndividualJobInDatabase` parameter types
   - Remove `(m as any)` casts at line 458 since the type will now include `paperSpecification`

### No DB changes. No RPC changes. No new migrations.

The fix is purely widening TypeScript type annotations so the `paperSpecification` and `partType` fields that the dialog already correctly extracts are explicitly carried through to `initializeJobWorkflowFromMappings`, where they're already correctly consumed and passed to the RPC.

