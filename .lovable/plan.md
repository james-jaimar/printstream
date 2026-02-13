

# Client Portal Upgrade - Full Proofing & Approval Experience

## Overview

Transform the existing basic client portal into a full-featured proofing and approval experience. Currently the portal only supports order-level approve/reject. This upgrade adds item-level granularity, artwork uploads, legal disclaimers, and auto-imposition triggering.

## What Changes

### 1. Enhanced Order Detail Page (Major Rewrite)
**File: `src/pages/labels/portal/ClientOrderDetail.tsx`**

Rebuild the order detail page with:
- **Item cards with proof thumbnails**: Each item shows its proof artwork (using `proof_pdf_url` or `artwork_pdf_url` with signed URLs), dimensions, quantity
- **Per-item approval controls**: Each item gets its own Approve / Request Changes buttons
- **"Approve All" bulk action**: A single button to approve all pending items at once
- **Per-item artwork upload**: When requesting changes, clients can upload replacement artwork directly
- **Approval disclaimer dialog**: Before final approval, show a legal disclaimer ("Once approved, artwork cannot be amended and will proceed directly into production...")
- **Status indicators per item**: Show proofing_status badges (awaiting, approved, needs changes) on each item card
- **Proof PDF viewer**: Link to view/download each item's proof PDF

### 2. New Edge Function Endpoints
**File: `supabase/functions/label-client-data/index.ts`**

Add these new routes:

- **POST `/approve-items`**: Accept `{ order_id, item_ids, action, comment? }` to approve or reject specific items (not just the whole order). Updates `proofing_status` on each item. When all items are approved, auto-updates order status and triggers imposition if print-ready artwork exists.
- **POST `/upload-artwork`**: Accept multipart form data with `order_id`, `item_id`, and a PDF file. Uploads to `label-files` storage bucket, updates the item's `artwork_pdf_url`, resets `proofing_status` to `pending`, and sets `artwork_source` to `client`.
- **GET `/signed-url`**: Accept `{ path }` query param, returns a temporary signed URL for accessing files in the private `label-files` bucket. Validates the file belongs to an order owned by the customer.

### 3. Updated Client Data Hook
**File: `src/hooks/labels/useClientPortalData.ts`**

Add new mutations:
- `useClientPortalApproveItems()` - POST to `/approve-items` with item-level granularity
- `useClientPortalUploadArtwork()` - POST to `/upload-artwork` with file upload
- `useClientSignedUrl()` - GET signed URLs for viewing proof files

### 4. New Portal Components
**File: `src/components/labels/portal/ClientItemCard.tsx`** (new)
- Displays individual item with thumbnail, name, qty, dimensions
- Shows proofing status badge
- Approve/Request Changes buttons when status is `awaiting_client`
- Upload artwork button when status is `client_needs_upload`

**File: `src/components/labels/portal/ApprovalDisclaimer.tsx`** (new)
- Alert dialog with legal disclaimer text
- Checkbox to confirm understanding
- Confirm button to finalize approval
- Text: "By approving this proof, you confirm that the artwork, colours, text, and layout are correct. Once approved, no amendments can be made and the order will proceed directly into production. [Company] accepts no liability for errors not identified prior to approval."

**File: `src/components/labels/portal/ClientArtworkUpload.tsx`** (new)
- File input for PDF uploads
- Upload progress indicator
- Calls the `/upload-artwork` endpoint via the edge function

### 5. Auto-Imposition Trigger
When all items in an order are approved via the portal AND print-ready artwork exists for all items:
- The edge function will check if all items have `print_pdf_url` populated
- If yes, it invokes the existing `label-impose` edge function for each run
- This mirrors the "Send to Print" batch action but triggered automatically from client approval
- If not all print-ready files exist, order simply moves to `approved` status for admin to handle

### 6. Signed URL Support for Proof Viewing
Since `label-files` is a private bucket, proof thumbnails and PDFs need signed URLs. The edge function will:
- Generate signed URLs when returning order/item data
- Include `signed_proof_url` and `signed_thumbnail_url` in item responses
- URLs valid for 1 hour

## Technical Flow

```text
Client views order
  |
  v
Items displayed with proof thumbnails (via signed URLs)
  |
  +-- Per item: [Approve] or [Request Changes]
  |     |
  |     +-- Approve --> Disclaimer dialog --> Confirm
  |     |                                      |
  |     |                                      v
  |     |                            Update item proofing_status = 'approved'
  |     |                            Check if ALL items approved
  |     |                              |
  |     |                              +-- Yes: Update order status
  |     |                              |         Check print-ready files
  |     |                              |         Auto-impose if ready
  |     |                              +-- No: Continue
  |     |
  |     +-- Request Changes --> Comment + optional file upload
  |                              |
  |                              v
  |                     Update proofing_status = 'client_needs_upload'
  |                     Notify admin
  |
  +-- [Approve All] --> Disclaimer --> Approve all pending items
  |
  +-- [Upload Artwork] (per item) --> Upload PDF --> Reset status
```

## Summary of Files

| File | Action |
|------|--------|
| `src/pages/labels/portal/ClientOrderDetail.tsx` | Major rewrite - item-level UI |
| `supabase/functions/label-client-data/index.ts` | Add 3 new endpoints |
| `src/hooks/labels/useClientPortalData.ts` | Add 3 new hooks |
| `src/components/labels/portal/ClientItemCard.tsx` | New component |
| `src/components/labels/portal/ApprovalDisclaimer.tsx` | New component |
| `src/components/labels/portal/ClientArtworkUpload.tsx` | New component |

