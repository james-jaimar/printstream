

## Fix: Multi-Page PDF Upload Should Fill Existing Placeholders

### The Problem

When you add 7 placeholders ("Page 1" through "Page 7") and then upload a 7-page proof PDF, the system creates 7 **new** child items alongside the 7 existing placeholders -- giving you 14 items instead of 7.

This happens because the `label-split-pdf` edge function's proof mode always creates new rows. It never checks whether matching placeholders already exist.

### The Fix

Modify the **proof mode** section of `supabase/functions/label-split-pdf/index.ts` to:

1. Before creating children, query for existing placeholder items in the same order -- items where `proof_pdf_url`, `artwork_pdf_url`, and `print_pdf_url` are all null
2. Match placeholders by name pattern: "Page 1" matches split page 1, "Page 2" matches page 2, etc.
3. If a matching placeholder is found, **update** it with the split page's artwork URL and dimensions instead of inserting a new row
4. If no placeholder matches (e.g., extra pages beyond the placeholder count), fall back to creating a new child item as before

### Technical Detail

**File: `supabase/functions/label-split-pdf/index.ts`**

In the proof mode section (around line 210-315):

- After fetching the parent item, query for placeholders:
  ```
  SELECT id, name FROM label_items
  WHERE order_id = $order_id
    AND proof_pdf_url IS NULL
    AND artwork_pdf_url IS NULL
    AND print_pdf_url IS NULL
    AND parent_item_id IS NULL
  ```

- Build a map: extract page number from name (e.g., "Page 3" -> 3), map page_number -> placeholder_id

- In the per-page loop, check the map first:
  - **Match found**: UPDATE the placeholder row with `artwork_pdf_url`, `proof_pdf_url`, `width_mm`, `height_mm`, `parent_item_id`, `source_page_number`, `page_count = 1`
  - **No match**: INSERT a new child item (existing behaviour)

This is a single-file change to the edge function. No client-side code changes needed since the client already handles the response correctly -- it just needs the edge function to fill placeholders instead of duplicating them.

