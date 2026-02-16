

# Client Portal: Security Fix, Item Count Fix, and Premium UI Redesign

## Overview

Three critical fixes addressing security exposure, data accuracy, and user experience quality.

---

## 1. Security Fix: Stop Exposing Direct Supabase Storage URLs

**Problem**: When a client clicks "View Proof PDF", the browser navigates directly to `kgizusgqexmlfcqfjopk.supabase.co/storage/v1/object/...` -- exposing the Supabase project URL and storage structure. This is a security risk.

**Fix**: 
- In `ClientItemCard.tsx`, the "View Proof PDF" link should ONLY use signed URLs (`signed_proof_pdf_url` / `signed_artwork_pdf_url`). Remove the fallback to raw `proof_pdf_url` / `artwork_pdf_url`.
- The edge function already generates signed URLs via `enrichItemsWithSignedUrls`. Signed URLs are time-limited (1 hour) and don't expose the raw storage path in the same way.
- If no signed URL is available, hide the "View Proof PDF" link entirely rather than exposing a raw URL.

**Files**: `src/components/labels/portal/ClientItemCard.tsx`

---

## 2. Fix "25 Items" Count on Dashboard

**Problem**: The `/orders` endpoint does NOT filter parent items (only `/order/:id` does). The dashboard reads `order.items?.length` which includes the parent PDF.

**Fix**:
- Add the same parent-item filter to the `/orders` endpoint in `label-client-data/index.ts`
- Also filter in the dashboard's `renderOrderCard` and `needsAction` functions for consistency

**Files**: `supabase/functions/label-client-data/index.ts`, `src/pages/labels/portal/ClientPortalDashboard.tsx`

---

## 3. Premium Portal UI Redesign

Transform the sparse portal into a polished, premium client experience.

### Dashboard (`ClientPortalDashboard.tsx`)
- Use the Impress logo in the header instead of a generic Package icon
- Add branded header bar with company colors (`#00B8D4` teal)
- Larger, more visual order cards with thumbnail previews from the first item
- Better typography and spacing
- Show item count correctly (filtered)
- Add a footer with company contact info

### Order Detail (`ClientOrderDetail.tsx`)
- Branded header with Impress logo and teal accent
- Larger proof thumbnail gallery with grid layout instead of list
- Better visual hierarchy for the approval workflow
- More polished stepper with larger icons and clearer states
- Card-based item layout with larger thumbnails (grid of proof images)
- Sticky toolbar with gradient/blur effect

### Item Card (`ClientItemCard.tsx`)
- Larger thumbnail display (from 28x28 to bigger preview)
- Cleaner layout with better spacing
- Security-safe PDF links (signed URLs only)
- More prominent approve/reject buttons

**Files**: 
- `src/pages/labels/portal/ClientPortalDashboard.tsx`
- `src/pages/labels/portal/ClientOrderDetail.tsx`
- `src/components/labels/portal/ClientItemCard.tsx`

---

## Technical Details

### Security: Signed URL Only Pattern

```typescript
// ClientItemCard.tsx - ONLY use signed URLs
const pdfUrl = item.signed_proof_pdf_url || item.signed_artwork_pdf_url || null;
// Never fall back to raw item.proof_pdf_url
```

### Server-Side Item Filtering (both endpoints)

```typescript
// /orders endpoint - filter parent items from each order
if (data) {
  for (const order of data) {
    if (order.items) {
      order.items = order.items.filter(
        (item: any) => !(item.page_count > 1 && !item.parent_item_id)
      );
    }
  }
}
```

### Dashboard Item Count Fix

```typescript
// Filter items before counting
const visibleItems = (order.items || []).filter(
  i => !(i.page_count > 1 && !i.parent_item_id)
);
// Use visibleItems.length instead of order.items?.length
```

### Branded Header Component

Replace the generic Package icon header with the Impress logo and teal color scheme matching the existing `ProofViewerHeader.tsx` pattern. Use `import impressLogo from "@/assets/impress-logo-colour.png"`.

### Files Modified Summary

| File | Changes |
|------|---------|
| `src/components/labels/portal/ClientItemCard.tsx` | Only use signed URLs for PDF links; larger thumbnails; polished layout |
| `src/pages/labels/portal/ClientPortalDashboard.tsx` | Branded header; filter parent items; premium card layout; correct item count |
| `src/pages/labels/portal/ClientOrderDetail.tsx` | Branded header; premium grid layout for items; polished stepper |
| `supabase/functions/label-client-data/index.ts` | Filter parent items in `/orders` endpoint |

### No Database Changes Required

