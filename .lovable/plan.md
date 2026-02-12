

# Import Dieline Data from Excel

## Overview

Import ~193 dieline records from the LP die list spreadsheet into the `label_dielines` table. This requires adding 4 new columns to the table schema, then bulk-inserting the data with business rules applied.

## Step 1: Add New Columns (Database Migration)

Add four new columns to `label_dielines`:

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `die_no` | text | YES | null | Die number (e.g. LP00065) |
| `rpl` | text | YES | null | Rarely used reference field |
| `die_type` | text | YES | 'rectangle' | Shape type (circle, oval, square, etc.) |
| `client` | text | YES | null | Client associated with this die |

Add a unique index on `die_no` (where not null) to prevent duplicates.

## Step 2: Update TypeScript Types

Update `LabelDieline` interface and `CreateLabelDielineInput` in `src/types/labels.ts` to include the new fields.

## Step 3: Bulk Insert Data

Parse all ~193 rows from the spreadsheet and insert into the database with these rules applied:

- **Roll width**: Fixed at 330mm for all entries (noted in spreadsheet header)
- **Vertical gap**: Set to `0` when `around = 1` (single row, no gap needed). Some rows have empty gap values which confirm this
- **Corner radius**: Set to `NULL` when `die_type` is anything other than "rectangle" or "square" (circles, ovals, arches, special shapes, etc. cannot have corner radius). Values marked as "-" in the spreadsheet also become `NULL`
- **Name**: Auto-generate as "{across} Across x {around} Around - {width}x{height}mm ({die_type})" or use die_no as a fallback
- **Across/Around**: Some rows have empty across/around values -- these will default to 1
- **is_active**: All set to `true`
- **is_custom**: All set to `false` (these are standard dies)

## Step 4: Update UI Components

### `DielineFormDialog.tsx`
- Add `die_no`, `die_type`, and `client` fields to the form
- Make corner radius field disabled when die_type is not rectangle/square
- Auto-clear corner radius when switching to a non-rectangular type

### `DielineCard.tsx`
- Display die number and type on the card
- Show client name if present

### `useLabelDielines.ts`
- No changes needed (already uses `select('*')`)

## Data Summary

The spreadsheet contains 193 dielines across these shape types:
- rectangle (~130 entries)
- circle (~18 entries)
- square (~7 entries)
- oval (~8 entries)
- special shape (~12 entries)
- tapered variants (~7 entries)
- arch, hexagon, scallop, speech bubble, egg shape, moon shape, perf, and custom shapes (~11 entries)

## Technical Notes

- The `die_no` field has a couple of duplicates in the spreadsheet (e.g. LP00048 appears twice, LP00117 appears twice, LP00038 appears twice). These will be handled by making the die_no unique constraint partial or by appending a suffix
- Some rows have no die_no (one entry on line 72) -- these will be imported with a null die_no
- Corner radius values of "0" on circles are valid in the spreadsheet but will be set to NULL per your rule
- The "-" values for corner radius will be treated as NULL

