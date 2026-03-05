

# Fix Broken Admin Tabs Layout

## Problem
The `TabsList` uses `grid-cols-13` which is not a default Tailwind utility (max is `grid-cols-12`). This causes the tabs to stack vertically instead of displaying in a row.

## Fix
Replace the rigid grid layout with `flex flex-wrap` so tabs flow naturally regardless of count. This is more resilient to adding/removing tabs in the future.

### File: `src/pages/tracker/TrackerAdmin.tsx`
- Change `TabsList` className from `grid w-full grid-cols-13` to `flex flex-wrap h-auto gap-1`
- This allows tabs to wrap naturally on smaller screens and handles any number of tabs

