
# Visual Layout Diagram for Label Optimizer

## Overview
Enhance the label layout visualization by creating an interactive, print-accurate diagram that clearly shows how labels are arranged on the press roll - similar to the reference image provided.

## Issues to Fix

### 1. Dialog Accessibility Warning
The `LabelOrderModal` component has a DialogContent without a proper DialogTitle inside the DialogHeader for accessibility. Need to add a visually hidden title for screen readers.

**File:** `src/components/labels/order/LabelOrderModal.tsx`

---

## Main Feature: Visual Layout Diagram

### Component: `RunLayoutDiagram`
A new component that renders a visual representation of a single production run showing:

```text
                    Run 1 - 360m
                        |
    +-------------------+-------------------+
    |    +---------+  +---------+  +---------+  |
    |    |    1    |  |    2    |  |    3    |  |
    |    +---------+  +---------+  +---------+  |
    |    +---------+  +---------+  +---------+  |
    |    |    1    |  |    2    |  |    3    |  |
W   |    +---------+  +---------+  +---------+  | W
e   |    +---------+  +---------+  +---------+  | e
b   |    |    1    |  |    2    |  |    3    |  | b
    |    +---------+  +---------+  +---------+  |
D   |    +---------+  +---------+  +---------+  | D
i   |    |    1    |  |    2    |  |    3    |  | i
r   |    +---------+  +---------+  +---------+  | r
    |    +---------+  +---------+  +---------+  |
    |    |    1    |  |    2    |  |    3    |  |
    +-------------------+-------------------+
                        |
                        v  (print direction)
```

### Key Visual Elements

1. **Run Header**
   - Run number with status badge
   - Total meters for this run
   - Frame count

2. **Roll Container**
   - Vertical web direction arrows on left and right
   - Border representing the roll edges
   - Roll width indication

3. **Label Grid**
   - Columns = `dieline.columns_across` (slots)
   - Rows = `dieline.rows_around` (labels per frame)
   - Each cell shows:
     - Slot number (1, 2, 3...)
     - Item color coding (matching legend)
     - Optional: miniature thumbnail of artwork

4. **Slot Legend**
   - Color-coded squares with item names
   - Quantity per slot
   - Total labels printed in this run

5. **Summary Stats**
   - Frames: X
   - Meters: X.Xm
   - Estimated time: ~X min

---

## File Changes

### 1. New File: `src/components/labels/optimizer/RunLayoutDiagram.tsx`
Main visual diagram component with:
- CSS Grid layout for label cells
- SVG arrows for web direction
- Color-coded slots matching item legend
- Hover tooltips with item details
- Responsive sizing

### 2. Update: `src/components/labels/SlotLayoutPreview.tsx`
Replace the simple horizontal bar with the new `RunLayoutDiagram` component for each run.

### 3. Update: `src/components/labels/LabelRunsCard.tsx`
Add a "View Layout" button that opens a dialog with the full visual diagram.

### 4. Update: `src/components/labels/order/LabelOrderModal.tsx`
- Fix accessibility warning by adding a VisuallyHidden DialogTitle
- Integrate the new layout diagram in the Production section

### 5. Update: `src/components/labels/LayoutOptimizer.tsx`
Show the visual diagram when an option is selected so users can preview before applying.

---

## Technical Details

### Color Assignment Logic
```typescript
const itemColors = [
  { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600' },
  { bg: 'bg-green-500', text: 'text-white', border: 'border-green-600' },
  { bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-600' },
  // ... more colors
];
```

### Grid Rendering
- Use CSS Grid with `grid-template-columns: repeat(columns_across, minmax(60px, 1fr))`
- Show `rows_around` rows to represent one frame
- Add visual separator between frames when multiple shown

### Responsive Behavior
- On mobile: Show simplified view with numbers only
- On desktop: Full grid with thumbnails option
- Zoomable/pannable for large layouts (>6 slots)

---

## Dependencies
No new dependencies required - uses existing Tailwind CSS and Radix UI components.

## Accessibility
- ARIA labels for diagram regions
- Keyboard navigable slots
- Screen reader description of layout
- Fix DialogTitle warning with VisuallyHidden component
