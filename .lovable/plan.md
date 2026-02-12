

# Fix Quantity Distribution, Production Time, and Frame Calculations

## Problem Summary

Three calculation issues in the layout optimizer:

1. **Quantity per slot is wrong**: When one item fills multiple slots (round-robin), each slot shows the TOTAL quantity instead of dividing it. E.g., item needs 3,000 labels across 4 slots -- each slot should be 750, not 3,000. This causes the diagram to show "S1 x3k" and "12,000 labels" instead of "S1 x750" and "3,000 labels".

2. **Production time formula is wrong**: Currently uses an arbitrary "10 seconds per frame" calculation. Should use real press speed: 25 metres/min with 20 min make ready (10 min if not changing material).

3. **Frame length not factored correctly**: The 960mm max frame length should be used to calculate repeating frame length and total run length from the dieline dimensions.

---

## Changes

### File: `src/utils/labels/layoutOptimizer.ts`

**Fix 1 -- Divide quantity across duplicated slots in `fillAllSlots`**

After assigning items round-robin, count how many slots each item occupies and divide `quantity_in_slot` by that count. A 3,000-qty item in 4 slots becomes 750 per slot.

```text
function fillAllSlots(itemSlots, totalSlots):
  // ... existing round-robin assignment ...
  
  // Count how many slots each item occupies
  slotCounts = count occurrences of each item_id
  
  // Divide quantity by slot count
  for each assignment:
    assignment.quantity_in_slot = ceil(assignment.quantity / slotCounts[item_id])
```

**Fix 2 -- Rewrite `calculateProductionTime` to use real press parameters**

Replace the current arbitrary formula with:
- Print time = total meters / 25 (m/min)
- Make ready = 20 min for first run, 10 min for subsequent runs (assuming same material)
- Total = make ready + print time

```text
function calculateProductionTime(runs):
  totalMeters = sum of run.meters
  printTimeMinutes = totalMeters / 25
  makeReadyMinutes = 20 + (max(0, runs.length - 1) * 10)
  return ceil(makeReadyMinutes + printTimeMinutes)
```

**Fix 3 -- Verify frame height calculation**

The existing `getSlotConfig` calculates `frameHeightMm` from the dieline. Ensure:
- Frame height = (label_height_mm x rows_around) + (vertical_gap_mm x (rows_around - 1)) + bleed
- If frame height exceeds 960mm, cap it (this is a dieline validation issue but we should guard against it)
- `framesPerMeter = 1000 / frameHeightMm` (use exact division, not floor, for accuracy)
- Total meters for a run = frames x frameHeightMm / 1000

### File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`

No structural changes needed -- the diagram already reads `quantity_in_slot` from the assignments. Once the optimizer produces correct per-slot quantities (750 instead of 3000), the diagram will automatically show the right values ("S1 x750" and correct total labels).

