
# Proofing Workflow Overhaul: Changes Requested Flow

## The Problems Today

1. **Client portal**: When client rejects items, the order stays at `pending_approval` but items go to `client_needs_upload`. The portal only shows orders with status in `['pending_approval', 'approved', 'in_production', 'completed']`. Since the admin then clicks "Revise & Resend" which sets status back to `quote`, the order vanishes from the portal entirely.

2. **Admin side**: After client requests changes, clicking "Revise & Resend" sets order to `quote` -- a generic status that doesn't communicate "client wants changes". There's no distinct "changes requested" status.

3. **No replace option on proof items**: The `LabelItemCard` (proof view) only has delete. When a client flags a specific item, the admin needs to replace just that item's artwork without deleting and re-uploading.

## Solution: New `changes_requested` Order Status + Replace Artwork + Improved Portal Visibility

### New Order Status: `changes_requested`

Add `changes_requested` to `LabelOrderStatus`. This status means:
- Client has rejected one or more items
- Admin needs to revise artwork and resend
- Order remains visible in the client portal (with a "Changes Submitted" message)
- Admin sees a clear "Changes Requested" banner with the client's feedback

### Workflow State Machine

```text
                    +------------------+
                    |      quote       |  (internal drafting)
                    +--------+---------+
                             |
                     [Send Proof]
                             |
                    +--------v---------+
                    | pending_approval |  (locked, client reviewing)
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    [Client approves all]        [Client rejects item(s)]
              |                             |
    +---------v---------+        +----------v-----------+
    |     approved      |        |  changes_requested   |
    +---------+---------+        +----------+-----------+
              |                             |
              |                  [Admin replaces artwork]
              |                  [Admin clicks "Resend Proof"]
              |                             |
              |                  +----------v-----------+
              |                  |  pending_approval    |  (v2, re-locked)
              |                  +----------+-----------+
              |                             |
              +-----------------------------+
              |
    +---------v---------+
    |   in_production   |
    +-------------------+
```

### Detailed Changes

#### 1. Database Migration
- No schema change needed -- `status` is already a text column, not an enum. Just need to handle the new value in code.

#### 2. Types (`src/types/labels.ts`)
- Add `'changes_requested'` to `LabelOrderStatus` union type.

#### 3. Edge Function (`supabase/functions/label-client-data/index.ts`)

**`/approve-items` endpoint (rejection path)**:
- When `action === 'rejected'`: set order status to `changes_requested` instead of keeping it at `pending_approval`.
- Keep item-level updates as-is (`proofing_status: 'client_needs_upload'`, `artwork_issue: comment`).

**`/orders` endpoint**:
- Add `changes_requested` to `clientVisibleStatuses` array so the order stays visible in the portal.

**`/upload-artwork` endpoint**:
- Currently resets item to `draft` status. This is correct -- client can upload replacement artwork while order is in `changes_requested` state.
- Add: when client uploads replacement artwork for an item that was flagged, also check if all flagged items now have new uploads. If so, optionally auto-notify admin.

#### 4. Admin Order Modal (`src/components/labels/order/LabelOrderModal.tsx`)

**Changes Requested banner improvements**:
- Currently shows when items have `client_needs_upload` status, regardless of order status.
- Update to also check for `order.status === 'changes_requested'`.
- Replace the "Revise & Resend" button (which sets status to `quote`) with two actions:
  - **"Replace Artwork"** -- opens a file picker for the specific flagged item (new feature).
  - **"Resend Proof"** -- sets flagged items back to `awaiting_client`, increments `proof_version`, sets order back to `pending_approval`. This is the re-lock action.
- The order stays in `changes_requested` while admin is working on revisions. Artwork uploads remain enabled (not locked).

**New: Replace proof artwork on individual items**:
- Add a "Replace" button to `LabelItemCard` (proof view) that allows re-uploading artwork for a specific item without deleting it first.
- When replacing: update `proof_pdf_url`, `proof_thumbnail_url`, reset `proofing_status` to `ready_for_proof`, clear `artwork_issue`.

#### 5. Client Portal Changes

**Dashboard (`ClientPortalDashboard.tsx`)**:
- Add `changes_requested` to `statusConfig` with label "Changes Submitted" and an appropriate color (e.g., orange).
- Update `needsAction()`: orders with `changes_requested` status do NOT need client action (they're waiting for admin).
- Update `getWorkflowStep()`: `changes_requested` maps to step 0.5 (between review and approved) -- show as "Under Revision".
- Add a new workflow step or indicator: "Revising" between Review and Approved.

**Order detail view (`ClientItemCard.tsx`)**:
- When order status is `changes_requested`:
  - Show items the client rejected with their feedback comment.
  - Show a message: "We're working on the changes you requested. You'll be notified when revised proofs are ready."
  - Allow client to upload replacement artwork if `proofing_status === 'client_needs_upload'`.
  - Disable approve/reject buttons (already being handled).

#### 6. Proofing Workflow Hook (`src/hooks/labels/useProofingWorkflow.ts`)

**New mutation: `useReplaceProofArtwork`**:
- Accepts `itemId`, `file` (File object).
- Uploads to storage at `orders/{orderId}/proof/{itemId}-v{version}.pdf`.
- Updates `proof_pdf_url`, triggers thumbnail generation.
- Resets `proofing_status` to `ready_for_proof`, clears `artwork_issue`.

**Update `useSendProofNotification`**:
- If order is in `changes_requested` status, increment `proof_version` and set status to `pending_approval`.
- Reset relevant items from `ready_for_proof` to `awaiting_client`.

#### 7. Notification Updates
- When order moves to `changes_requested`: send email to admin/staff notifying them of client feedback.
- When admin resends revised proof: existing notification flow handles this (sends to client contacts).

## File Summary

| File | Change |
|------|--------|
| `src/types/labels.ts` | Add `'changes_requested'` to `LabelOrderStatus` |
| `supabase/functions/label-client-data/index.ts` | Update rejection to set `changes_requested` status; add to visible statuses |
| `src/components/labels/order/LabelOrderModal.tsx` | Update banner with replace + resend actions; remove `quote` regression |
| `src/components/labels/items/LabelItemCard.tsx` | Add "Replace Artwork" button for proof items |
| `src/hooks/labels/useProofingWorkflow.ts` | Add `useReplaceProofArtwork` mutation; update resend flow |
| `src/pages/labels/portal/ClientPortalDashboard.tsx` | Add `changes_requested` status config and portal visibility |
| `src/components/labels/portal/ClientItemCard.tsx` | Show revision messaging when order in `changes_requested` |
| `src/components/labels/items/LabelItemsGrid.tsx` | Wire replace artwork handler |

## Key Behaviors Summary

| Scenario | Order Status | Portal Visible? | Client Can Act? | Admin Can Act? |
|----------|-------------|-----------------|-----------------|----------------|
| Admin drafting | `quote` | No | No | Full edit |
| Proof sent | `pending_approval` | Yes | Approve/Reject | Locked (proof art) |
| Client rejects item(s) | `changes_requested` | Yes ("Changes Submitted") | Upload replacement art | Replace art, then Resend |
| Admin resends revised proof | `pending_approval` (v2) | Yes | Approve/Reject | Locked again |
| All items approved | `approved` | Yes | No | Production prep |
