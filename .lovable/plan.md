

# Premium Client Portal Redesign — Matching Reference Quality

## What's Wrong Now

The current dashboard is a single-column, top-to-bottom layout with plain stat counters, a basic table, and resource cards. It looks like a data report, not a client-facing portal.

## What the Reference Shows (and What We'll Build)

The reference image demonstrates a **multi-panel dashboard** with distinct content zones arranged in a grid. Here's what we'll replicate using the data we actually have:

### Layout Structure

```text
+------+------------------------------------------+
|      |  Welcome back, James                     |
| SIDE |  Stats Cards (with CTAs + thumbnails)     |
| BAR  |                                           |
|      +---------------------+--------------------+
| Dash |  Recent Orders      | Track Your Order   |
| My   |  (table view)       | (visual progress   |
| Ord  |                     |  stepper for most   |
| Acct |                     |  recent active)     |
| Help +---------------------+--------------------+
|      |  Resources & Support (icon grid)          |
+------+------------------------------------------+
```

### Specific Changes

**1. Add a Left Sidebar**
- Compact sidebar (~220px) with navigation: Dashboard, My Orders (links to same page filtered), Account Settings, Help Center
- Branded with Impress logo at top, teal accent on active item
- Collapses on mobile to a top bar or hamburger

**2. Rich Stats Cards (with CTAs)**
- Each stat card gets a "View" CTA button (e.g., "View Orders >")
- Subtle product thumbnail strip at the bottom of cards that have orders (using signed thumbnail URLs from the first few items)
- Slightly larger cards with more visual weight

**3. Two-Column Content Grid**
- Left column: "Recent Orders" table (same data, better styling)
- Right column: "Track Your Order" widget showing the workflow stepper for the most recent active order (reusing the existing `WorkflowStepper` pattern from OrderDetail)

**4. Resources Section**
- Icon-centric grid (larger icons, centered layout) matching the reference's compact resource cards

**5. Overall Visual Polish**
- Subtle gray background (`bg-gray-50`) for the main content area
- White card surfaces with refined shadows (`shadow-sm`)
- Larger section headers with bolder typography
- More generous padding and spacing throughout
- Professional footer

### What We Won't Build (Not Applicable to Our Data)
- "Quick Reorder" — we don't have reorder functionality
- "Saved Designs" — we don't store design templates per client
- "Invoices" — not part of the label portal scope
- Shopping cart / notifications badge — not applicable

These sections from the reference rely on features outside our current system. The plan focuses on making maximum visual impact with the data we have.

---

## Technical Details

### Files Modified

| File | Changes |
|------|---------|
| `src/pages/labels/portal/ClientPortalDashboard.tsx` | Complete rewrite: sidebar + grid layout, rich stat cards with CTAs and thumbnails, tracking widget, two-column content area |

### No New Files or Dependencies Required

The sidebar will be built inline (not using shadcn Sidebar component) since this is a standalone portal page outside the main app layout. Simple `div`-based sidebar with responsive behavior.

### Key Implementation Details

**Sidebar Navigation** -- Simple static nav component rendered as a left column within the dashboard. Links to `/labels/portal` (Dashboard), `/labels/portal` with filter params for "My Orders", `/labels/portal/account` for Account Settings, and a mailto link for Help.

**Stats Cards with Thumbnails** -- For each stat category (Awaiting, In Production, etc.), filter orders matching that status, grab the first item's `signed_proof_thumbnail_url`, and display it as a small preview strip at the bottom of the card. Add a teal CTA button "View Orders >".

**Track Your Order Widget** -- Find the most recent non-completed order. Render the workflow stepper (reuse `getWorkflowStep` logic) inside a card in the right column. Show order number, description, and a "Track Shipment" style CTA.

**Two-Column Grid** -- Use `grid grid-cols-1 lg:grid-cols-5` with the sidebar taking `lg:col-span-1` and main content `lg:col-span-4`. Inside main, the orders table and tracking widget use `grid grid-cols-1 lg:grid-cols-2`.

**Mobile Responsive** -- Sidebar collapses to a horizontal nav bar on mobile. Stats cards go to 2-column grid. Content sections stack vertically.

