

# Add Edit Capability to Mapping Library

## What You See Now
Each mapping row has only "Verify/Unverify" and "Delete" buttons. To change what a mapping points to (e.g. wrong paper type or weight), you'd have to delete and reimport.

## Plan

### 1. Create `EditMappingDialog.tsx` component
A dialog that opens when clicking an "Edit" (pencil icon) button on any mapping row. It will show:
- **Excel Text** (read-only display — this is the source key)
- **Mapping Type** dropdown (paper_specification, production_stage, delivery_specification)
- Based on mapping type, show relevant dropdowns:
  - **Paper spec**: Paper Type + Paper Weight dropdowns (from `print_specifications` where category = 'paper_type' / 'paper_weight')
  - **Production stage**: Stage dropdown (from `production_stages`) + optional Stage Spec dropdown (from `stage_specifications`)
  - **Delivery spec**: Delivery Method dropdown (from `print_specifications` where category = 'delivery_method') + Collection toggle
- **Confidence Score** slider/input
- **Verified** checkbox
- Save button that calls `supabase.from('excel_import_mappings').update(...)` on the mapping ID

### 2. Update `MappingLibrary.tsx`
- Add an Edit button (pencil icon) to each row's Actions column, next to the existing Verify/Delete buttons
- Pass the selected mapping to the dialog
- On save, update local state and refresh stats

### Files
| File | Change |
|------|--------|
| `src/components/admin/mapping/EditMappingDialog.tsx` | **New** — edit dialog with dynamic dropdowns |
| `src/components/admin/MappingLibrary.tsx` | Add Edit button + dialog state management |

