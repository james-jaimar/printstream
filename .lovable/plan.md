

## Bulk Import Customers and Contacts from Excel

### Overview

Build a client-side Excel import feature on the Customers page that parses the uploaded spreadsheet, groups rows by company name, creates one `label_customers` record per unique company, and creates `label_customer_contacts` records for each contact row -- handling multiple email addresses per contact.

### Data Mapping

| Excel Column | Maps To | Table |
|---|---|---|
| Company | `company_name` | `label_customers` |
| Post Address / Street Address | `billing_address` (street preferred, fall back to post) | `label_customers` |
| Rep | `notes` (stored as "Rep: {name}") | `label_customers` |
| Contact | `name` | `label_customer_contacts` |
| E-mail | `email` (multiple emails joined with `;`) | `label_customer_contacts` |
| Telephone | `phone` (combined with mobile if both exist) | `label_customer_contacts` |
| Mobile | `phone` (or appended to telephone) | `label_customer_contacts` |
| Position | `role` | `label_customer_contacts` |

### Multiple Email Handling

Emails separated by `;`, `,`, or spaces will be stored as a single semicolon-delimited string in the `email` field (e.g. `info@bestbranding.co.za;bestbranding@gmail.com`). When sending notifications/proofs, the system will split on `;` and send to all addresses. The first contact per company is marked as `is_primary = true`.

### Duplicate Prevention

Before inserting, the import will check existing customers by `company_name` (case-insensitive match). If a company already exists, new contacts will be added to the existing customer rather than creating a duplicate.

### New Files

1. **`src/utils/labels/customerImport.ts`** -- Pure parsing logic:
   - Read XLS using the existing `xlsx` dependency
   - Group rows by company name
   - Normalize emails (split on `;`, `,`, space; trim; rejoin with `;`)
   - Combine telephone + mobile into phone field
   - Return structured data ready for insert

2. **`src/components/labels/customers/CustomerImportDialog.tsx`** -- UI dialog:
   - File upload (accept `.xls`, `.xlsx`)
   - Preview parsed data: number of companies, contacts, contacts with multiple emails
   - "Import" button with progress
   - Results summary: created, skipped (duplicates), errors

### Modified Files

3. **`src/pages/labels/LabelsCustomers.tsx`** -- Add "Import" button next to "New Customer" in the header, opening the import dialog.

4. **`src/hooks/labels/useCustomerImport.ts`** -- Hook that handles the import transaction:
   - Fetches existing customers to check for duplicates
   - Batch-inserts new customers (groups of 50)
   - Batch-inserts contacts for each customer
   - Returns stats (created, skipped, errors)
   - Invalidates customer queries on completion

### Technical Details

- Uses the existing `xlsx` package (already installed) for parsing
- No database schema changes needed -- `email` field is already `text` so it can hold semicolon-delimited addresses
- Contacts without a name are skipped (some rows have empty Contact fields)
- Contacts without an email still get imported (phone-only contacts are valid)
- The first contact per company gets `is_primary = true`; subsequent contacts get `is_primary = false`
- All imported contacts default to `receives_proofs = true`, `receives_notifications = true`, `can_approve_proofs = true`
- Import processes client-side with batch inserts to Supabase (no edge function needed)

### Import Flow

```text
Upload .xls --> Parse with xlsx --> Group by Company
    |
    v
Check existing customers (case-insensitive match)
    |
    v
For each new company:
  1. Insert into label_customers
  2. Insert all contacts into label_customer_contacts
    |
    v
For each existing company:
  1. Insert new contacts only (skip if name+email match exists)
    |
    v
Show results: X companies created, Y contacts added, Z skipped
```

