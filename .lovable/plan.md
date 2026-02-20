
# Client Portal: Specs Confirmation + Reference/PO Fields

## Summary of What's Needed

The client portal's `ClientOrderDetail` page currently only shows:
- Orientation confirmation banner
- Label items for proofing
- A sidebar with Total Labels, Dieline, Substrate, Due Date

The user wants to add:
1. **Reference field** and **PO Number field** on the order (new DB columns required)
2. A rich **"Order Specifications" confirmation section** above the label items where the client confirms:
   - Material (substrate name)
   - Finishing (services like UV Varnish, Gloss Lam, etc.)
   - Core Size
   - Qty per Roll
   - Delivery method + address
3. Each spec item has an **inline confirm/flag toggle** — client clicks "Confirm" or "Flag as incorrect"
4. The proofs appear below this confirmed specs section

---

## Database Changes Required

Two new columns on `label_orders`:

```sql
ALTER TABLE label_orders 
  ADD COLUMN reference text,
  ADD COLUMN po_number text;
```

A new table to track client spec confirmations per order:

```sql
CREATE TABLE label_order_spec_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES label_orders(id) ON DELETE CASCADE,
  spec_key text NOT NULL,           -- 'material', 'finishing', 'core_size', 'qty_per_roll', 'delivery'
  status text NOT NULL DEFAULT 'pending',  -- 'confirmed' | 'flagged' | 'pending'
  flagged_comment text,
  confirmed_at timestamptz,
  confirmed_by text,                -- contact name from JWT
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(order_id, spec_key)
);
```

---

## Files to Change

### 1. Supabase Migration (new file)
`supabase/migrations/YYYYMMDD_label_order_reference_and_spec_confirmations.sql`
- Add `reference` and `po_number` columns to `label_orders`
- Create `label_order_spec_confirmations` table
- Enable RLS (service role access only — the edge function uses service role)

### 2. Edge Function: `supabase/functions/label-client-data/index.ts`
**Changes:**
- Update `GET /order/:id` select to include `services:label_order_services(*, finishing_option:label_finishing_options(id, display_name, category))`
- Add `GET /spec-confirmations/:orderId` — returns all spec confirmations for the order
- Add `POST /confirm-spec` — body: `{ order_id, spec_key, status: 'confirmed'|'flagged', comment? }` — upserts into `label_order_spec_confirmations`

### 3. Frontend Hook: `src/hooks/labels/useClientPortalData.ts`
Add two new hooks:
```ts
useClientPortalSpecConfirmations(orderId)   // GET /spec-confirmations/:orderId
useClientPortalConfirmSpec()                // POST /confirm-spec mutation
```

### 4. TypeScript Types: `src/types/labels.ts`
- Add `reference: string | null` and `po_number: string | null` to `LabelOrder` interface
- Add `SpecConfirmationStatus = 'pending' | 'confirmed' | 'flagged'`
- Add `LabelOrderSpecConfirmation` interface

### 5. New Component: `src/components/labels/portal/SpecsConfirmationCard.tsx`
A new self-contained card that displays each spec item with a confirm/flag widget. Structure:

```
┌─────────────────────────────────────────────────────────────────┐
│  Order Specifications                     ⚠ 3 pending           │
│  Please review and confirm each of the following before your     │
│  artwork approval can be finalised.                             │
├─────────────────────────────────────────────────────────────────┤
│  Material          Semi Gloss                  [✓ Confirm] [⚑ Flag] │
│  Finishing         Gloss Lamination            [✓ Confirm] [⚑ Flag] │
│  Core Size         76mm                        [✓ Confirm] [⚑ Flag] │
│  Qty per Roll      1,000 labels/roll           [✓ Confirm] [⚑ Flag] │
│  Delivery          Courier                     [✓ Confirm] [⚑ Flag] │
│    Address: 42 Example St, Johannesburg...                      │
└─────────────────────────────────────────────────────────────────┘
```

