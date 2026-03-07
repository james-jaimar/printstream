

# Replace Horizontal Tabs with Collapsible Sidebar in Tracker Admin

## Problem
The Setup page has 14 tabs crammed into a horizontal row that overflows and wraps. It's messy and will only get worse as more settings are added.

## Solution
Replace the horizontal `Tabs` layout with a collapsible left sidebar navigation inside `TrackerAdmin.tsx`. The sidebar uses the existing Shadcn `Sidebar` component (`src/components/ui/sidebar.tsx`) which supports expanding/collapsing with an icon-only mini mode.

## Layout

```text
┌──────────────────────────────────────────────────┐
│  Production Tracker Admin  +  Schedule Health    │
├────────┬─────────────────────────────────────────┤
│ ☰      │                                         │
│ Users  │   [Active panel content]                 │
│ Excel  │                                         │
│ Diag   │                                         │
│ Stages │                                         │
│ Cats   │                                         │
│ Specs  │                                         │
│ Batch  │                                         │
│ Hols   │                                         │
│ Perms  │                                         │
│ Groups │                                         │
│ Print  │                                         │
│ Proofs │                                         │
│ Merge  │                                         │
│ Paper  │                                         │
├────────┴─────────────────────────────────────────┤
```

When collapsed, the sidebar shrinks to icon-only (3rem wide). A toggle button at the top lets you expand/collapse it.

## Implementation

**File: `src/pages/tracker/TrackerAdmin.tsx`** (rewrite)

1. Wrap the page content in `SidebarProvider` + `Sidebar` (collapsible="icon")
2. Move the 14 nav items into `SidebarMenu` with `SidebarMenuButton` entries, each with icon + label
3. Use local state (`activeSection`) to track which section is shown — clicking a sidebar item sets it
4. Highlight the active item
5. Render the corresponding content panel to the right of the sidebar
6. Keep the header (title + ScheduleHealthCard) above the sidebar+content area
7. Add a `SidebarTrigger` button at the top of the sidebar for collapse/expand

No new files needed. No route changes. Just a layout refactor of `TrackerAdmin.tsx` using the existing sidebar component.

