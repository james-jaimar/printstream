

# Complete Solver Rewrite: Proper Constrained Optimization

## What's Wrong Now

The current solver has two fundamentally broken strategies:

1. **Greedy bin-packing** — places one item per slot, leaves blanks everywhere because items with different quantities can't share runs
2. **Fill-first** — picks an anchor and tries to find compatible items, but the "compatible range" logic fails when no existing item naturally fits, producing the blank-heavy layouts in your screenshot

Both approaches think "item-first" — they take an item and try to find a run for it. The correct approach is **"run-first"** — decide what each run should look like, then distribute item quantities to fill it.

## The Right Algorithm

### Core insight

A run's frame count determines the "band" of valid slot quantities:
- `actual = frames * lpf`  
- Valid slot qty range: `[actual - maxOverrun, actual]`

So the algorithm should:
1. Figure out what "bands" are needed to cover all quantities
2. Split items into portions that fit those bands
3. Fill runs completely (all slots) with portions from the same band

### Algorithm: Band-Based Grouping

```text
INPUT: items[], totalSlots, lpf, maxOverrun

STEP 1: Compute all possible "bands"
  For each possible frame count F (from min to max needed):
    band = { min: F*lpf - maxOverrun, max: F*lpf, frames: F }
  
STEP 2: Assign each item's quantity to the best band
  - Item qty fits band if qty >= band.min AND qty <= band.max
  - If item is too large for any single band, split it into 
    portions that DO fit a band
  - Choose bands that minimize the number of distinct bands used
    (fewer bands = fewer runs)

STEP 3: Build runs
  - Each band produces ceil(portions_in_band / totalSlots) runs
  - All slots in each run are filled from that band's portions
  - Last run of a band may have blanks (acceptable)

STEP 4: Optimize
  - Try multiple band assignments (e.g., split large items 
    into 2, 3, or totalSlots portions)
  - Score each candidate layout
  - Return best
```

### Example with the failing data

Items: A=5300, B=2000, C=1400, D=700, E=300. 4 slots, lpf=18, maxOverrun=250.

**Band computation:**
- For qty 5300: frames=295, actual=5310, band=[5060, 5310]
- For qty 2000: frames=112, actual=2016, band=[1766, 2016]
- For qty 1400: frames=78, actual=1404, band=[1154, 1404]
- For qty 700: frames=39, actual=702, band=[452, 702]
- For qty 300: frames=17, actual=306, band=[56, 306]

Items A, B, C, D, E are all in different bands → 5 runs with 1 slot each (bad).

**Now try splitting:**
- Split A=5300 into 4×1325. Band for 1325: frames=74, actual=1332, band=[1082, 1332]. 
  - C=1400 doesn't fit [1082,1332]. But split C=1400 into 2×700. 
  - 700 fits band [452, 702] with D=700. 
  - Now: 4×1325 (band ~1332) + B=2000 + 2×700+D=700 (band ~702) + E=300
  - Band [1082,1332]: 4 portions → 1 run, all 4 slots filled ✓
  - B=2000: split into 3×667. Band for 667: [452, 702]. Compatible with 700!
  - Band [452, 702]: 2×700 + 3×667 + E=300... E=300 fits [452,702]? No, 300 < 452.
  - So E=300 needs its own band [56, 306].

**Better split strategy:**
- Split A=5300 into 4×1325 → 1 run (4 slots filled)
- Split B=2000 into 4×500 → band for 500: [452, 702]. D=700 fits! C split into 2×700 fits!
  - 4×500 + 2×700 + 700 = 7 portions in band [452, 702] → 2 runs (4+3 slots)
  - E=300: fits [452,702]? 702-300=402 > 250. No.
  - E=300 → own run, 1 slot + 3 blanks (last run)

Result: 4 runs total. Only the last has blanks. Much better than 7 runs.

### Key functions to implement

```text
computeBand(qty, lpf, maxOverrun) → { min, max, frames, actual }

findBestSplit(item, targetBandMax, lpf) → portions[]
  // Split item.qty into N portions where each fits a target band

assignToBands(portions[], lpf, maxOverrun) → Map<bandKey, portions[]>
  // Group portions into compatible bands

buildRunsFromBands(bandMap, totalSlots) → Run[]
  // Convert band groups into runs of exactly totalSlots

generateCandidates(items, totalSlots, lpf, maxOverrun, qtyPerRoll) → ScoredLayout[]
  // Try multiple splitting strategies, score each, return all

scoreLayout(runs, ...) → number
  // Same scoring as now but with proper blank penalty
```

### Candidate generation strategies

1. **No split** — each item as-is, greedy assign to bands
2. **Split largest to fill slots** — split the largest item into `totalSlots` portions, try to merge bands
3. **Split all to median** — split all items to portions near the median quantity
4. **Split to match neighbours** — for each item, try splitting to match the nearest item's band
5. **qtyPerRoll rounding** — round up to clean multiples, then apply strategies 1-4

Each produces a valid layout (guaranteed by band math). Scoring picks the best.

## File Changes

### `supabase/functions/label-optimize/index.ts` — Full rewrite

- **Remove**: `greedySolve()`, `solveFullSlots()`, all the current strategy code
- **Add**: `computeBand()`, `assignToBands()`, `buildRunsFromBands()`, `generateCandidates()`
- **Keep**: `canAddToRun()` (used for validation), `validateLayout()`, `scoreLayout()` (updated penalties), `formatSolverOutput()`, HTTP handler, types, CORS
- **Scoring update**: blank slots on non-last runs: penalty 10000 (effectively impossible since band-based approach fills all slots by construction)

### No other files change

The output shape (`SolverLayout` with `runs[].slot_assignments[]`) is identical. The hook and UI work as-is.

## Why This Works

The band-based approach guarantees full slots because:
- Every portion in a band is compatible by construction (`actual - qty ≤ maxOverrun`)
- Runs are filled sequentially from band portions — no "hoping" an item fits
- Splitting is done *before* run assignment, so portions are sized to fit
- Blanks only occur when a band has fewer portions than `totalSlots` (last run of that band)

