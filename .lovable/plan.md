

# Schedule Board Redesign: Material Sub-Columns Per Day

## Overview

Replace the current flat day columns with a two-level column structure: each day has horizontal sub-columns for each unique material (substrate + glue + width). This gives operators a clear view of what material rolls are needed each day and lets them drag entire material columns between days.

## Visual Structure

```text
+------ Monday Feb 24 (6h 20m) ------+------ Tuesday Feb 25 (3h) ------+
| PP HM 333mm | SG Acr 333mm | PP 330 | PP HM 333mm | SG Acr 300mm    |
| 3h 40m      | 2h 40m       | --     | 1h 30m      | 1h 30m          |
|-------------|--------------|--------|-------------|-----------------|
| Order A     | Order D      |        | Order F     | Order G         |
| Order B     | Order E      |        |             |                 |
| Order C     |              |        |             |                 |
+-------------+--------------+--------+-------------+-----------------+
```

- Each day expands horizontally to fit however many material types it has
- Each material sub-column is independently droppable and its header is draggable (to move the whole group to another day)
- Capacity warning shown in day header when total exceeds 7 hours
- Horizontal scroll handles weeks with many materials

## Data Changes

Currently `label_stock` has: `substrate_type`, `glue_type`, `width_mm`. Orders link via `substrate_id`.

There are ~6 unique material combos in production today (PP/Semi Gloss, Hot Melt/Acrylic, 250/300/330/333mm), so this is very manageable horizontally.

## File Changes

### 1. `src/hooks/labels/useLabelSchedule.ts` -- Add substrate data

- Update both queries to join `label_orders.substrate_id` to `label_stock` to fetch `substrate_type`, `glue_type`, `width_mm`
- Add these fields to `ScheduledOrderGroup` and `UnscheduledOrderGroup` interfaces
- Add a `material_key` string field (e.g., "PP | Hot Melt | 333mm") to each group
- Add a helper function `getMaterialKey()`

### 2. `src/components/labels/schedule/MaterialColumn.tsx` -- New component

A single material sub-column within a day:
- Header shows material name (abbreviated), total duration, order count
- Header is draggable (drag type: `material-group`) to move all orders of this material to another day
- Body is a droppable zone accepting individual order cards
- Contains a SortableContext for reordering within the column
- Color-coded border by substrate type (blue for PP, green for Semi Gloss, etc.)

### 3. `src/components/labels/schedule/DayColumn.tsx` -- Redesign

- Day header stays (day name, date, total duration, capacity warning)
- Body now renders `MaterialColumn` sub-columns side-by-side (flex row) instead of a flat list
- Groups `scheduledOrders` by `material_key`
- Also has a general droppable zone for orders dropped on the day header directly (assigned to an "Other" material column or creates a new material sub-column)
- Capacity threshold: amber at 336 min (80%), red at 420 min (7h)

### 4. `src/components/labels/schedule/ScheduleOrderCard.tsx` -- Add material info

- Add a row showing: substrate type badge (color-coded), glue type, width in mm
- Keep existing metrics (meters, frames, duration)

### 5. `src/components/labels/schedule/LabelScheduleBoard.tsx` -- Updated DnD logic

New drag types handled:
- `order` (existing): drag single order card between columns/days
- `material-group` (new): drag all orders of a material+day to another day

New DnD ID scheme:
- Material columns: `material-{dateKey}-{materialKey}`
- When a material group is dropped on a day, reschedule ALL orders in that material group to the target day

Updated `handleDragEnd` to detect when the active item is a material group vs. an individual order and handle accordingly.

### 6. `src/components/labels/schedule/UnscheduledPanel.tsx` -- Group by material

- Group unscheduled orders by `material_key` with collapsible sections
- Each section header shows material name and order count

### 7. `src/components/labels/schedule/ScheduleOrderDetailModal.tsx` -- New component

Dialog shown when clicking an order card:
- Order number, customer, due date
- Full material details (substrate, glue, width, finish)
- List of individual runs with metrics
- Status controls (in progress, complete)
- Link to full order detail page

### 8. `src/components/labels/schedule/index.ts` -- Export new components

Add exports for `MaterialColumn` and `ScheduleOrderDetailModal`.

## Technical Details

### Material Key and Colors

```typescript
function getMaterialKey(substrateType?: string, glueType?: string, widthMm?: number): string {
  const parts = [substrateType || 'Unknown'];
  if (glueType) parts.push(glueType);
  if (widthMm) parts.push(`${widthMm}mm`);
  return parts.join(' | ');
}

const SUBSTRATE_COLORS = {
  'PP': 'bg-blue-100 text-blue-800 border-blue-300',
  'Semi Gloss': 'bg-green-100 text-green-800 border-green-300',
  'PE': 'bg-purple-100 text-purple-800 border-purple-300',
  'Vinyl': 'bg-red-100 text-red-800 border-red-300',
};
```

### Capacity Warning Logic

```typescript
const DAILY_CAPACITY_MINUTES = 420; // 7 hours
const WARNING_THRESHOLD = 0.8;      // amber at 80%

// In day header:
// totalMinutes >= 420 -> red warning "Exceeds capacity by Xh Ym"
// totalMinutes >= 336 -> amber warning "Near capacity"
```

### DnD Group Drag

When a `MaterialColumn` header is dragged to a different day:
1. Find all orders matching that `material_key` on the source day
2. Call `rescheduleOrder` for each order's schedule entries to the target date
3. Preserve relative sort order within the group

## File Summary

| File | Change |
|------|--------|
| `src/hooks/labels/useLabelSchedule.ts` | Join substrate data; add material fields to interfaces |
| `src/components/labels/schedule/MaterialColumn.tsx` | New: draggable/droppable material sub-column |
| `src/components/labels/schedule/DayColumn.tsx` | Render material sub-columns side-by-side; add capacity warning |
| `src/components/labels/schedule/ScheduleOrderCard.tsx` | Add material badges to card |
| `src/components/labels/schedule/LabelScheduleBoard.tsx` | Handle material-group drag type |
| `src/components/labels/schedule/UnscheduledPanel.tsx` | Group by material |
| `src/components/labels/schedule/ScheduleOrderDetailModal.tsx` | New: order detail modal |
| `src/components/labels/schedule/index.ts` | Export new components |

