

## Add Placeholder Items for Pre-Artwork Quoting

### Overview

Account execs need to plan production runs and get quotes *before* artwork is available. This feature adds the ability to create "placeholder" label items -- items with just a name and quantity, no artwork -- that can be used with the AI Layout optimizer to estimate runs, meters, and costs. When artwork arrives later, it gets uploaded into those same placeholders.

### What Changes

**1. Add "Add Placeholders" button to the Label Items section**

In `src/components/labels/order/LabelOrderModal.tsx`:
- Add an "Add Placeholders" button (using the existing `AddLabelItemDialog`) next to the "Label Items" heading
- The `AddLabelItemDialog` already creates items without artwork -- it just needs to be surfaced more prominently in the order modal

**2. Update AI Layout eligibility to include placeholder items**

In `src/components/labels/order/LabelOrderModal.tsx`:
- Change `layoutEligibleItems` filter to include items that have *no artwork at all* (placeholders), in addition to items with artwork
- Continue excluding multi-page parent items as before

In `src/components/labels/LayoutOptimizer.tsx`:
- Update `artworkReadiness` logic so that placeholder items (no artwork) are treated as valid for layout *generation* but block layout *apply* (can't create production runs without artwork)
- Show a clear message: "X items are placeholders -- upload artwork before applying this layout to production"

**3. Show placeholder items in the items grid**

In `src/components/labels/items/LabelItemsGrid.tsx` and `LabelItemCard.tsx`:
- Placeholder items (no proof, no print, no artwork URLs) should display with a dashed border and a placeholder icon instead of a thumbnail
- Show item name and quantity prominently
- Show a subtle "Awaiting Artwork" badge

**4. Allow artwork upload into existing placeholder items**

In `src/components/labels/order/LabelOrderModal.tsx`:
- When artwork PDFs are uploaded via the `DualArtworkUploadZone`, check if any existing placeholder items match by name (using the existing filename-matching logic)
- If matches are found, update those items with the artwork rather than creating new items
- If no match, create new items as normal (existing behaviour)

### Technical Details

| File | Change |
|---|---|
| `src/components/labels/order/LabelOrderModal.tsx` | Add "Add Placeholders" button; update `layoutEligibleItems` to include items without artwork; add matching logic for uploads into placeholders |
| `src/components/labels/LayoutOptimizer.tsx` | Allow placeholder items for generation; block apply if placeholders remain; show warning |
| `src/components/labels/items/LabelItemCard.tsx` | Render placeholder state (dashed border, icon, "Awaiting Artwork" badge) for items without any artwork URLs |
| `src/components/labels/items/LabelItemsGrid.tsx` | Ensure placeholder items appear in both proof and print tabs |
| `src/components/labels/AddLabelItemDialog.tsx` | Minor: update description text to mention "placeholder" for quoting; optionally allow adding multiple placeholders at once |

### User Flow

1. Account exec creates a new order (quote status) with dieline and substrate
2. Clicks "Add Placeholders" in the Label Items section
3. Enters item names and quantities (e.g., "Vanilla 500ml" x 3000, "Chocolate 500ml" x 2000)
4. Placeholder cards appear with dashed borders and "Awaiting Artwork" badges
5. Clicks "AI Layout" -- optimizer runs using quantities and dieline math, generates run options
6. Account exec reviews runs, meters, waste estimates -- quotes the job
7. Later, when artwork arrives, uploads PDFs via the upload zone
8. System matches filenames to placeholder items and fills them in
9. Normal production flow continues (preflight, proofing, print-ready, apply layout)

