
# Redesign: New Order Modal — Page 1 (Specs & Finishing)

## What We're Doing

Splitting the modal into two clearly-defined pages:

- **Page 1 — Specs & Finishing**: Everything admin/account execs need to configure the order. This is also the client-facing summary page in the portal.
- **Page 2 — Artwork & Production**: Proofs, print-ready files, AI layout, runs, and production scheduling. (This page exists already — we're just reorganising so the tabs make sense.)

The current modal is a single long scroll with 3 small info cards at the top and then artwork below. We need to elevate the specs page into a premium, well-structured form view.

---

## Page 1 — Visual Design Concept

The new Page 1 uses a two-column card layout within the 90vw modal, inspired by the teal visual identity already in use:

```text
┌─────────────────────────────────────────────────────────────────────┐
│  [LBL-0042] ● Quote  │  Acme Corp  •  WO#12345     [Page 1] [Page 2]│
│  ──────────────────────────────────────────────────────────────────  │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  🏢 CUSTOMER              │  │  📐 PRINT SPECIFICATIONS          │  │
│  │  Acme Corp               │  │  60×160mm — 5 Across × 2 Around  │  │
│  │  John Smith              │  │  on 330mm roll                   │  │
│  │  john@acme.com           │  │  Die No: D-042  │  RPL: 123     │  │
│  │  Due: 15 Mar 2026        │  │                                  │  │
│  └──────────────────────────┘  │  Substrate: Semi Gloss 250mm     │  │
│                                 │  Hot Melt  │  Acrylic            │  │
│  ┌──────────────────────────┐  │                                  │  │
│  │  🖨 INK & PRESS           │  │  Ink: CMYK (4-colour) 22 m/min  │  │
│  │  CMYK — 22 m/min         │  │  Orientation: #1 Outwound ↑     │  │
│  │  Orientation: #1         │  └──────────────────────────────────┘  │
│  └──────────────────────────┘                                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ✂ DIE CUTTING & FINISHING  (ABG Machine)                    │   │
│  │  ──────────────────────────────────────────────────────────  │   │
│  │  Output: 5 rolls   │  ABG Speed: 30 m/min                   │   │
│  │  [⚠ 180 labels/roll — Short rolls, consider joining]        │   │
│  │                                                              │   │
│  │  Services:  [✨ Lamination] [🔄 Rewind ×5] [📦 Packaging]   │   │
│  │                             [+ Add Service]                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  📦 DELIVERY & OUTPUT SPECS                                  │   │
│  │  Core: 76mm  │  Qty/Roll: 1,000  │  Direction: Face In      │   │
│  │  Delivery: Courier                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [Notes: Any special instructions...]                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Changes

### A. Two-Tab Navigation in the Modal Header

Add a pill/tab switcher in the modal header that replaces the current single-scroll layout:

```
[Specifications & Finishing]   [Artwork & Production]
```

- Page 1 state stored as `activeTab: 'specs' | 'artwork'`
- Toolbar buttons (Send Proof, AI Layout, etc.) only show on `artwork` tab
- The `Bypass Proof` toggle moves to the artwork tab

### B. Page 1 — Card Structure (3 rows)

**Row 1: Two-column grid**

**Left — Customer & Order Card**
- Customer name (bold, large)
- Contact name + clickable email (`mailto:`)
- Quickeasy WO# (inline badge)
- Due date (Calendar icon, formatted)
- Status badge (editable dropdown for admin)

**Right — Print Specifications Card** (premium teal-accent header)
- Dieline name (bold) + dimensions badge (`60×160mm`)
- Layout info: `5 Across × 2 Around`, `on 330mm roll`
- Die metadata: Die No, RPL, Die Type (from `dieline.die_no`, `.rpl`, `.die_type`) — these are valuable data now buried
- Substrate: name + width badge + finish badge + glue badge
- Ink config: displayed as a styled pill with the press speed
- Orientation: the SVG icon + label, with confirm badge

**Row 2: Full-width — Die Cutting & Finishing Card**

This is the centrepiece — it represents the ABG machine pass:

- Header: `✂ Die Cutting & Finishing` with an `ABG Machine` sub-label
- Two key metrics prominently displayed:
  - **Output Rolls**: big number, formula shown small (`5 across × 1 run`)
  - **ABG Speed**: editable inline number field (`30 m/min`)
- **Labels per Output Roll warning**: full-width alert banner when < 300
- **Services list**: the current `FinishingServicesCard` content, but embedded inline here (not a separate card below)
- The `+ Add Service` button stays

This unifies the ABG machine concept visually — everything that happens on the machine is in one card.

**Row 3: Two-column grid**

**Left — Output & Delivery Specs Card**
- Core Size (select — existing)
- Qty per Roll (number input — existing)
- Roll Direction (select — existing)
- Delivery Method (select — existing)
- Delivery notes (small text input, if needed)

**Right — Notes Card**
- Free-text notes for the order (currently buried at the bottom of the creation dialog and not shown in the modal view at all)
- These notes are also shown in the client portal

### C. Page 2 — Artwork & Production (minimal changes)

The existing content (Label Items, Dual Upload Zone, Runs, Stage Instances, Production) moves to tab 2. The layout stays the same — we're just putting it behind the tab. The toolbar buttons (Send Proof, Request Artwork, AI Layout, Bypass Proof) live in the toolbar on page 2.

---

## New Order Creation Dialog Changes

The `NewLabelOrderDialog.tsx` also shows Page 1 specs upfront. Currently it's a vertical scroll. We redesign it to match the same card structure — but since it's a creation form (no saved order yet), we keep it as a clean vertical layout with better visual sections:

- **Section dividers** styled with icons and teal accent lines (not just grey `text-muted-foreground` labels)
- Dieline card shows a live preview of the dimensions/layout once selected
- Substrate selector stays (it's already well-designed)
- Add the finishing/delivery fields here too (Core Size, Qty per Roll, Roll Direction, Delivery Method) so they're captured at creation time, not just in the order modal

---

## Files to Create/Edit

| File | Change |
|------|--------|
| `src/components/labels/order/LabelOrderModal.tsx` | Major restructure: add two-tab navigation, rebuild Page 1 with new card layout, move artwork/production to Page 2 |
| `src/components/labels/order/OrderSpecsPage.tsx` | **New file**: extracts the entire Page 1 content into its own component (keeps modal file manageable) |
| `src/components/labels/order/FinishingServicesCard.tsx` | Adjust to work embedded within the new Die Cutting & Finishing card (remove outer Card wrapper, accept `embedded` prop) |
| `src/components/labels/NewLabelOrderDialog.tsx` | Add finishing/delivery fields to creation form; improve section visual styling with icons |

---

## Key UX Decisions

**Why put Finishing inside the modal, not in a separate card below?**
The ABG machine is the physical link between printing and delivery. Putting lamination, rewinding, and die-cutting in the same visual card as ABG speed and output rolls tells the operator "all of this happens on the same machine in one pass." It also reduces the scroll distance on what is currently a very long page.

**Why move artwork to Page 2?**
The client portal will show Page 1 data for order confirmation (substrate, dieline, finishing, delivery). The client doesn't need to see the internal artwork management tabs, upload zones, or production run details. The two-tab split naturally separates "client-visible specs" from "internal production workflow."

**Notes field in the modal**
Currently, notes can be entered during order creation but aren't editable in the modal view. We add an editable notes field to Page 1 since notes often have client-facing importance (e.g., "client wants labels in specific roll order").

**Status editing**
Currently status is read-only (just a badge). We make it an inline `<Select>` in the header for quick admin updates without needing a separate action.

---

## Build Sequence

1. Create `OrderSpecsPage.tsx` — the new Page 1 component with the full card layout
2. Update `LabelOrderModal.tsx` — add tab switcher, wire in `OrderSpecsPage` for tab 1, keep existing artwork/production as tab 2
3. Update `FinishingServicesCard.tsx` — add `embedded` prop to strip the outer Card when used inside `OrderSpecsPage`
4. Update `NewLabelOrderDialog.tsx` — add finishing/delivery fields + improve section styling
