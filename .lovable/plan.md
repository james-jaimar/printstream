
# Labels Division - Complete Implementation Plan

## Executive Summary

This plan creates a **completely isolated Labels Division** within Printstream that shares foundational infrastructure (auth, components, database patterns) but operates in its own namespace to avoid any risk to the production Digital Division.

The key innovation: **Only new divisional tables get a `division` field** - the existing Digital Division data remains untouched with no schema changes.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRINTSTREAM APP                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────┐              ┌─────────────────────┐          │
│   │   DIGITAL DIVISION  │              │   LABELS DIVISION   │          │
│   │   (Existing - NO    │              │   (New - Isolated)  │          │
│   │    changes needed)  │              │                     │          │
│   │                     │              │                     │          │
│   │ • production_jobs   │              │ • label_orders      │          │
│   │ • categories        │              │ • label_items       │          │
│   │ • job_stage_inst... │              │ • label_dielines    │          │
│   │ • Excel Import      │              │ • label_runs        │          │
│   │ • Tracker/Kanban    │              │ • label_rolls       │          │
│   │ • Schedule Board    │              │ • label_stock       │          │
│   │                     │              │ • AI Layout Engine  │          │
│   └─────────────────────┘              └─────────────────────┘          │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    SHARED INFRASTRUCTURE                         │   │
│   │  • Auth/Permissions  • UI Components  • PDF Viewer              │   │
│   │  • VPS PDF API       • Proof System   • Barcode Generator       │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      VPS PDF API              │
                    │  pdf-api.jaimar.dev           │
                    │  • Ghostscript CMYK           │
                    │  • pdfcpu Imposition          │
                    │  • pikepdf Preflight          │
                    └───────────────────────────────┘
