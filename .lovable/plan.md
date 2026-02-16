

# Fix "Action Required" Bug + Premium Portal UI Redesign

## 1. Bug Fix: "Action Required" when all items are approved

### Root Cause
The edge function's `allApproved` check (line 357-358 in `label-client-data/index.ts`) checks ALL items including the parent multi-page item. The parent item (`page_count: 24`, no `parent_item_id`) still has `proofing_status: 'awaiting_client'` because clients only approve the individual child pages. So the check never passes and the order stays `pending_approval`.

### Fix (two parts)

**A. Edge function** -- Filter parent items from the `allApproved` check:
```typescript
const visibleItems = allItems?.filter(
  (i: any) => !(i.page_count > 1 && !i.parent_item_id)
) || [];
const allApproved = visibleItems.length > 0 && 
  visibleItems.every((i) => i.proofing_status === "approved");
```

**B. Dashboard `needsAction` function** -- Also account for the case where the order is `pending_approval` but all visible items are approved (handles stale order status):
```typescript
function needsAction(order: LabelOrder): boolean {
  const items = getVisibleItems(order);
  const allApproved = items.length > 0 && items.every(i => i.proofing_status === 'approved');
  if (allApproved) return false; // Override even if order.status is pending_approval
  if (order.status === 'pending_approval') return true;
  return items.some(
    i => i.proofing_status === 'awaiting_client' || i.proofing_status === 'client_needs_upload'
  );
}
```

**C. Data fix** -- Update the current stuck order to `approved`:
```sql
UPDATE label_orders SET status = 'approved', 
  client_approved_at = NOW() 
WHERE order_number = 'LBL-2026-0001' AND status = 'pending_approval';
```

---

## 2. Premium Portal UI Redesign

Inspired by the reference image, transform the dashboard into a rich, multi-section layout.

### Dashboard Layout (new structure)

```text
+--------------------------------------------------+
| [Impress Logo] Client Portal    [Account] [Logout]|
| ================================================= |
|                                                    |
| Welcome back, James                                |
| Manage your label orders and track your prints.    |
|                                                    |
| +----------+ +----------+ +-----------+ +-------+ |
| | Awaiting | | In Prod. | | Completed | | Total | |
| | Approval | |    0     | |     0     | |   1   | |
| |    1     | |          | |           | |       | |
| +----------+ +----------+ +-----------+ +-------+ |
|                                                    |
| Action Required                                    |
| +-----------------------------------------------+ |
| | [Thumbnail] LBL-2026-0001                     | |
| |             24 items - 26,000 labels           | |
| |             [Review] [Approved] [Prod] [Done]  | |
| |             [Review & Approve ->]              | |
| +-----------------------------------------------+ |
|                                                    |
| Recent Orders (table view)                         |
| +-----------------------------------------------+ |
| | Order #   | Status | Items | Due Date         | |
| | LBL-001   | Review |  24   | 15 Mar           | |
| +-----------------------------------------------+ |
|                                                    |
| Resources & Support                                |
| +----------+ +----------+ +----------+            |
| | File     | | Artwork  | | Contact  |            |
| | Guide    | | Templates| | Support  |            |
| +----------+ +----------+ +----------+            |
|                                                    |
| Footer                                             |
+--------------------------------------------------+
```

### Key UI Changes

**Stats Cards Row** -- Four metric cards at the top: Awaiting Approval, In Production, Completed, Total Orders. Each with a count and subtle icon.

**Order Cards** -- Larger, with thumbnail preview, progress stepper inline, and prominent CTA button. Cards have subtle gradient backgrounds when action is needed.

**Recent Orders Table** -- Below the action cards, a clean table showing all orders with status badges, item counts, and due dates.

**Resources & Support Section** -- Three cards linking to file guidelines, artwork templates, and customer support contact.

**Overall Polish** -- More whitespace, larger typography, subtle shadows, rounded corners, professional spacing throughout.

### Order Detail Page
- Keep current layout (it's already well-structured with stepper, sidebar, items grid)
- No major changes needed

---

## Technical Details

### Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/label-client-data/index.ts` | Filter parent items from `allApproved` check |
| `src/pages/labels/portal/ClientPortalDashboard.tsx` | Premium multi-section layout with stats cards, table, resources |
| Database (one-time fix) | Update LBL-2026-0001 order status to `approved` |

### No new dependencies required

