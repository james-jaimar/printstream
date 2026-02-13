

# Fix: Print-Ready Multi-Page PDF Name Matching

## Root Cause

The name-matching logic at line 132 of `LabelOrderModal.tsx` uses exact string comparison after normalization. This is too brittle -- a single typo difference between the proof and print-ready filenames causes a complete match failure.

In this case:
- Proof children normalized to: `d605535 pizza picasso x 24 kinfds`
- Print-ready file normalized to: `d605535 pizza picasso x 24 kinds`

Result: no match, so a brand new parent item was created instead of updating the 24 existing proof children.

## Solution

Improve the matching logic with a two-tier approach:

### Tier 1: Exact normalized match (existing logic, keep as-is)

### Tier 2: Fallback -- if no exact match, try contextual matching
When a multi-page print-ready PDF is uploaded and no exact name match is found, check if there is **exactly one** multi-page parent item in the order whose child count matches the uploaded file's page count. If so, assume it's the match.

This is safe because:
- Label orders typically have one multi-page artwork set
- Page count matching adds a strong constraint
- If there are multiple multi-page parents, the fallback won't fire (ambiguous)

### Cleanup

Delete the stray items created by failed matching attempts:
- The duplicate parent `1000bc9b-...` (24-page print-ready with no children)
- The other stray item `b6ca340f-...` (4-page "Pizza Picasso Labels")

## Technical Details

### File: `src/components/labels/order/LabelOrderModal.tsx`

In the print-ready upload handler (around lines 128-187), after the existing name-matching check fails (`existingChildren.length === 0`), add a fallback before creating a new item:

```
// Existing exact match at line 132-134
const existingChildren = order.items?.filter(item =>
  item.parent_item_id && normalizeItemName(item.name.replace(/ - Page \d+$/i, '')) === normalizedFileName
) || [];

// NEW: Fallback -- match by page count if only one multi-page parent exists
if (existingChildren.length === 0 && (file.page_count ?? 1) > 1) {
  // Find all parent items that have children
  const parentIds = [...new Set(
    (order.items || [])
      .filter(i => i.parent_item_id)
      .map(i => i.parent_item_id!)
  )];

  // Count children per parent
  const parentsWithMatchingPageCount = parentIds.filter(pid => {
    const childCount = (order.items || []).filter(i => i.parent_item_id === pid).length;
    return childCount === (file.page_count ?? 1);
  });

  // Only auto-match if exactly one parent has the right child count
  if (parentsWithMatchingPageCount.length === 1) {
    const matchedParentId = parentsWithMatchingPageCount[0];
    const matchedChildren = (order.items || []).filter(
      i => i.parent_item_id === matchedParentId
    );
    // Use matchedParentId and matchedChildren in place of
    // existingParentId and existingChildren for the split logic
  }
}
```

This merges naturally into the existing flow -- using the same `splitPdf` call, thumbnail generation, and refetch logic already in place.

### Database Cleanup (SQL)

Delete stray items from failed uploads:

```sql
DELETE FROM label_items WHERE id IN (
  '1000bc9b-53da-49c3-bb2c-090b649c060d',
  'b6ca340f-20db-46bf-9d4b-02848f41fbf6'
);
```

## Files to Change

| File | Change |
|------|--------|
| `src/components/labels/order/LabelOrderModal.tsx` | Add page-count fallback matching for multi-page print-ready PDFs |
| Database (SQL cleanup) | Remove stray duplicate items |

