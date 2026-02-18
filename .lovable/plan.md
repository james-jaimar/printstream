

## Fix: 11 Labels Instead of 12 — VPS Uses 1-Based Slot Numbering

### Root Cause

The edge function sends 12 slots numbered **0 through 11** to the VPS. The VPS uses **1-based** slot numbering (slots 1-12), so:
- Slot 0 is ignored (invalid/out-of-range for the VPS)
- Slots 1-11 render fine (11 labels)
- The 12th label is never placed

This is why the bottom-right corner is always empty -- that would be slot 12 in VPS terms, but we never send it.

### Fix

**File: `supabase/functions/label-impose/index.ts` (line 123)**

Add `+1` to convert from 0-based to 1-based slot numbering when expanding:

```typescript
// Before (0-based):
slot: (row * columnsAcross) + slot.slot,

// After (1-based for VPS):
slot: (row * columnsAcross) + slot.slot + 1,
```

This produces slots 1-12 instead of 0-11. All 12 labels will now render.

### Verification

For 4 columns, 3 rows:
- Row 0: slots 1, 2, 3, 4
- Row 1: slots 5, 6, 7, 8
- Row 2: slots 9, 10, 11, 12

12 slots, all valid in 1-based VPS addressing.
