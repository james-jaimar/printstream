

# Fix: Exclude Multi-Page Parent Items from Layout Optimizer

## Problem

The AI Layout Optimizer shows 25 items instead of 24. The original multi-page parent PDF (the 24-page file before splitting) is being included alongside its 24 child pages because it has a `proof_pdf_url` set.

## Root Cause

The `layoutEligibleItems` filter (line 93-96 in `LabelOrderModal.tsx`) only checks for artwork URLs but does not exclude parent items that were split into children. The parent item passes the filter because it has `proof_pdf_url` set.

## Fix

Add the same parent-exclusion filter already used elsewhere in the file (e.g., line 439, 582) to the `layoutEligibleItems` memo.

## Technical Details

### File: `src/components/labels/order/LabelOrderModal.tsx` (lines 93-97)

Change the filter to also exclude multi-page parent items (items with `page_count > 1` and no `parent_item_id`):

```typescript
const layoutEligibleItems = useMemo(() => {
  return (order?.items || []).filter(item => 
    (item.print_pdf_url || item.proof_pdf_url || item.artwork_pdf_url) &&
    !(item.page_count > 1 && !item.parent_item_id)
  );
}, [order?.items]);
```

This pattern is consistent with the existing parent-exclusion logic used for the item count display (line 582) and bulk approve (line 439).

No other files need changes.

