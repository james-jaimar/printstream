
## Fix: Expand Column Slots to Full Grid for VPS Imposition

### The Problem
The AI layout optimizer assigns slots by **column** (0, 1, 2, 3 for a 4-across dieline). But the VPS imposition engine expects a slot assignment for **every grid position** (4 across x 3 around = 12 slots). Since we only send 4 slots, the VPS only places 4 labels instead of the full 12.

### The Fix
Expand column-based slots into full grid slots in the **Edge Function** before sending to VPS. This is the right place because:
- The dieline config (columns_across, rows_around) is already available
- It keeps the optimizer's clean column-based model intact
- The DB continues storing the simpler 4-slot format

### Slot Expansion Logic

```text
Column slots (stored in DB):  [0, 1, 2, 3]
                                     |
              Expand for rows_around = 3
                                     |
Grid slots (sent to VPS):     [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

Mapping:
  Column 0 -> Grid slots 0, 4, 8   (row 0, 1, 2)
  Column 1 -> Grid slots 1, 5, 9
  Column 2 -> Grid slots 2, 6, 10
  Column 3 -> Grid slots 3, 7, 11

Formula: grid_slot = (row * columns_across) + column
```

### Changes

#### 1. Edge Function: `supabase/functions/label-impose/index.ts`

Before building `slotsWithRotation`, expand the slot assignments:

```typescript
// Expand column-based slots to fill all grid positions (columns x rows)
const columnsAcross = imposeRequest.dieline.columns_across;
const rowsAround = imposeRequest.dieline.rows_around;
const expandedSlots: SlotAssignment[] = [];

for (const slot of imposeRequest.slot_assignments) {
  // slot.slot is the column index (0..columns_across-1)
  for (let row = 0; row < rowsAround; row++) {
    expandedSlots.push({
      ...slot,
      slot: (row * columnsAcross) + slot.slot, // grid position
    });
  }
}
```

Then use `expandedSlots` instead of `imposeRequest.slot_assignments` when building the VPS payload.

This means:
- Run 1 (4 across x 3 around): sends 12 slots to VPS instead of 4
- Each label appears in every row of its column
- The full page is always filled, matching the dieline template

#### 2. No Other Changes Needed
- The DB slot_assignments stay as column-based (0-3) -- this is cleaner for the optimizer
- The `useBatchImpose` hook stays the same
- The copies calculation in the Print Files section remains correct (it uses `quantity_in_slot / columns_across` which already accounts for column-based slots)
- The `RunLayoutDiagram` already visualizes the full grid correctly

### After Deploying
The existing runs will need to be re-imposed to get corrected PDFs. The edge function change only affects future impositions.
