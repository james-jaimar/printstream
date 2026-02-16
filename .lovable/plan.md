

# Client Portal Order Detail Fixes

## Overview

Five targeted fixes to polish the client order detail experience based on the issues identified.

## Changes

### 1. Filter out parent/original PDF items (fixes "25 items" showing instead of 24)

The edge function returns all items including the original multi-page parent PDF. The admin modal already filters these with `!(item.page_count > 1 && !item.parent_item_id)` but the client portal does not.

**Fix**: Apply the same filter in `ClientOrderDetail.tsx` when rendering items, and in the edge function's `/order/:id` endpoint to exclude parent items server-side.

### 2. Add "Select All" checkbox

Currently there is a "Select All" button in the sticky toolbar, but no checkbox at the top of the items list. Add a checkbox header row above the item cards when there are items awaiting review, with a "Select All (N items)" label.

### 3. Remove Production Runs / Layout section

The entire "Production Layout" card (lines 273-308 in `ClientOrderDetail.tsx`) should be removed. Clients do not need to see internal production run data.

### 4. Enable client artwork upload for whole order or individual items

Currently upload only works for items in `client_needs_upload` status. Add:
- An "Upload New Artwork" button at the order level (visible when order status is `pending_approval`)
- This opens a dialog letting the client pick which item(s) to replace, or upload for all
- Individual item upload already works via `ClientArtworkUpload` component

### 5. Wrap approval/reject handlers in try-catch (fixes intermittent error)

The `handleConfirmApproval` and `handleConfirmReject` functions use `await` without try-catch, which can cause unhandled rejections on network errors.

## Technical Details

### Files Modified

| File | Changes |
|------|---------|
| `src/pages/labels/portal/ClientOrderDetail.tsx` | Filter parent items, add select-all checkbox header, remove production runs section, add order-level upload button, wrap handlers in try-catch |
| `supabase/functions/label-client-data/index.ts` | Filter parent items from `/order/:id` response server-side |

### Item Filtering Logic

```typescript
// Filter out parent items that were split into child pages
const visibleItems = (order.items || []).filter(
  item => !(item.page_count > 1 && !item.parent_item_id)
);
```

Applied both client-side in the component and server-side in the edge function for consistency.

### Select All Checkbox

A checkbox row above the item cards list:

```text
[x] Select All (23 awaiting review)
```

Wired to the existing `handleSelectAll` logic which already toggles all awaiting items.

### Error Handling

```typescript
const handleConfirmApproval = async () => {
  if (!orderId || approveItemIds.length === 0) return;
  try {
    await approveItemsMutation.mutateAsync({ ... });
    setDisclaimerOpen(false);
    setApproveItemIds([]);
    setSelectedItemIds([]);
  } catch (error) {
    console.error('Approval error:', error);
    // Toast already shown by mutation's onError
  }
};
```

### No Database Changes Required

