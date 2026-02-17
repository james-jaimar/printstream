

## Fix: Bulletproof the Batch Loop + Add Real-Time Diagnostics

### What the Database Shows

The VPS is healthy (your diagnostic proves it). Looking at LBL-2026-0003's 9 runs:

- **Runs 6, 7**: Successfully imposed (VPS worked perfectly)
- **Run 6**: Has `[IMPO ERROR]` in notes BUT `status: approved` with a valid PDF -- this is the race condition where the client gave up but the VPS actually succeeded (now fixed by the 503 retry changes)
- **Runs 1-5, 8-9**: Still `planned`, last touched at 15:10-15:22 -- the latest batch at 18:05 only attempted runs 3, 6, 7 then **stopped**

### Root Cause: The Loop is Dying Silently

The batch loop processes runs sequentially. When a run fails, the `try/catch` inside the loop handles it and moves on. **But** if an error occurs between runs (e.g., during the delay, or in state updates), there's no outer catch -- the entire `impose()` async function rejects silently, and the remaining runs are never attempted.

### Changes

#### 1. Wrap the Entire Batch Loop in a Top-Level Try/Catch (`src/hooks/labels/useBatchImpose.ts`)

Add an outer try/catch around the entire `for` loop so that if the loop itself crashes (not just an individual run), the error is logged and the final progress state is set correctly. Currently if the loop dies mid-way, `setProgress` for the final state is never called and `isImposing` stays true forever.

#### 2. Log the Exact Error that Kills the Batch

Add `console.error("[BatchImpose] BATCH LOOP CRASHED:", e)` in the outer catch block. This is the missing diagnostic -- right now if the loop crashes, there is zero visibility.

#### 3. Add Per-Run Logging BEFORE the Try Block

Move the `console.log` for "=== Run X ===" to BEFORE the try block, and add a log AFTER the try/catch. This way you can see exactly which run the loop was on when it died, even if the error happens outside the try.

#### 4. Guard Against Stale `items` Array

When building `slotAssignments`, if `items.find(it => it.id === slot.item_id)` returns undefined, `pdf_url` becomes empty string `''`. The VPS may handle this gracefully or may crash. Add a guard: if any slot has an empty `pdf_url`, skip that run with a clear error message rather than sending a broken request to the VPS.

### Technical Summary

| File | Change |
|------|--------|
| `src/hooks/labels/useBatchImpose.ts` | Outer try/catch around entire loop; guard against empty pdf_url in slots; enhanced logging around each run |

### What You Need To Do After This

1. Click "Reprocess All" on LBL-2026-0003
2. Open browser DevTools console (F12)
3. Watch for `[BatchImpose]` logs -- you will see EXACTLY which run it stops at and why
4. Share those console logs so we can see the precise failure point
