

# Roll-Aware AI Layout Optimizer

## The Problem

When a run produces a small quantity per slot (e.g., Run 5 with 140 labels across 5 slots = 700 total), the finishing department gets 5 short rolls. They must manually rewind, join, count, and cut these into the customer's requested roll size (e.g., 500 per roll). This is extremely labor-intensive.

The AI layout optimizer currently has no awareness of `qty_per_roll` -- the customer's requested labels-per-output-roll. This value exists in the database (`label_orders.qty_per_roll`) but is buried in the "Output & Delivery Specs" section and is never considered during layout generation.

## The Solution

Make `qty_per_roll` a first-class input to the layout optimizer. The system will:

1. **Flag problematic runs** where labels-per-slot is below `qty_per_roll` (meaning manual rewinding is required)
2. **Suggest consolidation** -- absorb short runs into longer ones by slightly increasing other runs' quantities
3. **Show the finishing impact** visually on each run diagram

## Changes

### 1. Promote "Qty per Roll" into the Layout Optimizer UI

**File: `src/components/labels/LayoutOptimizer.tsx`**

- Accept new prop `qtyPerRoll: number | null`
- Display the current `qty_per_roll` prominently at the top alongside the "items / slots" badge
- If `qty_per_roll` is not set, show a warning: "Set Qty per Roll in specs to enable roll-aware optimization"
- Pass `qtyPerRoll` down to the optimizer hook and to `RunLayoutDiagram`

**File: `src/components/labels/order/LabelOrderModal.tsx`**

- Pass `order.qty_per_roll` to `LayoutOptimizer`

### 2. Add Roll-Awareness to the Layout Engine

**File: `src/utils/labels/layoutOptimizer.ts`**

- Add `qtyPerRoll?: number` to `LayoutInput` interface
- Add a new **post-processing step** after each strategy generates runs: `consolidateShortRuns(runs, config, qtyPerRoll)`
- This function:
  - For each run, calculates labels-per-output-roll = `slot_quantity / 1` (each slot = one output roll)
  - Identifies "short runs" where any slot's quantity is below `qtyPerRoll`
  - Attempts to redistribute the short run's items into other runs that contain the same items (increasing their slot quantity)
  - If redistribution succeeds (the short run is absorbed), remove it
  - If not possible (unique items in the short run), keep it but flag it
- Add per-run metadata: `labels_per_output_roll` and `needs_rewinding: boolean`

**File: `src/types/labels.ts`**

- Extend `ProposedRun` with optional fields:
  - `labels_per_output_roll?: number` -- how many labels each output roll will have
  - `needs_rewinding?: boolean` -- true if below qty_per_roll threshold
  - `consolidation_suggestion?: string` -- AI tip like "Add 300 to Run 1 to eliminate this run"

### 3. Show Finishing Impact on Run Diagrams

**File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`**

- Accept new optional props: `qtyPerRoll?: number`, `needsRewinding?: boolean`
- When `needsRewinding` is true, show a red/amber warning badge on the run card: "Short rolls -- manual rewind required"
- Show "labels/roll" stat alongside existing meters/frames stats
- Color-code: green if labels/roll >= qty_per_roll, red if below

### 4. Generate Consolidation Suggestions (Strategy 4)

**File: `src/utils/labels/layoutOptimizer.ts`**

- After generating the three existing strategies (ganged, individual, optimized), add a fourth: **"Roll-Optimized"**
- This strategy starts from the optimized layout and then:
  1. Identifies runs where per-slot quantity < qty_per_roll
  2. For each short run, checks if its items exist in other runs
  3. If yes, merges the short run's quantity into those other runs and removes the short run
  4. If a short run has unique items not in any other run, keeps it but notes the issue
- This produces a layout with fewer runs but potentially more overprint on the longer runs
- The reasoning will explain: "Consolidated Run 5 (700 labels) into Run 1 -- eliminates 5 short rolls requiring manual rewind"

### 5. Score Roll-Awareness in Labor Efficiency

**File: `src/utils/labels/layoutOptimizer.ts`**

- Update `createLayoutOption` to factor rewinding labor into `labor_efficiency_score`
- If any run needs rewinding (labels/slot < qty_per_roll), penalize labor score proportionally
- This means the roll-optimized layout will naturally score higher when qty_per_roll is set

### 6. Update the Hook to Pass qty_per_roll

**File: `src/hooks/labels/useLayoutOptimizer.ts`**

- Accept `qtyPerRoll?: number | null` in `UseLayoutOptimizerProps`
- Pass it to `generateOptions()` as part of the `LayoutInput`

## Summary of File Changes

| File | Change |
|------|--------|
| `src/types/labels.ts` | Extend `ProposedRun` with roll metadata fields |
| `src/utils/labels/layoutOptimizer.ts` | Add `qtyPerRoll` to `LayoutInput`, add consolidation logic, add "roll-optimized" strategy, update labor scoring |
| `src/hooks/labels/useLayoutOptimizer.ts` | Accept and pass through `qtyPerRoll` |
| `src/components/labels/LayoutOptimizer.tsx` | Accept `qtyPerRoll` prop, display it, pass to hook and diagrams |
| `src/components/labels/order/LabelOrderModal.tsx` | Pass `order.qty_per_roll` to `LayoutOptimizer` |
| `src/components/labels/optimizer/RunLayoutDiagram.tsx` | Show labels/roll stat, rewinding warning badge |

