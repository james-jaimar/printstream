

# Fix Make-Ready Time: Per Order, Not Per Run

## The Issue

The current `calculateProductionTime` function treats each run within an order as needing its own make-ready time (20 min for the first run + 10 min for each additional run). In reality:

- All runs within a single order share **one** 20-minute setup
- The 10-minute setup only applies when switching to a **different order** on the same substrate

So for this order with 9 runs, the current code calculates: 20 + (8 x 10) = **100 minutes** of make-ready. It should be just **20 minutes**.

## Change

### File: `src/utils/labels/layoutOptimizer.ts` -- `calculateProductionTime`

Simplify to use a single make-ready per order (the function is always called with runs from one order):

```
function calculateProductionTime(runs):
  totalMeters = sum of run.meters
  printTimeMinutes = totalMeters / 25
  makeReadyMinutes = 20   // single setup for the entire order
  return ceil(makeReadyMinutes + printTimeMinutes)
```

The 10-minute subsequent setup is an inter-order concern (scheduling/planning level), not relevant within a single order's production time estimate.

### File: `src/hooks/labels/useLayoutOptimizer.ts` -- `applyLayout`

Currently calls `calculateProductionTime([run])` for each individual run when saving to the database (line 158). This should pass **all runs** so the make-ready is allocated once across the order, not once per run. Change to calculate the total once and divide proportionally, or simply assign the per-run print time without make-ready and store the total order time separately.

**Approach**: Store per-run duration as just the print time (meters / 25), and let the order-level summary include the 20-min make-ready. This keeps individual run estimates accurate for scheduling.

## Expected Result

For 9 runs totaling ~700m:
- Print time: 700 / 25 = **28 minutes**
- Make-ready: **20 minutes** (once)
- Total: **~48 minutes** (instead of the current ~128 minutes)
