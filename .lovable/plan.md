

# Layout Preview: 3-Column Grid for Run Diagrams

## Change
Update the "Preview Layout Diagram" section in `LayoutOptimizer.tsx` to display run diagrams in a 3-column grid instead of a single full-width column. This lets the admin see all runs at a glance without excessive scrolling.

Also update `SlotLayoutPreview.tsx` (used elsewhere) with the same 3-column grid for consistency.

## Technical Details

### File: `src/components/labels/LayoutOptimizer.tsx` (lines 281-295)
- Change the `div` wrapper from `space-y-6` (vertical stack) to a `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` layout
- Pass `compact={true}` to each `RunLayoutDiagram` so they render at a smaller scale suitable for 3-across viewing
- Increase the ScrollArea height from `h-[50vh]` to `h-[60vh]` to give more room for the grid

### File: `src/components/labels/SlotLayoutPreview.tsx` (lines 18-33)
- Change the wrapper from `space-y-4` to `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` for consistency

Both changes are purely layout/CSS -- no logic changes needed.

