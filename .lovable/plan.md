

# Dieline Library: List View + Card/List Toggle

## What Changes

1. **Add a view toggle** (card/list) next to the search bar, defaulting to **list view**
2. **Create a new `DielineListRow` component** for the table/list layout
3. **Reorder the displayed information**: size (WxH) first, then across x around
4. **Remove the roll width display** (e.g. "330mm roll") from both card and list views

## Layout

The list view will be a compact table-style layout:

| Die No | Size (WxH) | Across x Around | Type | Gaps | Labels/Frame | Client | Actions |
|--------|-----------|-----------------|------|------|-------------|--------|---------|

## Technical Details

### New file: `src/components/labels/dielines/DielineListRow.tsx`
- A table row component receiving the same props as `DielineCard`
- Displays: die_no, size, across x around, die_type badge, gaps, labels/frame, client, and a kebab menu for edit/duplicate/archive

### Modified: `src/components/labels/dielines/DielineCard.tsx`
- Remove the `{dieline.roll_width_mm}mm roll` text from `CardDescription`
- Reorder so size appears before across/around (already the case in the card content, just clean up the description)

### Modified: `src/pages/labels/LabelsDielines.tsx`
- Add `viewMode` state defaulting to `'list'`
- Add a toggle button group (using the existing `ViewToggle` pattern from `src/components/tracker/common/ViewToggle.tsx`) next to the search bar
- Conditionally render either the card grid or a list table based on `viewMode`

### Modified: `src/components/labels/dielines/index.ts`
- Export the new `DielineListRow` component

### No database or type changes needed

