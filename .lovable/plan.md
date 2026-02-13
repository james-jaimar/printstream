

# Searchable Dieline Selector

## Problem
The dieline dropdown in the "New Label Order" dialog lists all active dielines in a flat `<Select>`. With a growing library, it's become unwieldy to scroll through and find the right one.

## Solution
Replace the plain `<Select>` with a searchable combobox using the existing `cmdk` Command component (already installed). Users will be able to type dimensions or names to instantly filter the list.

### How it works for you:
- Click the dieline field and a dropdown opens with a **search box** at the top
- Type part of a name or dimension (e.g. "75x50" or "320") to instantly filter
- Results are grouped by roll width for easier scanning
- Select a dieline and the dropdown closes, showing your selection

## Technical Changes

### 1. Create `DielineCombobox.tsx`
**File**: `src/components/labels/DielineCombobox.tsx`

A reusable combobox component that:
- Uses `Popover` + `Command` (both already available in the project)
- Accepts `dielines`, `value`, `onValueChange`, and `disabled` props
- Groups dielines by `roll_width_mm` (e.g., "250mm Roll", "320mm Roll")
- Shows the selected dieline name in the trigger button
- Includes `CommandInput` for type-to-search filtering
- Closes on selection

### 2. Update `NewLabelOrderDialog.tsx`
**File**: `src/components/labels/NewLabelOrderDialog.tsx` (lines ~346-368)

- Replace the `<Select>` / `<SelectContent>` / `<SelectItem>` block with the new `<DielineCombobox>` component
- Wire it into the existing `react-hook-form` field (`dieline_id`)

### Files Summary

| File | Action |
|------|--------|
| `src/components/labels/DielineCombobox.tsx` | Create -- searchable combobox for dieline selection |
| `src/components/labels/NewLabelOrderDialog.tsx` | Edit -- swap Select for DielineCombobox on the dieline_id field |

