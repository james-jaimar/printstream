
# ABG Machine: Die Cutting & Finishing Workflow Integration

## What We're Modelling

The ABG finishing machine is a single inline system that handles the entire post-print workflow in one pass:

```text
HP Indigo Roll (300/330mm wide)
         ↓
  [ABG Machine Pass]
  ├── Lamination / UV Varnish (optional, inline)
  ├── Die Cutting (semi-rotary, using the dieline template)
  └── Slitting → N rolls (N = dieline.columns_across)
         ↓
  Output: 5 separate 160mm rolls (for a 5-across dieline)
```

The critical calculation: **output rolls = dieline.columns_across × number of print runs**

---

## Changes Required

### 1. Rename "finishing" group → "die_cutting_finishing"

The `stage_group` value `'finishing'` in `label_production_stages` needs to become `'die_cutting_finishing'`. This affects:

- The `LabelStageGroup` type in `useLabelStages.ts`
- The `GROUP_LABELS` map in `LabelStageManagement.tsx` — label becomes **"Die Cutting & Finishing"**
- The existing seeded stages in the DB need a one-off migration UPDATE
- The `AddServiceDialog.tsx` service type description for 'finishing' → "Die cutting, lamination, UV varnish"

### 2. Add `abg_machine_speed_m_per_min` to the label constants

Add a new constant to `src/types/labels.ts`:

```ts
export const LABEL_FINISHING_CONSTANTS = {
  ABG_MACHINE_SPEED_M_PER_MIN: 30,  // default ABG run speed
  ABG_DIE_CUT_ALWAYS: true,          // die cutting is always part of ABG pass
} as const;
```

### 3. Add `output_rolls_count` to `label_orders` (new DB column)

**Why:** Output rolls is a derived value (dieline.columns_across × run count) BUT it can also be overridden if the operator decides to gang fewer rolls or the order has multiple runs. Storing it on the order makes it available for:
- Rewinding calculations
- AI layout optimizer (labels per output roll)
- Finishing service line auto-population
- Labour time warnings

New SQL migration:
```sql
ALTER TABLE label_orders
  ADD COLUMN IF NOT EXISTS output_rolls_count integer,
  ADD COLUMN IF NOT EXISTS abg_speed_m_per_min integer DEFAULT 30;
```

`output_rolls_count` = computed when layout is confirmed (dieline.columns_across × runs.length), but editable.
`abg_speed_m_per_min` = allows per-order speed override (default 30).

### 4. Surface "Output Rolls" and "Labels per Output Roll" in the Summary card

The Summary card in `LabelOrderModal.tsx` already has Core Size, Qty per Roll, Roll Direction, Delivery Method. We need to add:

- **Output Rolls**: auto-computed from `dieline.columns_across × (order.runs?.length || 1)`, displayed as a read-only badge + editable override input
- **Labels per Output Roll**: `= total_label_count / output_rolls_count` — shown with a **warning badge** if below a threshold (e.g. < 250 labels/roll = red warning "Very short rolls — consider joining")
- **ABG Speed**: small editable field (default 30 m/min) — used for finishing time estimation

The warning logic for short rolls is the key UX improvement:
```
< 100 labels/roll  → 🔴 "Very short — rewinding & joining required"
100–300 labels/roll → 🟡 "Short rolls — consider joining"  
> 300 labels/roll  → no warning
```

### 5. Update the "Die Cutting & Finishing" stage group display in admin

In `LabelStageManagement.tsx`, change:
- `GROUP_LABELS.finishing` → `'Die Cutting & Finishing'`
- Group badge color to something more distinctive (orange/amber)

The "finishing" service type in `AddServiceDialog.tsx` description changes to match.

### 6. Wire output_rolls_count into the rewinding service

When a user adds a "Rewinding" service via `AddServiceDialog`, the `quantity` field should **auto-populate** with the computed `output_rolls_count` from the order (currently you have to type it manually). This makes the flow much smoother.

Additionally, the "Rewinding" row in `FinishingServicesCard` should display a computed "labels/roll" figure if `qty_per_roll` is set.

### 7. Update `useLabelOrders.ts` create/update to pass new fields

The `useCreateLabelOrder` and `useUpdateLabelOrder` mutations need to pass `output_rolls_count` and `abg_speed_m_per_min` through to Supabase.

Also update `LabelOrder` type in `types/labels.ts` to include these two new fields.

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `supabase/migrations/[new].sql` | New | Add `output_rolls_count` + `abg_speed_m_per_min` to `label_orders`; UPDATE existing stages to rename group |
| `src/types/labels.ts` | Edit | Add `output_rolls_count`, `abg_speed_m_per_min` to `LabelOrder`; add `LABEL_FINISHING_CONSTANTS`; update `LabelStageGroup` type |
| `src/hooks/labels/useLabelStages.ts` | Edit | Update `LabelStageGroup` type to include `'die_cutting_finishing'` |
| `src/hooks/labels/useLabelOrders.ts` | Edit | Pass new fields in create/update mutations |
| `src/components/labels/admin/LabelStageManagement.tsx` | Edit | Rename group label; update colour |
| `src/components/labels/order/LabelOrderModal.tsx` | Edit | Add output rolls display + warning, labels/roll, ABG speed field to Summary card |
| `src/components/labels/order/AddServiceDialog.tsx` | Edit | Auto-populate rewinding quantity from order's output_rolls_count; update finishing description |
| `src/components/labels/order/FinishingServicesCard.tsx` | Edit | Show labels/roll in rewinding service rows |

---

## Key Design Decisions

**Why store output_rolls_count on the order?**
The dieline `columns_across` gives you rolls per print run. But an order may have multiple runs (e.g., 3 runs of a 5-across dieline = 15 output rolls before rewinding). The stored value captures the true total output. It also survives dieline changes mid-order.

**Why not auto-compute output_rolls_count everywhere?**
Because the number of runs changes as the layout is optimised. The computed display (shown read-only from `dieline.columns_across × runs.length`) is always shown live, but the operator can override and save a confirmed count to the order.

**The ABG speed field:**
Stored per-order because some substrates or laminates run slower. 30 m/min is the default. This will feed into the finishing duration estimate in the `StageInstancesSection` in a future phase.

**Roll count warning thresholds:**
These are hardcoded constants initially. The thresholds (< 100 = danger, < 300 = warning) are sensible defaults based on typical label rewinding economics. They can be made configurable later.

---

## Build Sequence

1. DB migration (add 2 columns + UPDATE stage_group text)
2. TypeScript: `LabelStageGroup` type + `LabelOrder` fields + `LABEL_FINISHING_CONSTANTS`
3. Update hooks (`useLabelStages`, `useLabelOrders`)
4. Admin UI: rename group label in `LabelStageManagement`
5. Order modal: add output rolls + warning + ABG speed to Summary card
6. `AddServiceDialog`: auto-fill rewinding quantity
7. `FinishingServicesCard`: show labels/roll on rewinding rows
