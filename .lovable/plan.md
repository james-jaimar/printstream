

## Fix: Artwork Rotation Lost During PDF Split

### Root Cause

The database confirms the parent item `ess health labels supplied` has `needs_rotation: true`, but all its child items (Page 1 through Page 7) have `needs_rotation: false`. This happens because the `label-split-pdf` Edge Function hardcodes `needs_rotation: false` when creating or updating child items -- it never inherits the parent's value.

Since the child items are what end up in slot assignments, the imposition engine never sees `needs_rotation=true` and processes landscape artwork into portrait cells, causing the squashing.

### The Fix (Two Layers)

**Layer 1 -- Inherit rotation flag during split (`label-split-pdf`)**

In `supabase/functions/label-split-pdf/index.ts`, change all three places where child items are created/updated to inherit `needs_rotation` from the parent item instead of hardcoding `false`:

- Line 175 (print mode, new child): `needs_rotation: false` becomes `needs_rotation: parentItem?.needs_rotation ?? false`
- Line 301 (proof mode, placeholder update): same change, using `parentItem.needs_rotation`
- Line 333 (proof mode, new child): same change

**Layer 2 -- Dimension safeguard in imposition (`label-impose`)**

Add a failsafe in `supabase/functions/label-impose/index.ts` that auto-detects rotation need by checking each artwork PDF's actual dimensions against the dieline, regardless of what `needs_rotation` says. This prevents squashing even if the flag is wrong for any reason:

- Before the pre-rotation block, call the VPS `/manipulate/page-boxes` endpoint for each unique item's PDF
- Extract the artwork width/height (TrimBox or MediaBox)
- Compare against dieline `label_width_mm` x `label_height_mm` (with bleed)
- If artwork is landscape but cell is portrait (or vice versa), force `needs_rotation = true` for that item's slots
- Log a warning when auto-correcting so we can see it happening

**Layer 3 -- Fix existing data**

Provide a one-time SQL update to fix the current order's child items so you can reprocess without re-uploading:

```sql
UPDATE label_items
SET needs_rotation = true
WHERE order_id = 'b63f2a5a-8880-4748-95b9-f17ba5d60c3b'
  AND parent_item_id IS NOT NULL
  AND needs_rotation = false;
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/label-split-pdf/index.ts` | Inherit `needs_rotation` from parent in all 3 locations |
| `supabase/functions/label-impose/index.ts` | Add dimension-based rotation auto-detection as failsafe before pre-rotation block |

### Technical Detail: Dimension Auto-Detection Logic

```text
For each unique item in slot_assignments:
  1. Fetch page boxes from VPS (or use a lightweight HEAD/dimension check)
  2. artworkW = trimbox width (mm), artworkH = trimbox height (mm)
  3. cellW = label_width_mm + bleed, cellH = label_height_mm + bleed
  4. If artwork orientation mismatches cell orientation:
       - i.e. artworkW > artworkH but cellW < cellH (or vice versa)
       - Force needs_rotation = true for all slots with that item
       - Log: "Auto-detected rotation needed for item X"
```

This ensures the system physically cannot produce squashed output regardless of database flags.

