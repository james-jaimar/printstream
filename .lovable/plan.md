

# Fix: Bleed Detection Bug + Print-Ready Artwork Matching

## Issue 1: "No Bleed" Badge Shown Incorrectly

**Root Cause Found:** In `src/components/labels/items/LabelItemsGrid.tsx`, the `getValidationStatus` function has a logic ordering bug.

The DB for this order shows the VPS correctly identified TrimBox (100x50mm) and set `preflight_report.has_bleed = true` with `preflight_status = 'passed'`. However, the report also contains a rotation warning: `"Artwork is rotated 90deg -- will be auto-rotated for production"`.

The current code checks warnings BEFORE `has_bleed`:

```text
Line 45: if (report.warnings && report.warnings.length > 0) {
Line 46:   ...check for 'no bleed' text...
Line 47:   ...check for 'crop' text...
Line 49:   return 'no_bleed';   <-- DEFAULT: any unrecognized warning = "No Bleed"
Line 50: }
Line 51: if (report.has_bleed === true) return 'passed';  <-- Never reached!
```

The rotation warning doesn't match any specific pattern, so it falls into the catch-all `return 'no_bleed'` on line 49. The `has_bleed === true` check on line 51 is never reached.

**Fix:** Move the `has_bleed` check BEFORE the warnings check, so that if the VPS confirmed bleed exists, we return 'passed' regardless of non-critical warnings like rotation.

**File:** `src/components/labels/items/LabelItemsGrid.tsx` (lines 36-59)

---

## Issue 2: Single-Page Print PDFs Not Matching Proof Items

**Root Cause Found:** When individual print-ready PDFs are uploaded (not as a multi-page PDF), the name-matching logic in `handleDualFilesUploaded` normalizes both the filename and the existing item name, then compares. But:

- Uploaded filename: `"Eazi Tool BLACK.pdf"` -- normalizes to `"eazi tool black"`
- Existing item name: `"Eazi Tool Black (5000)"` -- normalizes to `"eazi tool black (5000)"`

The parenthetical quantity suffix `(5000)` isn't stripped by the normalizer, so the names don't match. The print file is created as a brand new item with `quantity: 1` instead of being attached to the existing proof item.

The DB confirms: 6 proof items (with correct quantities) and 6 separate print items (quantity=1, no proof URL), completely unlinked.

**Fix (two parts):**

### Part A: Improve auto-matching
Update the `normalizeItemName` function in `handleDualFilesUploaded` to also strip parenthetical content like `(5000)` from item names. This handles the common pattern where items have quantity in their display name.

**File:** `src/components/labels/order/LabelOrderModal.tsx` (line 146-152)

### Part B: Manual matching UI for unmatched print items
When auto-matching fails (or has already failed, like in the current order), users need a way to manually assign a print-ready file to an existing proof item. Add a "Link to Proof" dropdown on the `PrintReadyItemCard` for items that have print artwork but no proof artwork -- letting the admin pick which proof item this print file belongs to.

When linked:
- Copy the print PDF URL and thumbnail to the selected proof item
- Delete the orphan print-only item

**Files:**
- `src/components/labels/items/PrintReadyItemCard.tsx` -- add a "Link to Proof Item" selector for unmatched items
- `src/components/labels/items/LabelItemsGrid.tsx` -- pass the full items list so `PrintReadyItemCard` can show available proof items to link to

---

## Implementation Sequence

1. Fix `getValidationStatus` logic ordering (5 min)
2. Fix `normalizeItemName` to strip quantity suffixes (5 min)
3. Add manual "Link to Proof" UI on `PrintReadyItemCard` (20 min)

