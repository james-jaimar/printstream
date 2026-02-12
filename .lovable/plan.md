
# Fix Item Count and Proof/Print Status Bugs

## Problem 1: Item count includes the original multi-page parent

**Location**: `src/components/labels/order/LabelOrderModal.tsx` line 476

The "Label Items" header uses `order.items?.length` (25 items) which includes the original 24-page parent PDF. The parent should be excluded since it was split into 24 child items. The same filtering logic used for `filteredItems` (hide items where `page_count > 1 && !parent_item_id`) should be applied to the count.

**Fix**: Filter out split parents before counting:
```
const visibleCount = order.items?.filter(item => 
  !(item.page_count > 1 && !item.parent_item_id)
).length || 0;
```
Display `visibleCount` instead of `order.items?.length`.

## Problem 2: Split PDF function marks children as print-ready

**Location**: `supabase/functions/label-split-pdf/index.ts` lines 137-138

When splitting a multi-page PDF, the edge function sets both `artwork_pdf_url` AND `print_pdf_url` to the same URL, with `print_pdf_status: "ready"`. This causes every child item to show green checkmarks for both "Proof" and "Print" even though only proof artwork was uploaded.

The split function should respect the parent item's state. If the parent has no `print_pdf_url` (i.e., only proof was uploaded), children should not get one either.

**Fix**: Check the parent item's print status before setting child fields:
```
artwork_pdf_url: pageUrl,
// Only set print fields if the parent already had print-ready artwork
print_pdf_url: parentItem.print_pdf_url ? pageUrl : null,
print_pdf_status: parentItem.print_pdf_url ? "ready" : "pending",
```

Additionally, since proof uploads use `artwork_pdf_url` (not `proof_pdf_url`), set `proof_pdf_url` on children when the parent was a proof upload:
```
proof_pdf_url: parentItem.proof_pdf_url || (!parentItem.print_pdf_url ? pageUrl : null),
```

## Technical Details

### Files to change:
1. **`src/components/labels/order/LabelOrderModal.tsx`** -- line 476: use filtered count excluding split parents
2. **`supabase/functions/label-split-pdf/index.ts`** -- lines 136-138: conditionally set print fields based on parent state

### Data fix needed
The 24 existing child items in the database currently have `print_pdf_url` set and `print_pdf_status = 'ready'` incorrectly. After deploying the edge function fix, you may want to clear these values on existing items so they correctly show as proof-only. This can be done via a one-time SQL update or by re-uploading the file.