- Green border + "Confirmed" badge when all confirmed  
- Amber border + count badge when some pending  
- Red badge when any flagged (prompts Impress to follow up)  
- For "Delivery" row: if method is courier/local, shows the delivery address and notes underneath  
- Matches the existing `OrientationConfirmBanner` glassmorphic style: `rounded-2xl border-2 bg-white/70 backdrop-blur shadow-[...]`

**Each row** shows:
- Spec label (left)
- Value (center)
- Status: if pending → two small buttons "Confirm" / "Flag"; if confirmed → green ✓ badge; if flagged → red ⚑ badge + small comment (editable)

Flagging opens an inline textarea for the comment (no dialog, inline expand).

### 6. Admin Side: `src/components/labels/order/OrderSpecsPage.tsx`
- Add **Reference** and **PO Number** editable fields to the "Customer & Order" card (below WO Number row)
- These are plain `<Input>` fields with `onBlur` save, same pattern as existing fields

### 7. Client Portal Page: `src/pages/labels/portal/ClientOrderDetail.tsx`
**Layout changes:**
- The `<main>` grid stays `lg:grid-cols-3`
- In the left column (`lg:col-span-2`), insert `<SpecsConfirmationCard>` **between** the `OrientationConfirmBanner` and the `Label Items` card  
- The sidebar "Order Summary" card is **expanded** to also show Reference and PO Number (if set)
- The sidebar also shows a "Specs Status" indicator: how many specs are confirmed/total

**Sidebar Order Summary update:**
```
Order Summary
─────────────
Reference      ABC-123
PO Number      PO-9876
─────────────
Total Labels   24,500
Dieline        70×100mm - 4 Across × 3 Around
Substrate      Semi Gloss
─────────────
Due Date       15 Mar 2026
```

### 8. Edge Function and New Confirm-Spec Endpoint Logic

```
POST /confirm-spec
Body: { order_id, spec_key, status: 'confirmed'|'flagged', comment? }

1. Verify order belongs to this customer
2. Upsert into label_order_spec_confirmations (order_id, spec_key) with status/comment/confirmed_at/confirmed_by
3. Return { success: true }
```

---

## Spec Keys and Their Source Values

| spec_key | Label shown | Value source |
|---|---|---|
| `material` | Material | `order.substrate.name` |
| `finishing` | Finishing | `order.services` joined finishing names (or "No additional finishing") |
| `core_size` | Core Size | `order.core_size_mm` + "mm" (skip if null) |
| `qty_per_roll` | Qty per Roll | `order.qty_per_roll` (skip if null) |
| `delivery` | Delivery | `order.delivery_method` + address if courier/local |

Specs where the value is null/unset are **omitted** from the confirmation widget (they haven't been configured by admin yet).

---

## Visual Flow on Client Portal (After Changes)

```
[Workflow Stepper: Upload → Review → Approve → Production]

[Label Orientation  ✓ Confirmed / ⚠ Needs Confirmation]

[Order Specifications — 5/5 Confirmed ✓]
  Material     Semi Gloss                ✓ Confirmed
  Finishing    Gloss Lamination          ✓ Confirmed
  Core Size    76mm                      ✓ Confirmed
  Qty/Roll     1,000 labels              ⚑ Flagged — "We use 500/roll"
  Delivery     Courier                   ✓ Confirmed
               42 Example St, JHB

[Label Items — 10 items]
  [Select All checkbox]
  [Item cards...]

[Sidebar: Order Summary]
  Reference   ABC-123
  PO Number   PO-9876
  ─────────────────────
  Total Labels 24,500
  Dieline      70×100mm...
  Substrate    Semi Gloss
  Due Date     15 Mar 2026
  ─────────────────────
  Specs 4/5 Confirmed ⚠
```

---

## Implementation Sequence

1. Run SQL migration (reference/PO columns + spec_confirmations table)
2. Update edge function (add services join, two new routes)
3. Deploy edge function
4. Add TypeScript types
5. Add frontend hooks (`useClientPortalSpecConfirmations`, `useClientPortalConfirmSpec`)
6. Build `SpecsConfirmationCard` component
7. Update `ClientOrderDetail` to include the card + expanded sidebar
8. Update `OrderSpecsPage` (admin) to show Reference + PO Number fields
