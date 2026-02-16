

# Client Portal Makeover: E-Commerce Style Login and Proofing Workflow

## Overview

Transform the client portal into a polished, e-commerce-grade experience with a stunning login page, proper order visibility filtering, and a refined proofing workflow.

## What Changes

### 1. Fabulous Login Page (`ClientPortalLogin.tsx`)

Complete visual redesign of the login page:

- Full-screen split layout: branded hero panel on the left, login form on the right
- Company branding with a gradient hero section, tagline, and feature highlights (e.g. "Review proofs", "Track orders", "Approve artwork")
- Larger, more spacious form with subtle animations
- Polished input styling with icons (Mail, Lock)
- "Forgot password" flow remains but visually integrated into the new layout
- Responsive: on mobile, hero stacks above the form
- Dark/light mode compatible using existing Tailwind theme tokens

### 2. Order Visibility Filter (Edge Function)

**Key change**: Clients should only see orders that are ready for their review, not internal drafts.

Update `label-client-data/index.ts` `/orders` endpoint to filter out orders in early internal statuses:
- Exclude orders with status `quote` -- these are internal-only
- Only return orders where at least one item has a `proofing_status` of `awaiting_client`, `approved`, or `client_needs_upload`, OR the order status is `pending_approval`, `approved`, `in_production`, or `completed`
- This ensures clients never see orders still being prepared internally

### 3. Dashboard Polish (`ClientPortalDashboard.tsx`)

- Add a welcome hero section with the client's company name and a summary (e.g. "2 orders need your attention")
- Visual order status timeline/progress indicator on each card
- Separate sections: "Action Required" (needs approval/upload), "In Progress" (in production), "Completed"
- Empty state with friendly illustration messaging
- Add subtle hover animations on order cards

### 4. Order Detail Proofing Experience (`ClientOrderDetail.tsx`)

- Add a progress stepper at the top showing the proofing workflow stages (Upload > Review > Approve > Production)
- Larger proof thumbnails with click-to-zoom (lightbox-style overlay)
- Clearer quantity display per item with label dimensions
- Sticky approval toolbar at the bottom when items are selected
- Better visual distinction between approved items (green tint) and items needing attention (amber/red)

### 5. Item Card Enhancement (`ClientItemCard.tsx`)

- Larger thumbnail preview area (clickable for full-size view)
- Clearer status badges with colour coding
- Better layout of item metadata (name, qty, dimensions) in a clean grid
- Upload area with drag-and-drop visual feedback (for `client_needs_upload` status)

## Technical Details

### Files Modified

| File | Changes |
|------|---------|
| `src/pages/labels/portal/ClientPortalLogin.tsx` | Complete visual redesign with split-panel layout |
| `src/pages/labels/portal/ClientPortalDashboard.tsx` | Welcome hero, categorised order sections, progress indicators |
| `src/pages/labels/portal/ClientOrderDetail.tsx` | Progress stepper, larger thumbnails, sticky approval bar |
| `src/components/labels/portal/ClientItemCard.tsx` | Bigger thumbnails, click-to-zoom, improved layout |
| `supabase/functions/label-client-data/index.ts` | Filter `/orders` to exclude internal-only statuses |

### Edge Function Filter Logic

```sql
-- Only return orders visible to clients
-- Either the order status indicates it's been shared with the client,
-- or at least one item is in a client-facing proofing state
.in('status', ['pending_approval', 'approved', 'in_production', 'completed'])
```

Orders in `quote` status are purely internal and will be hidden from the portal until the admin moves them forward.

### No Database Changes Required

All changes are purely UI and edge function filtering logic. No new tables or columns needed.

