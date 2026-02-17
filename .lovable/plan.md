

# Allow Clients to Change Orientation in the Portal

## Problem
Currently the client portal shows the orientation and lets clients confirm it, but there is no way for them to change it to a different position before confirming. If the admin set the wrong one, the client has no way to correct it.

## Solution
Add the full `OrientationPicker` component to the `OrientationConfirmBanner` so clients can select a different orientation before clicking "Confirm". The edge function endpoint will be updated to accept an optional `orientation` value alongside the confirmation.

---

## Changes

### 1. Update Edge Function: `/confirm-orientation`

In `supabase/functions/label-client-data/index.ts`, modify the `/confirm-orientation` handler to accept an optional `orientation` field (1-8) in the request body. When provided, it updates both `orientation` and `orientation_confirmed`; otherwise it just confirms the current value.

### 2. Update `useClientPortalConfirmOrientation` hook

In `src/hooks/labels/useClientPortalData.ts`, change the mutation to accept an object `{ orderId: string; orientation?: number }` instead of just a string, so the selected orientation can be passed through.

### 3. Update `OrientationConfirmBanner` component

In `src/components/labels/portal/OrientationConfirmBanner.tsx`:
- Add the `OrientationPicker` (full-size, interactive) above the confirm button when not yet confirmed
- Track the client's selected orientation in local state (initialized from the prop)
- Pass the selected orientation to `onConfirm`
- Once confirmed, show the picker in `readOnly` mode

### 4. Update `ClientOrderDetail` to pass the new signature

In `src/pages/labels/portal/ClientOrderDetail.tsx`, update the `onConfirm` callback to pass the selected orientation value to the mutation.

---

## Technical Details

### Edge function change (confirm-orientation handler)
```typescript
// Accept: { order_id, orientation? }
// If orientation provided and valid (1-8), update both fields
// Otherwise just set orientation_confirmed = true
```

### Hook signature change
```typescript
// Before: mutateAsync(orderId: string)
// After:  mutateAsync({ orderId: string, orientation?: number })
```

### OrientationConfirmBanner prop change
```typescript
// onConfirm changes from () => Promise<void>
// to (selectedOrientation: number) => Promise<void>
```

### Files to modify
- `supabase/functions/label-client-data/index.ts` -- accept orientation in confirm endpoint
- `src/hooks/labels/useClientPortalData.ts` -- update mutation signature
- `src/components/labels/portal/OrientationConfirmBanner.tsx` -- add interactive picker
- `src/pages/labels/portal/ClientOrderDetail.tsx` -- wire up new signature

