
# Enhanced Labels Proofing & Artwork Workflow

## Understanding Your Requirements

Based on your message and the screenshot, here's what you need:

1. **Dual Upload Zones**: 
   - Current zone = Proof Artwork (client-facing, may have dielines - NEVER used for printing)
   - New zone = Print-Ready Artwork (clean files for production output)

2. **Proofing Workflow**:
   - Admin marks items as "Ready for Proofing"
   - Admin selects contacts to notify (checkboxes from customer's contact list)
   - System sends email notifications to selected contacts
   - Clients log in, view proofs, approve or reject (with mandatory comments)
   - If admin flags artwork as wrong size, client sees message to upload new artwork

3. **Client Artwork Upload**:
   - When proof is rejected or admin requests new artwork, clients can upload directly
   - New uploads reset status to pending for admin review
   - Cycle repeats until approval

4. **AI Layout**:
   - Works with either proof OR print-ready artwork
   - Final imposition will always use print-ready artwork

---

## Database Changes

### New Columns on `label_items`
```sql
-- Add proofing status field (separate from print readiness)
ALTER TABLE label_items
ADD COLUMN proofing_status text DEFAULT 'draft' 
  CHECK (proofing_status IN ('draft', 'ready_for_proof', 'awaiting_client', 'client_needs_upload', 'approved'));
```

### New Table: `label_proofing_requests`
Track proofing workflows per order:
```sql
CREATE TABLE label_proofing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES label_orders(id) ON DELETE CASCADE NOT NULL,
  requested_by uuid REFERENCES auth.users(id),
  message text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'approved', 'changes_needed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Track which contacts were notified
CREATE TABLE label_proofing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES label_proofing_requests(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES label_customer_contacts(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  sent_at timestamptz,
  viewed_at timestamptz,
  UNIQUE(request_id, contact_id)
);
```

---

## UI Components to Create/Update

### 1. Dual Upload Zone Component
**File: `src/components/labels/items/DualArtworkUploadZone.tsx`**

Two distinct upload areas:
```text
┌─────────────────────────────────────────────────────────────────────┐
│  PROOF ARTWORK (Client-Facing)                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Drop PDF files here]                                       │   │
│  │  These files will be shown to clients for approval           │   │
│  │  May include dieline overlays                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  PRINT-READY ARTWORK (Production)                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Drop PDF files here]                                       │   │
│  │  Clean artwork to exact bleed specifications                 │   │
│  │  These files will be used for final imposition               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Enhanced Item Card
**Update: `src/components/labels/items/LabelItemCard.tsx`**

Show both proof and print artwork status:
```text
┌─────────────────────┐
│   [proof thumbnail] │
│                     │
│  Item Name          │
│  Qty: 4300          │
│                     │
│  ┌───────────────┐  │
│  │ Proof: ✓      │  │
│  │ Print: ⏳     │  │
│  │ Status: Draft │  │
│  └───────────────┘  │
│                     │
│  [Upload Print PDF] │
└─────────────────────┘
```

### 3. Send Proofing Dialog
**New: `src/components/labels/proofing/SendProofingDialog.tsx`**

```text
┌─────────────────────────────────────────────────────────────┐
│  Send Proof for Approval                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Order: LBL-2026-0003                                       │
│  Items ready for proofing: 3                                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Select Contacts to Notify:                                 │
│                                                             │
│  ☑ John Smith (john@company.com)                           │
│    ✓ Receives proofs  ✓ Can approve                        │
│                                                             │
│  ☐ Jane Doe (jane@company.com)                             │
│    ✓ Receives proofs  ✗ Cannot approve                     │
│                                                             │
│  ☐ Admin Contact (admin@company.com)                       │
│    ✓ Receives proofs  ✓ Can approve                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Optional Message:                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Please review the attached proofs...                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Cancel]                          [Send Proof Notification]│
└─────────────────────────────────────────────────────────────┘
```

### 4. Request New Artwork Dialog
**New: `src/components/labels/proofing/RequestArtworkDialog.tsx`**

Admin can flag items as needing new artwork:
```text
┌─────────────────────────────────────────────────────────────┐
│  Request New Artwork from Client                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Select Items:                                              │
│  ☑ Eazi Tool BLUE (4300) - Artwork too small               │
│  ☐ Eazi Tool Black (5000) - OK                             │
│  ☑ Eazi Tool BROWN (3300) - Missing bleed                  │
│                                                             │
│  Reason to send to client:                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Please upload corrected artwork with 3mm bleed      │   │
│  │ all around. Current files are missing bleed area.   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Cancel]                              [Request New Artwork]│
└─────────────────────────────────────────────────────────────┘
```

### 5. Enhanced Client Portal Order Detail
**Update: `src/pages/labels/portal/ClientOrderDetail.tsx`**

Client sees status and can upload when requested:
```text
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ New Artwork Requested                                   │
│                                                             │
│  The following items need updated artwork:                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Eazi Tool BLUE                                      │   │
│  │  Issue: Artwork too small - needs 103×53mm with bleed│   │
│  │                                                       │   │
│  │  [Current Proof]  [Upload New Artwork ↑]             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Eazi Tool BROWN                                     │   │
│  │  Issue: Missing bleed - please add 3mm bleed         │   │
│  │                                                       │   │
│  │  [Current Proof]  [Upload New Artwork ↑]             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Functions

