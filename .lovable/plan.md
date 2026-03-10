

# Fix "Mine" Toggle — Track Who Approved the Proof

## Root Cause

The "Mine" toggle **works correctly** — the problem is upstream. When a DTP operator clicks "Approve Proof" in `ProofStageActions.tsx`, the code sets `proof_approved_manually_at` but **never sets `completed_by` or `started_by`**. So 9 of 24 jobs have zero worker association. No operator can claim them via "Mine."

Data breakdown:
- 24 total auto-approved jobs
- 15 have worker IDs (split across operators)
- **9 have NULL for all worker fields** — invisible to every operator's "Mine" view

## Fix

### 1. `src/components/tracker/factory/dtp/ProofStageActions.tsx`
When setting `proof_approved_manually_at`, also set `started_by` and/or `completed_by` to the current user's ID (if not already set). This ensures every manually-approved job has an operator trail.

```typescript
// Line ~424-430: Add current user tracking
.update({
  proof_approved_manually_at: currentTime,
  updated_at: currentTime,
  started_by: stageInstance.started_by || user?.id || null,  // preserve if already set
  completed_by: user?.id || null  // person who approved = completed the proof stage
})
```

### 2. `src/hooks/tracker/useAutoApprovedJobs.ts`
Add `approved_by` field to the interface (the `completed_by` from the proof stage). This is the person who clicked "Approve." Display this as "Approved by: Name" alongside "Last worked on by: Name" — or merge them if they're the same person.

### 3. Both UI components (`AutoApprovedPrintQueueList.tsx`, `AutoApprovedPrintQueueColumn.tsx`)
Show "Approved by: [Name]" on each card so operators can see who approved it at a glance.

This fix is both **retroactive-safe** (new approvals will track the user) and **forward-looking** (the "Mine" toggle will correctly filter). The 9 existing orphaned jobs will remain unassigned until someone acts on them — but all future approvals will be properly attributed.

