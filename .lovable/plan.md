

# Fix: Admin Sidebar Overlaying the Entire Page

## Root Cause

The Shadcn `Sidebar` component uses `position: fixed; inset-y: 0; height: 100svh` (lines 225, 235 of sidebar.tsx). It's designed to be a **full-page, app-level** sidebar — not something nestled inside a content area below a header. No amount of className overrides on `SidebarProvider` will fix this because the inner `Sidebar` div is hardcoded as `fixed inset-y-0 h-svh`.

## Solution

**Don't use the Shadcn Sidebar component here.** Instead, build a simple custom collapsible panel using basic flex layout + state. This keeps it contained within the admin content area, respecting the header and parent layout naturally.

## Implementation

**File: `src/pages/tracker/TrackerAdmin.tsx`** — rewrite the sidebar as a simple collapsible div:

1. Remove all imports from `@/components/ui/sidebar`
2. Replace `AdminSidebar` with a plain `div` that:
   - Has a fixed width (e.g. `w-56`) when expanded, `w-14` when collapsed (icon-only)
   - Uses `overflow-y-auto` to scroll within its container
   - Renders grouped nav items with icons + labels (hidden when collapsed)
   - Highlights the active item
3. Add a local `collapsed` state + toggle button (using `PanelLeft` icon)
4. Keep the same `activeSection` state and `SectionContent` switch — no changes there
5. Layout structure:

```text
<div flex flex-col h-full>
  <!-- Header area (title + health card) — unchanged -->
  <div flex flex-1 min-h-0>
    <!-- Collapsible nav panel (plain div, not fixed) -->
    <aside w-56/w-14 border-r overflow-y-auto transition-all>
      [toggle button]
      [grouped nav items]
    </aside>
    <!-- Content area -->
    <main flex-1 overflow-y-auto p-6>
      [section heading]
      [SectionContent]
    </main>
  </div>
</div>
```

This is a straightforward flex layout — no fixed positioning, no viewport-height issues, fully contained within the parent.

