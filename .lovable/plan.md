
# Fix: Customer ID Not Saved with Label Orders

## Problem Summary

When you create a label order and select a customer from the dropdown, the **customer_id is never saved to the database**. The order only stores `customer_name`, `contact_name`, and `contact_email` - but not the actual link to the customer record.

Later, when you open "Send Proof for Approval," the dialog tries to look up contacts via `useCustomerContacts(order.customer_id)`. Since `customer_id` is `null`, it returns no contacts - even though the customer definitely has contacts configured.

**Database evidence:**
```
Order LBL-2026-0001: customer_id = NULL, contact_email = james@jaimar.dev
Customer "Jaimar": id = 9d7ac83b-7c14-40f9-b23c-36c8e378bfeb
Contact "James Hawkins": customer_id = 9d7ac83b-7c14-40f9-b23c-36c8e378bfeb
```

The customer and contact exist, but the order has no link to them.

---

## Solution

### 1. Add `customer_id` to the create order input type

Update `CreateLabelOrderInput` in `src/types/labels.ts` to include `customer_id`:

```typescript
export interface CreateLabelOrderInput {
  customer_id?: string;           // ← ADD THIS
  customer_name: string;
  contact_name?: string;
  // ... rest unchanged
}
```

### 2. Update the order creation hook to save `customer_id`

Modify `useCreateLabelOrder` in `src/hooks/labels/useLabelOrders.ts` to include `customer_id` in the insert:

```typescript
const { data, error } = await supabase
  .from('label_orders')
  .insert({
    order_number: orderNumber,
    customer_id: input.customer_id,      // ← ADD THIS
    customer_name: input.customer_name,
    // ... rest unchanged
  })
```

### 3. Pass `customer_id` from the dialog form to the mutation

Update `NewLabelOrderDialog.tsx` `onSubmit` to include `customer_id`:

```typescript
const result = await createOrder.mutateAsync({
  customer_id: data.customer_id,         // ← ADD THIS
  customer_name: data.customer_name,
  // ... rest unchanged
});
```

### 4. (Optional) Fix existing orders

Since LBL-2026-0001 already exists without a `customer_id`, you may want to manually update it:

```sql
UPDATE label_orders 
SET customer_id = '9d7ac83b-7c14-40f9-b23c-36c8e378bfeb' 
WHERE order_number = 'LBL-2026-0001';
```

(Or re-create the order after the fix is deployed)

---

## Files to Change

1. **`src/types/labels.ts`** - Add `customer_id?: string` to `CreateLabelOrderInput`
2. **`src/hooks/labels/useLabelOrders.ts`** - Insert `customer_id` in the database call
3. **`src/components/labels/NewLabelOrderDialog.tsx`** - Pass `customer_id` from form data to mutation

---

## Expected Result

After this fix:
- New orders will correctly link to the customer record via `customer_id`
- "Send Proof for Approval" will find and display all configured contacts
- The entire proofing notification workflow will function as designed
