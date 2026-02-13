

# Print-Ready View Redesign: Proof-Linked Artwork Matching

## Problem
The current Print-Ready tab shows standalone item cards with editable quantity fields. This causes quantities to be "added together" because:
1. Both views allow editing the same `quantity` field on the same item record
2. The print-ready view doesn't visually link back to the proof artwork
3. For multi-page split items, there's no clear way to match print-ready pages to their proof counterparts

## Solution
Redesign the Print-Ready view to use a **side-by-side card layout** (matching the mockup), where:
- **Left panel**: Proof thumbnail + read-only quantity (this is the single source of truth)
- **Right panel**: Print-ready artwork thumbnail + status badge
- Quantity is **only editable in the Proof tab** -- the Print-Ready tab displays it as read-only
- Items are matched by their database relationship (same `label_item` record holds both `proof_pdf_url` and `print_pdf_url`)

## Changes

### 1. New Component: `PrintReadyItemCard.tsx`
**File**: `src/components/labels/items/PrintReadyItemCard.tsx`

A new card component specifically for the print-ready view with a horizontal two-column layout:
- **Left column** (~40% width): Proof thumbnail (from `proof_pdf_url` / `proof_thumbnail_url`), item name, read-only quantity display, dimensions
- **Right column** (~60% width): Print-ready thumbnail (from `print_pdf_url` / `artwork_thumbnail_url`), print status badge, prep actions (auto-crop, use-as-print)
- No editable quantity input -- qty is shown as a static label sourced from the proof

### 2. Update `LabelItemsGrid.tsx`
**File**: `src/components/labels/items/LabelItemsGrid.tsx`

- Pass `viewMode` down to determine which card component to render
- When `viewMode === 'print'`: render `PrintReadyItemCard` instead of `LabelItemCard`
- When `viewMode === 'proof'`: render existing `LabelItemCard` (no changes)
- Adjust grid layout: print-ready view uses wider cards (2-3 columns instead of 5-6) to accommodate the side-by-side layout

### 3. Update `LabelItemCard.tsx` (minor)
**File**: `src/components/labels/items/LabelItemCard.tsx`

- No structural changes needed -- this component remains the proof-view card
- Quantity remains fully editable here as the single source of truth

## Technical Details

### PrintReadyItemCard Layout
```text
+------------------------------------------+
|  PROOF (left)      |  PRINT-READY (right) |
|  [proof thumb]     |  [print thumb]       |
|                    |                      |
|  Item Name         |  Status: Ready       |
|  Qty: 3000 (ro)    |  [Auto-Crop] [Use]   |
|  120.5 x 85.0mm    |                      |
+------------------------------------------+
```

### Grid Columns by View Mode
- **Proof view**: 2-6 columns (existing, narrow vertical cards)
- **Print-ready view**: 1-3 columns (wider horizontal cards for side-by-side layout)

### Data Flow
- Both views read from the same `label_item` record
- Quantity is only written from the Proof view via `onQuantityChange`
- Print-ready view reads `item.quantity` as display-only
- Proof thumbnail comes from `item.proof_thumbnail_url` or `item.proof_pdf_url`
- Print-ready thumbnail comes from `item.artwork_thumbnail_url` or `item.print_pdf_url`

## Files Summary

| File | Action |
|------|--------|
| `src/components/labels/items/PrintReadyItemCard.tsx` | Create -- new horizontal card for print-ready view |
| `src/components/labels/items/LabelItemsGrid.tsx` | Edit -- conditionally render PrintReadyItemCard when viewMode is 'print', adjust grid columns |

