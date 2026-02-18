

## Fix: Dashboard Order Links Opening Legacy Full-Page View

### Problem

When clicking an order from the **Dashboard** "Recent Orders" section, you're taken to `/labels/orders/{orderId}` which renders the old full-page `LabelsOrderDetail` component. The correct behavior is to navigate to `/labels/orders?selected={orderId}`, which opens the unified modal on the Orders page.

On your second click (after going back to Orders and clicking the order there), it works because the Orders page uses the modal approach.

### Root Cause

Two places in `LabelsHome.tsx` still link to the legacy route:

1. **Line 49**: The "New Order" dialog success callback navigates to `/labels/orders/${orderId}`
2. **Line 97**: Each "Recent Orders" link points to `/labels/orders/${order.id}`

### Changes

**File: `src/pages/labels/LabelsHome.tsx`**

1. Change the `NewLabelOrderDialog` success callback from:
   - `window.location.href = '/labels/orders/${orderId}'`
   - to: `navigate('/labels/orders?selected=${orderId}')`

2. Change the Recent Orders links from:
   - `to={'/labels/orders/${order.id}'}`
   - to: `to={'/labels/orders?selected=${order.id}'}`

### Optional Cleanup

Consider also removing the legacy route from `App.tsx` (line 253: `orders/:orderId` pointing to `LabelsOrderDetail`) to prevent anyone from accidentally landing on the old full-page view again. This can be done separately if you want to keep it as a fallback for now.

