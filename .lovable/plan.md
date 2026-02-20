
# Fix: Label Order Modal Crashes

## Root Cause — Two Distinct Bugs

### Bug 1: Opening existing orders crashes (the main error)
**Error:** `A <Select.Item /> must have a value prop that is not an empty string`

**Cause:** Radix UI's `<Select>` component has a hard constraint — `<SelectItem value="">` is **not permitted**. The new Summary card has three selects (Core Size, Roll Direction, Delivery Method) where:
1. The `value` prop is set to `""` when the DB field is `null` → `(order as any).core_size_mm ?? ''` → `""`
2. There's a `<SelectItem value="">Not specified</SelectItem>` as a "clear" option — this is what crashes Radix UI

Every existing order has these three fields as `null`, so all three selects immediately render with `value=""` and a `<SelectItem value="">` — crashing before the modal body even renders.

### Bug 2: Creating a new order, "Next" step crashes
After creating an order, `LabelsOrders.tsx` opens the `LabelOrderModal` with the new `orderId`. The modal immediately tries to render the same three broken selects — same crash.

---

## The Fix — Two-Part Approach

### Part 1: Replace `<SelectItem value="">` with a proper sentinel value

Radix UI requires every `SelectItem.value` to be a **non-empty string**. The correct pattern is to use a sentinel like `"none"` and translate it back to `null` on save:

```tsx
// BEFORE (crashes):
<Select value={(order as any).roll_direction ?? ''}>
  <SelectContent>
    <SelectItem value="">Not specified</SelectItem>   ← CRASH
    <SelectItem value="face_in">Face In</SelectItem>
  </SelectContent>
</Select>

// AFTER (correct):
<Select value={(order as any).roll_direction ?? 'none'}>
  <SelectContent>
    <SelectItem value="none">Not specified</SelectItem>  ← OK
    <SelectItem value="face_in">Face In</SelectItem>
  </SelectContent>
</Select>
// And in onValueChange: save null when value === 'none'
```

All three selects (Core Size, Roll Direction, Delivery Method) need this fix applied.

### Part 2: Fix the `value` prop passed to `<Select>` itself

When the DB field is null, the value must also be the sentinel:

```tsx
// Core Size: String(null ?? '') = "0" or "" — both wrong
// Fix:
value={order.core_size_mm ? String(order.core_size_mm) : 'none'}

// Roll Direction:
value={order.roll_direction ?? 'none'}

// Delivery Method:
value={order.delivery_method ?? 'none'}
```

---

## Files to Change

Only **one file** needs editing:

| File | Change |
|------|--------|
| `src/components/labels/order/LabelOrderModal.tsx` | Fix 3 `<Select>` components at lines 767-823 — replace empty string sentinel with `'none'` sentinel, update `onValueChange` handlers to convert `'none'` back to `null` |

### Exact changes at each Select (lines 766-823):

**Core Size Select (lines 767-776):**
- `value={String((order as any).core_size_mm ?? '')}` → `value={order.core_size_mm ? String(order.core_size_mm) : 'none'}`
- `<SelectItem value="">Not specified</SelectItem>` → `<SelectItem value="none">Not specified</SelectItem>`
- `onValueChange`: when `v === 'none'`, save `null`; otherwise `parseInt(v)`

**Roll Direction Select (lines 795-805):**
- `value={(order as any).roll_direction ?? ''}` → `value={(order as any).roll_direction ?? 'none'}`
- `<SelectItem value="">Not specified</SelectItem>` → `<SelectItem value="none">Not specified</SelectItem>`
- `onValueChange`: when `v === 'none'`, save `null`; otherwise save `v`

**Delivery Method Select (lines 810-822):**
- `value={(order as any).delivery_method ?? ''}` → `value={(order as any).delivery_method ?? 'none'}`
- `<SelectItem value="">Not specified</SelectItem>` → `<SelectItem value="none">Not specified</SelectItem>`
- `onValueChange`: when `v === 'none'`, save `null`; otherwise save `v`

---

## Why this won't break anything else

- The `orientation` system is untouched — it uses a numeric `1-8` value, not a string select
- The `ink_config` select already has proper non-empty values (`'CMYK'`, etc.) — no change needed
- The three new fields save `null` to the database when "Not specified" is chosen — identical to before, just via `'none'` sentinel instead of `''`
- This is a pure UI fix — no database schema or hook changes required
