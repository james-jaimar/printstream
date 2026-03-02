

# Fix: DTP Modal Not Updating Immediately After Actions

## Problem

When operators click "Start DTP Work", "Complete DTP Work", or perform proof actions in the DTP modal, the UI doesn't reflect the change immediately. They have to close and reopen the modal to see the updated status. This is because the modal relies on the parent component to refetch the entire job list and pass updated props back down -- which is slow and creates a race condition.

## Root Cause

The `useDtpJobModal` hook loads stage instance data from the database when the modal opens, but after an action (start/complete), it only calls `onRefresh()` on the parent. The parent refetches jobs asynchronously, but the modal's local `stageInstance` state remains stale until the parent re-renders with new data AND the `job.current_stage_status` prop actually changes (which may not happen if the parent hasn't finished fetching).

## Fix

### 1. Expose `loadModalData` to action components and call it after every action

**File: `src/components/tracker/factory/dtp/DtpJobModal.tsx`**

Pass `loadModalData` (or a wrapper that calls both `loadModalData` and `onRefresh`) down to `DtpStageActions` and `ProofStageActions` as a new `onReloadModal` prop.

### 2. Call `onReloadModal` after successful actions in DtpStageActions

**File: `src/components/tracker/factory/dtp/DtpStageActions.tsx`**

After `handleStartDTP` succeeds (toast shown), call `onReloadModal()` to immediately re-query the stage instance from the database. This updates `stageInstance.status` from `'pending'` to `'active'` so the button changes from "Start DTP Work" to "Complete DTP Work" without closing the modal.

Same for `handleCompleteDTP` -- though this already calls `onClose()`, adding `onReloadModal` before close ensures consistency.

### 3. Call `onReloadModal` after successful actions in ProofStageActions

**File: `src/components/tracker/factory/dtp/ProofStageActions.tsx`**

After `handleStartProof`, `handleProofEmailed`, `handleManualEmailSent`, `handleMarkAsNeedingChanges`, and other actions, call `onReloadModal()` in addition to `onRefresh()`. Some of these already update local state via `setStageInstance()` which is good, but adding `onReloadModal` ensures the full stage instance (including fields like `status`) is reloaded from the database.

### 4. Keep `onRefresh` for parent list updates

`onRefresh` continues to be called so the parent kanban board updates too. The difference is the modal now ALSO reloads its own data independently, so the user sees the change instantly inside the modal.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/tracker/factory/dtp/DtpJobModal.tsx` | Pass `loadModalData` as `onReloadModal` prop to DtpStageActions and ProofStageActions |
| `src/components/tracker/factory/dtp/DtpStageActions.tsx` | Add `onReloadModal` prop, call it after successful start/complete |
| `src/components/tracker/factory/dtp/ProofStageActions.tsx` | Add `onReloadModal` prop, call it after successful actions |

## Expected Result

After clicking "Start DTP Work", the button immediately changes to "Complete DTP Work" and the status badge updates -- no need to close and reopen the modal.

