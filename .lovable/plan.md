
# Balance Slot Quantities and Show Per-Run Print Qty

## Problem 1: Unbalanced slot quantities in ganged runs
When items are ganged into a single run, each slot may have very different quantities (e.g., 2000 vs 1500). The run prints for the longest slot, meaning the 1500-qty slot actually prints 2000 labels -- 500 are wasted. The optimizer should group items with similar quantities together, and split quantities to balance slots within ~10%.

## Problem 2: No per-run print quantity visible
In compact mode (the 3-column grid), there are no stats shown -- the admin can't see how many labels each run will actually produce. The tooltip shows per-slot quantity, but there's no at-a-glance total.

---

## Changes

### 1. Balance slot quantities in the optimizer (`src/utils/labels/layoutOptimizer.ts`)

**Ganged strategy**: After assigning items to slots, check if quantities are within 10% of each other. If not, split the higher-quantity items so that all slots in the run are balanced. For example, if items have quantities 2000 and 1500 across 4 slots, instead of running 2000 frames and wasting on the 1500-qty slots, split into:
- Run A: all items at ~1500 each (balanced)
- Run B: the remaining ~500 for the item that needed 2000

**Optimized strategy**: When selecting items to gang, prefer items with similar remaining quantities. Sort candidates and group those within 10% of each other into the same run.

**Individual strategy**: For single-item runs, all slots have the same item so they're inherently balanced -- no change needed.

### 2. Add per-run print quantity to the diagram (`src/components/labels/optimizer/RunLayoutDiagram.tsx`)

**Compact mode enhancement**: Add a small header/footer line in compact mode showing:
- Run number
- Total print quantity (sum of all slot quantities, or the actual print output based on frames x labels per frame)

This will show something like "Run 1 -- 6,000 labels" beneath or above the diagram in compact view, giving admins an at-a-glance count.

**Non-compact mode**: Already shows meters and frames in the header -- add a "labels" count there too.

---

## Technical Details

### File: `src/utils/labels/layoutOptimizer.ts`

- Add a `balanceSlotQuantities` helper that takes slot assignments and splits runs if max/min ratio exceeds 1.10 (10% threshold)
- Update `createGangedRun` to call the balancer, returning multiple runs if needed
- Update `createOptimizedRuns` to group items by similar quantity (within 10%) before ganging
- The balancing logic: find the minimum slot quantity in a ganged run. Cap all slots at that minimum for Run A, then create Run B with the remainders, recursively balancing if needed

### File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`

- Calculate `totalPrintQty` from slot assignments: sum of `quantity_in_slot` across all unique items, or `frames * labelsPerFrame` for actual output
- In compact mode, add a small label below the roll width showing "Run N -- X,XXX labels"
- In non-compact mode, add the label count to the existing stats row in the header

### Balancing algorithm pseudocode
```text
function balanceRuns(items, slots, config):
  assign items to slots (round-robin fill)
  minQty = min(slot quantities)
  maxQty = max(slot quantities)
  
  if maxQty / minQty <= 1.10:
    return [single run]  -- already balanced
  
  // Cap all slots at minQty for Run A
  runA = slots with qty capped at minQty
  
  // Remainders go to Run B
  remainders = items where original qty - minQty > 0
  runB = balanceRuns(remainders, slots, config)  -- recursive
  
  return [runA, ...runB]
```
