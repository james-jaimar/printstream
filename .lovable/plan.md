

## Low Stock Alert Redesign

The current low stock warning takes up a huge amount of vertical space on the page, pushing your actual stock table way down. Here's the plan to make it compact and non-intrusive:

### Approach: Collapsible Summary Bar

Replace the large alert banner with a slim, single-line warning bar that:
- Shows a compact message like: "Low Stock: 28 items below reorder level"
- Has a chevron to expand/collapse the full details inline (using Collapsible)
- Defaults to **collapsed** so it stays out of the way
- When expanded, shows the badges list in a more compact layout

This keeps the information accessible without dominating the page.

### Changes

**1. `src/components/labels/production/LowStockAlert.tsx`**
- Redesign the default (non-compact) view to use a `Collapsible` component
- Collapsed state: a slim bar with warning icon, count text, and a toggle chevron
- Expanded state: reveals the badge list of low-stock items below
- Remove the "View Stock Management" link button (since we're already on that page)
- Keep the `compact` prop variant for use on other pages (Dashboard, Reports) unchanged

**2. `src/pages/labels/LabelsStock.tsx`**
- No changes needed -- it already renders `<LowStockAlert />` which will automatically use the new collapsible design

**3. `src/pages/labels/LabelsReporting.tsx`**
- Pass `compact` prop so the reporting page keeps using the small link-style alert

### Technical Details

- Uses the existing `@radix-ui/react-collapsible` (already installed) via `src/components/ui/collapsible.tsx`
- The collapsible bar will use `Collapsible`, `CollapsibleTrigger`, and `CollapsibleContent`
- Collapsed bar styling: subtle amber/warning background, single line height, flex layout with icon + text + chevron
- Expanded content: the existing badge list, slightly tighter spacing
- State defaults to closed (`open={false}`)

