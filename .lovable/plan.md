
# Dieline Finder Tool

## What It Does

A popover/modal accessible from the Dieline Library page header that lets users input a width and height, then instantly shows the nearest 3-4 matching dielines within 5mm of each dimension. It also considers rotated matches (e.g. searching 70x100 will match a 100x70 dieline).

## User Experience

- A "Find Dieline" button (with a search/target icon) sits next to the "New Dieline" button in the page header
- Clicking it opens a popover with two number inputs: Width (mm) and Height (mm)
- As the user types, results update live (debounced) showing up to 4 nearest matches
- Each result shows: die number, name, size, across x around, and how close the match is (e.g. "exact match" or "rotated, +2mm width")
- Clicking a result could scroll/highlight it in the list, or simply serve as a reference

## Matching Logic

For each active dieline, calculate fit against the search dimensions:
1. **Direct match**: compare `|dieline.width - searchW|` and `|dieline.height - searchH|`
2. **Rotated match**: compare `|dieline.width - searchH|` and `|dieline.height - searchW|`
3. Take whichever orientation gives the smaller total deviation
4. Filter to only results where both dimension differences are within 5mm
5. Sort by total deviation (smallest first), return top 4

## Technical Details

### New file: `src/components/labels/dielines/DielineFinder.tsx`

A component containing:
- A `Popover` (using the existing Radix popover) triggered by a button
- Two `Input` fields for width and height (type="number")
- A results list computed via `useMemo` from the dielines data passed as a prop
- Matching algorithm that checks both orientations, filters within 5mm tolerance, sorts by closeness
- Each result row displays: die_no, name, size, layout, and a label indicating "Exact", "Close match", or "Rotated" 

### Modified: `src/pages/labels/LabelsDielines.tsx`

- Import and render `DielineFinder` in the header area, passing `activeDielines` as a prop
- Placed next to the "New Dieline" button
