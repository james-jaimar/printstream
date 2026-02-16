

# Proofing Workflow: Version-Controlled "Send Proof" with Lock-Down

## Overview

Transform the "Send Proof" button into a proper workflow step that locks the order, tracks proof versions, makes it visible to the client, and handles the approval/changes loop cleanly.

## Current State

- "Send Proof" opens a dialog to select contacts and send email notifications
- Items have `proofing_status` but nothing tracks version numbers
- Order status stays at `quote` -- nothing transitions it to `pending_approval`
- No lock-down mechanism prevents edits while the client is reviewing
- No admin UI for handling client-requested changes

## What Changes

### 1. Database: Add Proof Version Tracking

Add a `proof_version` column to `label_orders`:

```sql
ALTER TABLE label_orders ADD COLUMN proof_version integer NOT NULL DEFAULT 0;
```

- Starts at `0` (no proof sent yet)
- Incremented to `1` when "Send Proof" is first clicked, `2` on revision, etc.
- Client portal will show "v1", "v2" so they can see revisions

### 2. "Send Proof" Button Workflow (LabelOrderModal)

When the admin clicks "Send Proof":

1. Increment `proof_version` on the order (0 to 1, or N to N+1)
2. Set order status to `pending_approval`
3. Mark all draft items with artwork as `ready_for_proof`
4. Open the existing `SendProofingDialog` to pick contacts and send emails
5. The order is now visible in the client portal (status is `pending_approval`)

The button label changes based on state:
- First time: "Send Proof"
- After changes: "Send Proof v2" / "Send Proof v3"

### 3. Order Lock-Down While Awaiting Client

When order status is `pending_approval`:
- Disable the artwork upload zone (proof tab)
- Disable item deletion
- Show a banner: "Order is locked -- awaiting client approval (v1)"
- Keep print-ready uploads enabled (they don't affect proofs)
- "Bypass Proof" toggle remains available as an escape hatch

### 4. Admin UI for Handling Client Changes

When the client requests changes (items get `client_needs_upload` status), the admin needs a clear workflow:

- Add a **"Changes Requested" banner** at the top of the order when any items have `client_needs_upload` or `artwork_issue`
- The banner shows which items need attention and the client's comments
- A **"Revise & Resend"** button that:
  1. Unlocks the order for editing (sets status back to `quote` temporarily)
  2. Lets admin upload corrected artwork
  3. When ready, "Send Proof v2" re-locks and sends to client again

### 5. Auto-Imposition on Full Approval

This already works in the edge function (`label-client-data` approve-items endpoint, lines 358-384). When all items are approved AND have `print_pdf_url`, imposition fires automatically. No changes needed here.

### 6. Types Update

Add `proof_version` to the `LabelOrder` interface.

## Technical Details

### Files Modified

| File | Changes |
|------|--------|
| `src/types/labels.ts` | Add `proof_version: number` to `LabelOrder` |
| `src/components/labels/order/LabelOrderModal.tsx` | Lock-down banner, disable uploads when pending, version-aware "Send Proof" button, "Changes Requested" banner with "Revise & Resend" |
| `src/components/labels/proofing/SendProofingDialog.tsx` | Before sending: increment `proof_version`, set status to `pending_approval`, mark items `ready_for_proof` |
| `src/hooks/labels/useLabelOrders.ts` | No changes needed (generic update mutation already exists) |

### Database Migration

```sql
ALTER TABLE label_orders ADD COLUMN proof_version integer NOT NULL DEFAULT 0;
```

### Workflow State Machine

```text
  quote (v0)
    |
    | "Send Proof" -> increments to v1
    v
  pending_approval (v1) -- LOCKED
    |
    |--- Client approves all --> approved --> auto-impose if print-ready
    |
    |--- Client requests changes --> items marked client_needs_upload
    |        |
    |        | Admin clicks "Revise & Resend" --> unlocks to quote
    |        | Admin fixes artwork
    |        | "Send Proof v2" --> pending_approval (v2) -- LOCKED
    |        v
    |     (repeat loop)
```

### Lock-Down Rules

When `status === 'pending_approval'`:
- Proof artwork upload zone: DISABLED (greyed out with message)
- Item delete buttons: HIDDEN
- Print-ready uploads: STILL ENABLED (doesn't affect proofs)
- "Bypass Proof" toggle: STILL ENABLED (admin override)
- "Request Artwork" button: STILL ENABLED (can flag issues)

### Changes Requested Banner

Shown when any items have `proofing_status === 'client_needs_upload'`:

```text
+----------------------------------------------------------+
|  ! Changes Requested by Client                           |
|                                                          |
|  Items needing revision:                                 |
|  - Pizza Picasso Chicken: "Logo needs to be bigger"      |
|  - Pizza Picasso Steak: "Wrong background colour"        |
|                                                          |
|  [Revise & Resend]                                       |
+----------------------------------------------------------+
```

"Revise & Resend" sets order status back to `quote`, allowing the admin to make changes. Once done, clicking "Send Proof v2" repeats the cycle.

