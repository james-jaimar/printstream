
# Labels Division: Finishing, Services & Post-Print Workflow — Phase 1 (Order Additions)

## Scope of This Plan

This plan focuses specifically on what the user requested: adding the new `label_orders` columns (`core_size_mm`, `qty_per_roll`, `roll_direction`, `delivery_method`, `delivery_address`, `delivery_notes`), building the full isolated admin infrastructure (stages, finishing options, services), and surfacing these in the order modal — all without touching any digital division tables, hooks, or routes.

The image you shared confirms the existing `orientation` (rewind direction) system is working well — we will leave that section of the order modal completely untouched.

---

## Zero-Risk Isolation Guarantee

Every new object uses the `label_` prefix:
- New tables: `label_production_stages`, `label_finishing_options`, `label_order_services`, `label_order_stage_instances`
- New columns added only to `label_orders`
- New hooks: `useLabelFinishing`, `useLabelStages`, `useLabelOrderServices`
- New components: all inside `src/components/labels/`
- No changes to: digital division tables, routes, hooks, `production_stages`, `stage_groups`, `job_stage_instances`, or any other existing digital table

---

## Database Changes

### Step 1: New columns on `label_orders`

Six new nullable columns — all optional so no existing data or inserts break:

```sql
ALTER TABLE label_orders
  ADD COLUMN core_size_mm integer,        -- e.g. 25, 38, 40, 76
  ADD COLUMN qty_per_roll integer,         -- labels per roll for rewinding
  ADD COLUMN roll_direction text,          -- 'face_in' | 'face_out'
  ADD COLUMN delivery_method text,         -- 'collection' | 'local_delivery' | 'courier' | 'postal'
  ADD COLUMN delivery_address text,
  ADD COLUMN delivery_notes text;

-- No constraint on roll_direction/delivery_method yet — keep flexible during build
```

**Important**: The existing `orientation` (smallint, default 1) and `orientation_confirmed` (boolean) columns are NOT modified. They remain exactly as-is.

### Step 2: New isolated label stage/finishing tables

