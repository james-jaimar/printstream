

# Fix: Schedule Board Crash (React Error #301)

## Root Cause
In `MultiShiftGroupingDialog.tsx` (lines 75-93), `setOrderedGroups()` is called inside a `useMemo`. This triggers a state update during render, which React forbids (error #301: "Cannot update a component while rendering a different component").

```typescript
// THE BUG — setState inside useMemo
useMemo(() => {
  // ... build groups ...
  setOrderedGroups(groups);  // ← state update during render!
}, [hp12000Stages]);
```

Even though the dialog starts closed (`open={false}`), React still renders the component tree — `MultiShiftGroupingDialog` is always mounted in `ScheduleBoard.tsx` line 286, so this code runs on every schedule page load.

## Fix
Replace the `useMemo` + `setOrderedGroups` pattern with a `useEffect`, which runs *after* render and is the correct place for state updates derived from other state:

**File: `src/components/schedule/dialogs/MultiShiftGroupingDialog.tsx`**
- Change lines 75-93 from `useMemo(() => { ... setOrderedGroups(groups); }, [hp12000Stages])` to `useEffect(() => { ... setOrderedGroups(groups); }, [hp12000Stages])`

That single change fixes the crash. No other files need modification.

