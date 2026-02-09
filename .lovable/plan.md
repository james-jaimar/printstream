
Goal: Fix the crash (“Minified React error #185” = maximum update depth exceeded) that happens immediately when selecting a customer in **New Label Order**. This is almost certainly an infinite render loop triggered by the `useEffect` that auto-selects the primary contact and calls `form.setValue(...)`.

## What’s happening (root cause)
In `src/components/labels/NewLabelOrderDialog.tsx`, this effect runs:

- It depends on `form` (the entire object) in the dependency array.
- Inside the effect it calls:
  - `setSelectedContacts(...)`
  - `form.setValue('contact_name', ...)`
  - `form.setValue('contact_email', ...)`

Those updates trigger a re-render, which (because `form` is in the dependency array and/or because the effect’s conditions are still true) causes the effect to run again, repeating indefinitely until React throws #185.

This aligns with your report:
- Crash happens **on customer selection**, before you even click a contact.
- The contact query then resolves and the effect starts “auto setting” values repeatedly.

## Implementation approach (safe + consistent)
We will make the auto-primary-contact behavior “run once per customer selection” and ensure the effect can’t re-trigger itself endlessly.

### 1) Stabilize effect dependencies
Change the effect dependency list to avoid the full `form` object. Use stable references only:
- `selectedCustomerId`
- `contactsLoading`
- `contacts` (or better: `contacts?.map(c => c.id).join(',')` / `contacts?.length` to avoid unnecessary triggers)
- `form.setValue` (method ref) rather than `form`

### 2) Add a “run-once per customer” guard
Use a `useRef` to remember which customerId we already initialized:
- `const autoSelectedCustomerRef = useRef<string | null>(null);`
- When `selectedCustomerId` changes, reset this ref.
- Only run the “auto-select primary contact + set form values” if:
  - `autoSelectedCustomerRef.current !== selectedCustomerId`
  - and contacts are loaded.

This guarantees the effect runs at most once per customer change.

### 3) Add idempotent checks (avoid re-setting same values)
Before calling `setSelectedContacts` / `form.setValue`, check whether the values are already correct:
- If `selectedContacts` already equals `[primaryContact.id]`, do not set again.
- If form values already match primary contact name/email, do not set again.

This reduces unnecessary renders and eliminates any remaining risk of render loops.

### 4) Fix double-toggle risk in contact UI (secondary, but good hardening)
Currently both the row `<div onClick>` and the `<Checkbox onCheckedChange>` call `toggleContact`. That can cause “toggle twice” in some click paths.
We’ll adjust to a single source of truth:
- Either:
  - keep row click and make the Checkbox “read-only” (no handler) OR
  - keep Checkbox handler and remove row `onClick`, or stopPropagation on checkbox.
This is not the #185 root cause, but it prevents confusing selection behavior.

### 5) Add minimal diagnostic logging (temporary)
Add a few `console.debug` statements (and remove later) to confirm:
- effect fires once per customer
- contacts length and primary contact id
- whether we actually set values or skip

This helps verify quickly without guesswork.

## Files we will change
1) `src/components/labels/NewLabelOrderDialog.tsx`
- Update `useEffect` logic (dependencies + useRef guard + idempotent checks)
- Adjust contact row/checkbox click handlers to avoid double toggles
- Add temporary debug logs (optional, can remove after confirming)

## How we will test (end-to-end)
1) Open `/labels` → “New Order”
2) Select a customer that definitely has contacts
3) Confirm:
   - No crash / no error boundary
   - Contacts list appears
   - Primary contact auto-select happens exactly once
   - You can select/deselect contacts reliably
4) Switch to another customer and confirm it re-initializes correctly (once)
5) Switch back to the first customer and confirm it still behaves correctly

## Notes on TypeScript & validation (to match your standards)
- Keep `selectedContacts` as `string[]` consistently
- Avoid unsafe casts; rely on `CustomerContact` type from `useCustomerContacts`
- Ensure all setValue calls remain within schema expectations (`contact_email` accepts `''` or email)
- No new interfaces needed for this fix; just behavioral stability

## Expected outcome
Selecting a customer will no longer crash the app. Primary contact will auto-populate once, and contact selection will remain stable and predictable.
