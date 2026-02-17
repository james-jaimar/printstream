

# Label Orientation (Rewind Direction) Feature

## Overview
Add a "rewind direction" / orientation selector (positions 1-8) to the label order workflow. This is a critical production attribute -- if wrong, the entire print run is wasted. The 8 SVG graphics will be stored as project assets and displayed as a clickable row. It defaults to position 1 ("Outwound, Head to Lead") and must be confirmed by the client in the portal.

---

## What the 8 orientations represent

| # | Winding | Direction |
|---|---------|-----------|
| 1 | Outwound | Head to Lead |
| 2 | Outwound | Foot to Lead |
| 3 | Outwound | Right to Lead |
| 4 | Outwound | Left to Lead |
| 5 | Inwound | Head to Lead |
| 6 | Inwound | Foot to Lead |
| 7 | Inwound | Right to Lead |
| 8 | Inwound | Left to Lead |

---

## Implementation Steps

### 1. Database: Add `orientation` column to `label_orders`

Add a new column `orientation` (integer, default 1, not null) to the `label_orders` table and a boolean `orientation_confirmed` (default false) to track client confirmation.

```sql
ALTER TABLE label_orders
  ADD COLUMN orientation smallint NOT NULL DEFAULT 1,
  ADD COLUMN orientation_confirmed boolean NOT NULL DEFAULT false;
```

### 2. Copy SVG assets into `src/assets/orientations/`

Copy all 8 uploaded SVGs into the project under `src/assets/orientations/` with clean filenames (e.g., `orientation-1.svg` through `orientation-8.svg`).

### 3. Create shared `OrientationPicker` component

Build `src/components/labels/OrientationPicker.tsx` -- a reusable component that:
- Displays all 8 SVGs in a single horizontal row (scrollable on mobile)
- Each tile shows the SVG, the number, and a short label (e.g., "Outwound / Head to Lead")
- The selected orientation gets a teal highlight ring + check indicator
- Accepts `value`, `onChange`, `readOnly`, and `size` ('sm' | 'md') props
- In `readOnly` mode (for the portal confirmation step), tiles are not clickable but the current selection is highlighted

### 4. Create `OrientationConfirmBanner` component

Build `src/components/labels/portal/OrientationConfirmBanner.tsx` for the client portal:
- Shows prominently at the top of the order detail page (before items)
- Displays the selected orientation SVG large and centred with descriptive text
- Has a clear "Confirm Orientation" button with a warning message about the consequence of wrong orientation
- Once confirmed, shows a green "Confirmed" badge instead of the button
- If not confirmed, blocks the final approval flow (or shows a warning)

### 5. Update TypeScript types

In `src/types/labels.ts`:
- Add `orientation: number` and `orientation_confirmed: boolean` to `LabelOrder` interface
- Add `orientation?: number` to `CreateLabelOrderInput` interface

Update `src/integrations/supabase/types.ts` (auto-generated, but will need the new columns reflected).

### 6. Update `NewLabelOrderDialog` (admin order creation)

Add the `OrientationPicker` to the "Print Specifications" section of the new order form:
- Add `orientation` field to the zod schema (default: 1)
- Render the picker below the existing dieline/substrate fields
- Pass the selected value when creating the order

### 7. Update `LabelOrderModal` (admin order detail view)

Show orientation prominently in the order detail:
- Add orientation display in the "Print Specifications" info card, showing the selected SVG + label
- Add an editable `OrientationPicker` (compact `size="sm"`) that allows admins to change it while in `quote` status
- Show a warning badge if `orientation_confirmed` is still false when the order moves past `pending_approval`

### 8. Update `ClientOrderDetail` (client portal)

Add the `OrientationConfirmBanner` at the top of the order detail page (between the workflow stepper and the items section):
- Shows the currently selected orientation prominently
- Client must click "Confirm Orientation" which updates `orientation_confirmed = true` on the order
- If not confirmed, the approval toolbar shows a warning: "Please confirm label orientation before approving"
- The confirmation is a separate action from item approval (it's order-level, not item-level)

### 9. Update `ClientPortalDashboard`

On the dashboard order cards/rows, show a small orientation indicator (the SVG thumbnail + number) so clients can see at a glance what orientation is set.

### 10. Update hooks

- `useCreateLabelOrder`: pass `orientation` in the insert
- `useUpdateLabelOrder`: already handles partial updates (no change needed)
- `useClientPortalOrder`: ensure the `orientation` and `orientation_confirmed` fields are returned
- Add a new `useConfirmOrientation` mutation (or reuse `useUpdateLabelOrder` via the client portal hook) that sets `orientation_confirmed = true`

---

## Technical Details

### OrientationPicker component API

```typescript
interface OrientationPickerProps {
  value: number;            // 1-8
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md';      // sm for inline admin, md for portal
  className?: string;
}
```

### Orientation metadata constant

```typescript
export const LABEL_ORIENTATIONS = [
  { number: 1, winding: 'Outwound', direction: 'Head to Lead' },
  { number: 2, winding: 'Outwound', direction: 'Foot to Lead' },
  { number: 3, winding: 'Outwound', direction: 'Right to Lead' },
  { number: 4, winding: 'Outwound', direction: 'Left to Lead' },
  { number: 5, winding: 'Inwound',  direction: 'Head to Lead' },
  { number: 6, winding: 'Inwound',  direction: 'Foot to Lead' },
  { number: 7, winding: 'Inwound',  direction: 'Right to Lead' },
  { number: 8, winding: 'Inwound',  direction: 'Left to Lead' },
] as const;
```

### Files to create
- `src/assets/orientations/orientation-1.svg` through `orientation-8.svg` (8 files)
- `src/components/labels/OrientationPicker.tsx`
- `src/components/labels/portal/OrientationConfirmBanner.tsx`
- Migration SQL file

### Files to modify
- `src/types/labels.ts` -- add orientation fields
- `src/integrations/supabase/types.ts` -- will be regenerated
- `src/components/labels/NewLabelOrderDialog.tsx` -- add picker to form
- `src/components/labels/order/LabelOrderModal.tsx` -- show orientation in specs card + editable picker
- `src/pages/labels/portal/ClientOrderDetail.tsx` -- add confirm banner
- `src/pages/labels/portal/ClientPortalDashboard.tsx` -- show orientation indicator on orders
- `src/hooks/labels/useLabelOrders.ts` -- pass orientation on create