```

---

## Phase 1: Database Foundation (Labels-Specific Tables)

All new tables are prefixed with `label_` to ensure complete isolation.

### Core Tables

**1. `label_dielines` - Die Template Library**
```text
Columns:
- id (uuid, PK)
- name (text) - "6 Across x 4 Around - 50x30mm"
- roll_width_mm (numeric) - 250, 280, 320, 330
- label_width_mm (numeric)
- label_height_mm (numeric)
- columns_across (integer) - Number of slots across
- rows_around (integer) - Number of labels in roll direction
- horizontal_gap_mm (numeric) - Gap between columns
- vertical_gap_mm (numeric) - Gap between rows
- corner_radius_mm (numeric, nullable)
- dieline_pdf_url (text, nullable) - Customer-supplied dieline
- is_custom (boolean) - Customer-supplied vs standard
- created_by (uuid, FK profiles)
- created_at, updated_at
```

**2. `label_orders` - Main Order/Quote Record**
```text
Columns:
- id (uuid, PK)
- order_number (text, unique) - "LBL-2026-0001"
- quickeasy_wo_no (text, nullable) - Link to MIS
- customer_id (uuid, FK) - Link to customer/profile
- customer_name (text)
- contact_name (text, nullable)
- contact_email (text, nullable)
- status (enum) - 'quote', 'pending_approval', 'approved', 'in_production', 'completed', 'cancelled'
- dieline_id (uuid, FK label_dielines)
- roll_width_mm (numeric)
- substrate_id (uuid, FK label_stock)
- total_label_count (integer) - Sum of all items
- estimated_meters (numeric) - Calculated
- estimated_sheets (integer) - HP Indigo frames
- due_date (date)
- client_approved_at (timestamptz)
- client_approved_by (text)
- proof_token (text, nullable) - For client portal
- created_by (uuid, FK profiles)
- created_at, updated_at
```

**3. `label_items` - Individual Label Artworks within Order**
```text
Columns:
- id (uuid, PK)
- order_id (uuid, FK label_orders)
- item_number (integer) - 1, 2, 3... within order
- name (text) - "SKU-12345" or "Flavour: Vanilla"
- artwork_pdf_url (text)
- artwork_thumbnail_url (text, nullable)
- quantity (integer) - How many of this label
- width_mm (numeric, nullable) - Can override dieline
- height_mm (numeric, nullable)
- preflight_status (enum) - 'pending', 'passed', 'failed', 'warnings'
- preflight_report (jsonb) - Full preflight data
- is_cmyk (boolean)
- min_dpi (numeric, nullable)
- has_bleed (boolean, nullable)
- created_at, updated_at
```

**4. `label_runs` - AI-Calculated Production Runs**
```text
Columns:
- id (uuid, PK)
- order_id (uuid, FK label_orders)
- run_number (integer) - Run sequence
- slot_assignments (jsonb) - Array of {slot: 1-6, item_id: uuid, quantity_in_slot: int}
- meters_to_print (numeric)
- frames_count (integer) - HP Indigo frames (960mm max)
- estimated_duration_minutes (integer)
- status (enum) - 'planned', 'approved', 'printing', 'completed'
- ai_optimization_score (numeric) - 0-100 efficiency rating
- ai_reasoning (text) - Why AI chose this layout
- imposed_pdf_url (text, nullable) - Generated imposition
- imposed_pdf_with_dielines_url (text, nullable) - For proofing
- created_at, updated_at
```

**5. `label_stock` - Roll Stock Inventory**
```text
Columns:
- id (uuid, PK)
- name (text) - "PP White Gloss 80gsm"
- substrate_type (text) - 'Paper', 'PP', 'PE', 'PET', 'Vinyl'
- finish (text) - 'Gloss', 'Matt', 'Uncoated'
- width_mm (numeric)
- gsm (integer, nullable)
- roll_length_meters (numeric) - Full roll length
- current_stock_meters (numeric) - Available stock
- reorder_level_meters (numeric)
- cost_per_meter (numeric, nullable)
- supplier (text, nullable)
- last_stock_take (timestamptz)
- barcode (text, nullable) - For scanning
- created_at, updated_at
```

**6. `label_schedule` - Production Schedule Board**
```text
Columns:
- id (uuid, PK)
- run_id (uuid, FK label_runs)
- scheduled_date (date)
- scheduled_start_time (time)
- scheduled_end_time (time)
- printer_id (uuid, FK printers)
- operator_id (uuid, FK profiles, nullable)
- status (enum) - 'scheduled', 'in_progress', 'completed', 'cancelled'
- actual_start_time (timestamptz, nullable)
- actual_end_time (timestamptz, nullable)
- notes (text, nullable)
- created_at, updated_at
```

---

## Phase 2: Client Portal Architecture

### Public Routes (No Auth Required)
```text
/labels/proof/:token     - Client proof approval (like existing ProofViewer)
/labels/status/:token    - Order status tracking
```

### Protected Client Routes
```text
/labels/portal           - Client dashboard
/labels/portal/new-quote - Start new quote/order
/labels/portal/orders    - View orders
/labels/portal/orders/:id - Order detail with approval
```

### Admin/Staff Routes
```text
/labels                  - Labels Division dashboard
/labels/orders           - All orders list
/labels/orders/:id       - Order detail (staff view)
/labels/dielines         - Dieline template library
/labels/schedule         - Production schedule board
/labels/stock            - Stock management
/labels/ai-layout/:id    - AI layout configuration
```

---

## Phase 3: AI Layout Engine (Game Changer)

### The Problem You Described
- 24 different artworks, varying quantities
- 6 across x 4 around dieline
- Currently takes 30-45 minutes manually to optimize

### AI Solution Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    AI LAYOUT OPTIMIZER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INPUTS:                                                         │
│  ├─ Label items with quantities                                  │
│  ├─ Dieline specs (6 across, 4 around)                          │
│  ├─ Optimization weights:                                        │
│  │   • Material efficiency (minimize waste)                      │
│  │   • Print efficiency (minimize runs/frames)                   │
│  │   • Labour efficiency (minimize handling)                     │
│  │                                                               │
│  ALGORITHM:                                                      │
│  1. Sort labels by quantity (largest first)                      │
│  2. Calculate slot requirements per label                        │
│  3. Bin-packing algorithm to fill slots optimally               │
│  4. Split high-quantity labels across runs if beneficial         │
│  5. Score multiple layout options                                │
│  6. Return top 3 options with cost/efficiency comparisons       │
│                                                                  │
│  OUTPUTS:                                                        │
│  ├─ Recommended layout with scoring                              │
│  ├─ Alternative layouts for comparison                           │
│  ├─ Cost breakdown (material, estimated labor)                   │
│  ├─ Visual preview of each run                                   │
│  └─ AI reasoning explanation                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Example Calculation
Your scenario: 6 slots, 24 labels, varying quantities

```text
Label A: 15,000 → Needs 2.5 runs at 6 slots = Use 3 slots × 5,000 run
Label B: 8,000  → Needs 1.33 runs = Use 2 slots × 4,000 run
Label C: 3,000  → Needs 0.5 runs = Use 1 slot × 3,000 run

AI PROPOSED RUN 1: 
  Slots 1-3: Label A (5,000 each = 15,000)
  Slots 4-5: Label B (5,000 each = 10,000 - 2,000 overflow)
  Slot 6: Label C (5,000 - 2,000 needed = 3,000 waste or...)

AI adjusts: Run 1 at 3,000 length instead:
  Slots 1-3: Label A @ 3,000 = 9,000
  Slots 4-5: Label B @ 3,000 = 6,000  
  Slot 6: Label C @ 3,000 = 3,000 ✓ EXACT