### Update: `label-notify`
Add support for `proof_request` notification type that:
- Sends to multiple contacts
- Includes optional custom message
- Links to authenticated client portal

### New: `label-client-upload`
Handle client artwork uploads:
- Validate against dieline specs
- Set `artwork_source = 'client'`
- Set `proofing_status = 'draft'` (pending admin review)
- Notify admin that new artwork was uploaded

---

## Workflow States

### Item Proofing Status Flow
```text
DRAFT ──────────────────────────────────────────────────────────────┐
   │ Admin uploads proof                                            │
   ▼                                                                │
READY_FOR_PROOF ────────────────────────────────────────────────────┤
   │ Admin sends proof notification                                 │
   ▼                                                                │
AWAITING_CLIENT ────────────────────────────────────────────────────┤
   │                                                                │
   ├──► Client Approves ──► APPROVED                                │
   │                                                                │
   └──► Client Rejects OR Admin requests new artwork                │
        │                                                           │
        ▼                                                           │
CLIENT_NEEDS_UPLOAD                                                 │
        │ Client uploads new artwork                                │
        │                                                           │
        └──► DRAFT (cycle repeats)                                  │
```

### Print PDF Status (Separate Track)
```text
PENDING ──► NEEDS_CROP ──► PROCESSING ──► READY
                │                            │
                └──► (Admin uploads clean file directly)
```

---

## File Changes Summary

| Type | File | Change |
|------|------|--------|
| DB | Migration | Add `proofing_status`, create proofing tables |
| Component | `DualArtworkUploadZone.tsx` | New - two upload areas |
| Component | `SendProofingDialog.tsx` | New - contact selection + notify |
| Component | `RequestArtworkDialog.tsx` | New - flag items for re-upload |
| Component | `LabelItemCard.tsx` | Update - show proof/print/status |
| Component | `LabelOrderModal.tsx` | Update - use dual upload, add proof buttons |
| Page | `ClientOrderDetail.tsx` | Update - show messages, enable uploads |
| Hook | `useProofingWorkflow.ts` | New - manage proofing state |
| Edge | `label-notify/index.ts` | Update - multi-contact proof_request |
| Edge | `label-client-upload/index.ts` | New - handle client uploads |

---

## Header Actions

Update the order modal header to include:
```text
┌─────────────────────────────────────────────────────────────────────┐
│ LBL-2026-0003  [Quote]                                              │
│ Jaimar                                                              │
│                                                                     │
│              [Request Artwork] [Send Proof] [AI Layout] [×]         │
└─────────────────────────────────────────────────────────────────────┘
```

- **Request Artwork**: Opens dialog to flag items and notify client to upload
- **Send Proof**: Opens dialog to select contacts and send proof notification
- **AI Layout**: Existing optimizer (works with proof OR print files)

---

## Implementation Order

1. **Database migration** - Add proofing_status, create tracking tables
2. **Types & Hooks** - Update interfaces, create useProofingWorkflow
3. **DualArtworkUploadZone** - Split upload into proof/print areas
4. **LabelItemCard updates** - Show all status indicators
5. **SendProofingDialog** - Contact selection and notification
6. **RequestArtworkDialog** - Flag items for client re-upload
7. **ClientOrderDetail updates** - Show messages, enable client uploads
8. **Edge function updates** - Multi-contact notifications, client upload handling

This architecture ensures:
- Clear separation between proof (client-facing) and print (production) artwork
- Full tracking of proofing workflow with contact notifications
- Client self-service for artwork uploads when requested
- Admin always maintains control over final print files