```sql
-- Master stage library (labels-only, replaces nothing in digital)
CREATE TABLE label_production_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  stage_group text NOT NULL,  -- 'finishing' | 'services' | 'qa' | 'packaging' | 'dispatch'
  color text DEFAULT '#6B7280',
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  is_conditional boolean DEFAULT false,
  default_duration_minutes integer,
  speed_per_hour numeric,
  speed_unit text,             -- 'labels_per_hour' | 'meters_per_hour' | 'rolls_per_hour'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Finishing option library (UV, Lam, Sheeting, etc.)
CREATE TABLE label_finishing_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,     -- 'lamination' | 'uv_varnish' | 'sheeting'
  description text,
  properties jsonb DEFAULT '{}',
  triggers_stage_id uuid REFERENCES label_production_stages(id),
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Quoted service lines on an order
CREATE TABLE label_order_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES label_orders(id) ON DELETE CASCADE,
  service_type text NOT NULL, -- 'finishing' | 'rewinding' | 'handwork' | 'qa' | 'packaging' | 'delivery' | 'joining'
  finishing_option_id uuid REFERENCES label_finishing_options(id),
  stage_id uuid REFERENCES label_production_stages(id),
  display_name text NOT NULL,
  quantity numeric,
  quantity_unit text,          -- 'rolls' | 'meters' | 'labels' | 'sheets'
  notes text,
  estimated_cost numeric,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Live stage tracking (created per order on approval)
CREATE TABLE label_order_stage_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES label_orders(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES label_production_stages(id),
  service_line_id uuid REFERENCES label_order_services(id),
  stage_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'completed' | 'skipped' | 'held'
  started_at timestamptz,
  completed_at timestamptz,
  started_by uuid REFERENCES auth.users(id),
  completed_by uuid REFERENCES auth.users(id),
  assigned_operator_id uuid REFERENCES auth.users(id),
  estimated_duration_minutes integer,
  actual_duration_minutes integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

RLS policies on all four tables: `USING (auth.uid() IS NOT NULL)` for SELECT; staff-only for INSERT/UPDATE/DELETE (mirroring the existing `label_orders` RLS pattern using `NOT is_label_client(auth.uid())`).

### Step 3: Seed default stages and finishing options

Default `label_production_stages` seed data (all `is_active = true`):

| Group | Name |
|-------|------|
| finishing | Gloss Lamination |
| finishing | Matt Lamination |
| finishing | Soft Touch Lamination |
| finishing | Full UV Varnish |
| finishing | Spot UV Varnish |
| finishing | Sheeting / Cut to Sheet |
| services | Rewinding |
| services | Joining Rolls |
| services | Handwork |
| qa | Quality Inspection |
| packaging | Labelling & Boxing |
| packaging | Shrink Wrapping |
| dispatch | Collection |
| dispatch | Local Delivery |
| dispatch | Courier |

Default `label_finishing_options` seeded with lamination types, UV options, and sheeting — each with `triggers_stage_id` pointing to the relevant seeded stage.

### Step 4: Schema cache reload

```sql
NOTIFY pgrst, 'reload schema';
```

---

## TypeScript Types

Update `src/types/labels.ts`:

- Extend `LabelOrder` interface with the 6 new optional fields (`core_size_mm`, `qty_per_roll`, `roll_direction`, `delivery_method`, `delivery_address`, `delivery_notes`)
- Add new interfaces: `LabelProductionStage`, `LabelFinishingOption`, `LabelOrderService`, `LabelOrderStageInstance`
- Add type unions: `LabelStageGroup`, `LabelServiceType`, `LabelStageStatus`
- Extend `CreateLabelOrderInput` with the new optional fields

---

## New Hooks (`src/hooks/labels/`)

Three new isolated hooks, following the exact same pattern as `useLabelOrders.ts`:

- **`useLabelStages.ts`** — `useLabelStages()`, `useCreateLabelStage()`, `useUpdateLabelStage()`, `useDeleteLabelStage()`
- **`useLabelFinishing.ts`** — `useLabelFinishingOptions()`, `useCreateFinishingOption()`, `useUpdateFinishingOption()`
- **`useLabelOrderServices.ts`** — `useOrderServices(orderId)`, `useAddOrderService()`, `useUpdateOrderService()`, `useRemoveOrderService()`, `useOrderStageInstances(orderId)`, `useUpdateStageInstance()`

---

## Admin UI — LabelsSettings.tsx

Expand from 2 tabs to 5 tabs. The existing Clients and General tabs are **unchanged**:

```
[Clients] [Stages] [Finishing] [Services] [General]
```

### New Tab: Stages (`LabelStageManagement.tsx`)

Grouped list by `stage_group` (Finishing / Services / QA / Packaging / Dispatch). Each row shows name, color swatch, duration, active toggle, edit/delete buttons. "Add Stage" button opens an inline form. No connection to the digital `production_stages` table whatsoever.

### New Tab: Finishing (`LabelFinishingManagement.tsx`)

Sub-tabs: Lamination | UV Varnish | Sheeting. Each shows a card list of options with their linked stage, description, and active toggle. "Add Option" opens a dialog with category, display name, linked stage selector, and properties.

### New Tab: Services (`LabelServicesManagement.tsx`)

List of configurable services (Rewinding, Joining Rolls, Handwork, QA, Packaging, Delivery) each linked to a `label_production_stage`. Toggle active/inactive. Edit display name and linked stage.

---

## Order Modal — New "Finishing & Services" Section

A new collapsible card added to `LabelOrderModal.tsx` **between** the info cards (Customer / Print Specs / Summary) and the Label Items section. The orientation picker section above it remains completely untouched.

### "Delivery & Packing" sub-card (on the Summary card)

The Summary card (third column in the 3-card grid) gains a new section below the label count and due date:

- **Core Size**: Select — 25mm / 38mm / 40mm / 76mm / Custom
- **Qty per Roll**: Number input
- **Roll Direction**: Select — Face In / Face Out
- **Delivery Method**: Select — Collection / Local Delivery / Courier / Postal

These are simple inline editable fields that `updateOrder.mutate()` directly (same pattern as the ink config select already in the modal).

### New "Finishing & Services" Card (full-width)

```
┌──────────────────────────────────────────────────────────┐
│  Finishing & Services                          [+ Add]   │
├──────────────────────────────────────────────────────────┤
│  ● Gloss Lamination                        [Edit]  [×]  │
│  ● Rewinding — 12 rolls to 25mm cores      [Edit]  [×]  │
│  ● Courier Delivery — 14 Main Rd           [Edit]  [×]  │
│                                                          │
│  (empty state: "No finishing or services added yet")     │
└──────────────────────────────────────────────────────────┘
```

"+ Add" opens `AddServiceDialog` — a simple two-step dialog:
1. Choose service type (Finishing / Rewinding / Joining Rolls / Handwork / QA / Packaging / Delivery)
2. Fill in details (option selector, qty, unit, notes)

Service lines are editable/removable at any status except `completed`/`cancelled`.

### New "Production Stages" Section (below Production Runs)

Shows the stage pipeline for the order — created when order moves to `approved`. Operators can click **Start** / **Complete** per stage. Status badges: Pending (grey) / Active (blue) / Completed (green) / Held (amber) / Skipped (outline).

This section only appears when stage instances exist (i.e., after approval).

---

## Files Changed Summary

| File | Type | Change |
|------|------|--------|
| `supabase/migrations/[new].sql` | New | All 4 new tables + label_orders columns + RLS + seed data |
| `src/types/labels.ts` | Edit | Add 6 fields to LabelOrder + 4 new interfaces |
| `src/hooks/labels/useLabelStages.ts` | New | CRUD hooks for label_production_stages |
| `src/hooks/labels/useLabelFinishing.ts` | New | CRUD hooks for label_finishing_options |
| `src/hooks/labels/useLabelOrderServices.ts` | New | Service line + stage instance hooks |
| `src/components/labels/admin/LabelStageManagement.tsx` | New | Admin stage list + add/edit |
| `src/components/labels/admin/LabelFinishingManagement.tsx` | New | Admin finishing options UI |
| `src/components/labels/admin/LabelServicesManagement.tsx` | New | Admin services config UI |
| `src/components/labels/admin/index.ts` | Edit | Export 3 new admin components |
| `src/pages/labels/LabelsSettings.tsx` | Edit | Add 3 new tabs (Stages, Finishing, Services) |
| `src/components/labels/order/AddServiceDialog.tsx` | New | Dialog for adding service lines |
| `src/components/labels/order/FinishingServicesCard.tsx` | New | The order-level card showing/editing service lines |
| `src/components/labels/order/StageInstancesSection.tsx` | New | Production stage tracker for operators |
| `src/components/labels/order/LabelOrderModal.tsx` | Edit | Add 4 new fields to Summary card + add FinishingServicesCard + StageInstancesSection |
| `src/hooks/labels/useLabelOrders.ts` | Edit | Add 6 new fields to `useCreateLabelOrder` input mapping |

**No digital division files are touched. Zero.**

---

## Build Sequence

1. Migration SQL (all tables, columns, RLS, seed data in one file)
2. TypeScript types (`labels.ts`)
3. New hooks (useLabelStages, useLabelFinishing, useLabelOrderServices)
4. Admin components (LabelStageManagement, LabelFinishingManagement, LabelServicesManagement)
5. Export admin index + expand LabelsSettings.tsx
6. Order dialog components (AddServiceDialog, FinishingServicesCard, StageInstancesSection)
7. Update LabelOrderModal.tsx (add fields + new cards)
8. Update useLabelOrders.ts (pass-through new fields in create/update)
