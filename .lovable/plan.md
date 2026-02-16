

# Fix: Approval Foreign Key Constraint Error

## Root Cause

The `label_proof_approvals.approved_by` column has a foreign key constraint referencing `auth.users(id)`. However, when a client approves items through the portal, the edge function inserts the `contactId` (from `label_client_auth` table) into `approved_by`. Since portal clients are not in `auth.users`, the FK constraint fails with:

```
Key (approved_by)=(566605d8-...) is not present in table "users"
```

## Fix

Drop the foreign key constraint on `approved_by` so it can accept both staff user IDs (from `auth.users`) and client contact IDs (from `label_client_auth`).

## Technical Details

### Database Migration

```sql
ALTER TABLE label_proof_approvals
  DROP CONSTRAINT label_proof_approvals_approved_by_fkey;
```

This is the safest fix since the two auth systems (staff via `auth.users`, clients via `label_client_auth`) use separate tables. The column still stores UUIDs -- it just won't enforce that they exist in one specific table.

### Files Modified

| File | Changes |
|------|---------|
| Database migration | Drop the FK constraint on `approved_by` |

No edge function or frontend code changes needed -- the logic is correct, it's just the FK constraint blocking the insert.

