
# Full CRM Implementation Plan for Labels Division

## Problem Summary
There are critical bugs and missing functionality in the customer management system:

1. **Data Visibility Bug**: When creating a new customer, the system incorrectly assigns your admin user ID to the customer's `user_id` field. This triggers the `is_label_client()` security function to treat you as a client instead of staff, hiding all other customers.

2. **Missing CRUD Operations**: No ability to edit or delete customers.

3. **Incomplete UI**: The details panel shows legacy fields and lacks proper editing capabilities.

---

## Technical Changes

### 1. Database Schema Fix (Migration)
Fix the `label_customers` table structure and RLS logic:

- Make `user_id` column NULLABLE (it should only be set when a contact has portal access)
- Make `contact_email` NULLABLE (legacy field - contacts are now in separate table)
- Update the `is_label_client()` function to check `label_customer_contacts.user_id` instead of `label_customers.user_id`
- Fix existing data by setting `user_id` to NULL for the problematic "Klint Scales CC" record

```text
Database Changes:
+------------------------------------------+
|        label_customers                   |
+------------------------------------------+
| id                 UUID (PK)             |
| company_name       TEXT (required)       |
| billing_address    TEXT (optional)       |
| notes              TEXT (optional)       |
| is_active          BOOLEAN (default true)|
| user_id            UUID (NOW NULLABLE)   | <-- FIX
| contact_email      TEXT (NOW NULLABLE)   | <-- Legacy, now optional
| created_by         UUID                  |
| created_at/updated_at                    |
+------------------------------------------+
           |
           | 1:N
           v
+------------------------------------------+
|     label_customer_contacts              |
+------------------------------------------+
| id                 UUID (PK)             |
| customer_id        UUID (FK)             |
| user_id            UUID (auth link)      | <-- Portal access
| name, email, phone, role                 |
| receives_proofs, receives_notifications |
| can_approve_proofs, is_primary           |
+------------------------------------------+
```

### 2. Hook Updates (`useClientPortal.ts`)
Fix the create mutation and add update/delete capabilities:

- **Fix `useCreateLabelCustomer`**: Remove `user_id` assignment - set to NULL instead
- **Add `useUpdateLabelCustomer`**: Update company details
- **Add `useDeleteLabelCustomer`**: Soft delete (set `is_active = false`)

### 3. Enhanced Customer Detail Panel
Rebuild the detail panel with full editing:

- Add "Edit" button to company details tab
- Add customer edit form dialog
- Add "Archive Customer" action with confirmation
- Show order history summary
- Display contact count with quick stats

### 4. Improved Customer List Card
Better list UI with more information:

- Show primary contact name/email if available
- Show contact count badge
- Add quick action menu (Edit, Archive)
- Visual indicator for customers with no contacts

### 5. Customer Form Improvements
Update the create/edit dialog:

- Clear company-focused fields only
- Proper validation with error messages
- Optional shipping address field

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/...` | Create | Fix schema + RLS + data |
| `src/hooks/labels/useClientPortal.ts` | Modify | Add update/delete hooks, fix create |
| `src/components/labels/customers/CustomerDetailPanel.tsx` | Modify | Add edit mode, order history |
| `src/components/labels/customers/CustomerFormDialog.tsx` | Modify | Support edit mode |
| `src/pages/labels/LabelsCustomers.tsx` | Modify | Add edit/archive handlers |

---

## Implementation Order

1. **Database migration first** - Fix the schema and repair corrupted data
2. **Update hooks** - Add full CRUD with proper field handling  
3. **Update UI components** - Edit dialogs and improved display
4. **Test end-to-end** - Verify all customers are visible and editable

---

## Expected Outcome
After implementation:
- All existing customers will be visible in the list
- Full create, read, update, and archive functionality
- Proper separation between company records and contacts
- Staff users won't accidentally become treated as clients