Run 2 at 2,000:
  Slots 1-3: Label A @ 2,000 = 6,000 (total 15,000 ✓)
  Slots 4-5: Label B @ 2,000 = 4,000 (total 10,000 - needs 2,000 more)
  Slot 6: Label D...

And so on until all quantities satisfied with minimum waste.
```

---

## Phase 4: VPS PDF API Integration

### Edge Function: `labels-pdf-process`

This edge function proxies requests to your VPS PDF API.

```text
Endpoints to call:
POST /imposition/step-repeat  - Generate imposed PDFs
POST /color/rgb-to-cmyk       - Convert artwork to CMYK
POST /preflight/check         - Full preflight report
POST /preflight/images        - Check resolution
POST /preflight/spot-colors   - Extract spot colors
```

### Workflow for Label Artwork
```text
1. Client uploads artwork
2. Edge function → VPS API /preflight/check
3. Store preflight results in label_items.preflight_report
4. If RGB detected → offer CMYK conversion
5. On approval → generate imposition via VPS API
6. Two PDFs generated:
   - With die-lines (for client proof)
   - Without die-lines (for production)
7. Store both URLs in label_runs
```

---

## Phase 5: Quickeasy Integration

### Excel Import Extension (Labels-Specific)

Create a new component `LabelsExcelUpload.tsx` that:
1. Parses Quickeasy export with labels-specific column detection
2. Maps to `label_orders` and `label_items` tables
3. Detects dieline from size specifications
4. Auto-creates order records in 'pending' status

### Column Mapping for Labels
```text
WO No        → label_orders.quickeasy_wo_no
Customer     → label_orders.customer_name
Reference    → label_orders.order_number
Due Date     → label_orders.due_date
Size         → Match to label_dielines
Qty          → Distributed to label_items
Substrate    → Match to label_stock
```

---

## Phase 6: Stock Management

### Features
1. **Roll Tracking**: Each roll has unique barcode
2. **Usage Deduction**: When run completes, deduct meters from stock
3. **Reorder Alerts**: When stock falls below threshold
4. **End-of-Roll Labels**: Generate barcode label for partial rolls
5. **Stock Take**: Scan barcodes to reconcile

### Barcode Label Generation
Reuse existing `barcodeLabelGenerator.ts` but extend for:
```text
Roll ID: ROLL-2026-001
Substrate: PP White Gloss 80gsm
Width: 320mm
Remaining: 247.5m
Last Used: 2026-02-08
```

---

## Phase 7: Schedule Board (Drag & Drop)

### Design
A Kanban-style board specific to labels:

```text
┌─────────────────────────────────────────────────────────────┐
│ LABELS SCHEDULE BOARD                      [+ New Run]       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  UNSCHEDULED    │   MON 10    │   TUE 11    │   WED 12     │
│  ┌───────────┐  │  ┌───────┐  │  ┌───────┐  │  ┌───────┐   │
│  │ Order 45  │  │  │Run 1  │  │  │Run 4  │  │  │Run 7  │   │
│  │ 3 runs    │←→│  │Order42│  │  │Order44│  │  │Order45│   │
│  └───────────┘  │  │45 min │  │  │60 min │  │  │30 min │   │
│  ┌───────────┐  │  └───────┘  │  └───────┘  │  └───────┘   │
│  │ Order 46  │  │  ┌───────┐  │  ┌───────┐  │              │
│  │ 2 runs    │  │  │Run 2  │  │  │Run 5  │  │              │
│  └───────────┘  │  │Order42│  │  │Order44│  │              │
│                 │  │30 min │  │  │45 min │  │              │
│                 │  └───────┘  │  └───────┘  │              │
│                 │  ┌───────┐  │  ┌───────┐  │              │
│                 │  │Run 3  │  │  │Run 6  │  │              │
│                 │  │Order43│  │  │Order44│  │              │
│                 │  │60 min │  │  │35 min │  │              │
│                 │  └───────┘  │  └───────┘  │              │
│                 │             │             │              │
└─────────────────────────────────────────────────────────────┘
```

Uses `@dnd-kit` (already installed) for drag-and-drop.

---

## Phase 8: Client Portal Workflow

### Quote/Order Flow
```text
1. Client logs in → /labels/portal
2. Clicks "New Quote" → /labels/portal/new-quote
3. Step 1: Select dieline (from library or custom upload)
4. Step 2: Upload artworks with quantities
5. Step 3: System runs preflight + AI layout
6. Step 4: Review proposed layout options
7. Step 5: Select layout, submit for approval
8. Email sent with proof link
9. Client approves or requests changes
10. On approval → moves to production queue
```

### Client Dashboard Shows
- Active orders with status
- Historical orders
- Pending approvals
- Stock on order (if applicable)

---

## Implementation Phases

### Phase A: Foundation (Week 1)
1. Create database migrations for all `label_*` tables
2. Add `/labels` route structure to App.tsx
3. Create LabelsLayout component
4. Create basic hooks: `useLabelsOrders`, `useLabels`, etc.

### Phase B: Order Management (Week 2)
1. Labels order list page
2. Order detail page
3. Quickeasy Excel import for labels
4. Dieline library management

### Phase C: VPS Integration (Week 3)
1. Edge function `labels-pdf-process`
2. Artwork upload with preflight
3. CMYK conversion workflow
4. Imposition generation

### Phase D: AI Layout Engine (Week 4)
1. Layout optimization algorithm
2. Multiple layout comparison UI
3. Slot assignment visualization
4. Cost/efficiency scoring

### Phase E: Client Portal (Week 5)
1. Public proof viewer for labels
2. Client dashboard
3. New quote wizard
4. Approval workflow

### Phase F: Production (Week 6)
1. Schedule board with D&D
2. Stock management
3. Run tracking
4. Barcode label generation

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing app | All new tables prefixed `label_`. Zero changes to existing tables. |
| Route conflicts | New route tree `/labels/*` completely separate from `/printstream/*` and `/tracker/*` |
| Shared component issues | Create Labels-specific versions where needed, use shared components for UI primitives |
| Database performance | Labels tables are isolated; indexes on key query columns |
| VPS API failures | Implement retry logic and fallback to local pdf-lib for basic operations |

---

## What Gets Reused from Existing App

| Component/System | Reuse Strategy |
|------------------|----------------|
| Authentication | Use existing `useAuth`, `ProtectedRoute` |
| User Roles | Extend `useUserRole` with labels-specific permissions |
| PDF Viewer | Reuse `PdfViewer` component |
| Proof System | Adapt `ProofViewer` pattern for labels |
| Barcode Generation | Extend `barcodeLabelGenerator.ts` |
| UI Components | All shadcn/ui components |
| Toast/Notifications | Existing `sonner` setup |
| Supabase Client | Shared client instance |

---

## New Components to Create

### Hooks
- `useLabelOrders` - CRUD for label orders
- `useLabelItems` - CRUD for label items
- `useLabelDielines` - Dieline library management
- `useLabelStock` - Stock inventory
- `useLabelRuns` - Production runs
- `useLabelSchedule` - Schedule board
- `useAILayoutOptimizer` - AI layout engine
- `useLabelPreflight` - VPS preflight integration

### Pages
- `LabelsHome.tsx` - Division dashboard
- `LabelsOrders.tsx` - Order list
- `LabelsOrderDetail.tsx` - Single order view
- `LabelsDielines.tsx` - Template library
- `LabelsStock.tsx` - Inventory management
- `LabelsSchedule.tsx` - Production schedule
- `LabelsPortal.tsx` - Client dashboard
- `LabelsNewQuote.tsx` - Quote wizard
- `LabelsProofViewer.tsx` - Client approval

### Components
- `LabelsDiagnostic.tsx` - AI layout preview
- `LabelsSlotVisualizer.tsx` - Slot assignment display
- `LabelsRunCard.tsx` - Run card for schedule
- `LabelsStockCard.tsx` - Stock item display
- `LabelsArtworkUpload.tsx` - Multi-file upload with preflight

---

## Technical Specifications

### HP Indigo Label Printing Constants
```typescript
const LABEL_PRINT_CONSTANTS = {
  MAX_FRAME_LENGTH_MM: 960,        // HP Indigo max print length
  ROLL_WIDTHS_MM: [250, 280, 320, 330],
  FRAME_CHANGEOVER_MINUTES: 2,     // Time between frames
  SETUP_TIME_MINUTES: 15,          // Initial job setup
  METERS_PER_FRAME: 0.96,          // 960mm = 0.96m per frame
};
```

### AI Optimization Weights (Configurable)
```typescript
const DEFAULT_OPTIMIZATION_WEIGHTS = {
  material_efficiency: 0.4,   // Minimize substrate waste
  print_efficiency: 0.35,     // Minimize number of runs/frames
  labor_efficiency: 0.25,     // Minimize handling/changeovers
};
```

---

## Success Criteria

1. **Zero impact on Digital Division** - All existing functionality works unchanged
2. **Order creation under 5 minutes** - Quick workflow from Quickeasy import to production-ready
3. **AI layout saves 30+ minutes per complex order** - Your game-changer metric
4. **Client self-service** - Clients can create quotes and approve proofs without staff intervention
5. **Real-time stock visibility** - Know exactly what's available
6. **Schedule clarity** - Visual board shows all production at a glance
7. **2x volume capacity** - System supports double current throughput
