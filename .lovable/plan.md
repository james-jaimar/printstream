

## Visual Roll View for Stock Management

Add a third "Rolls" view mode that shows each substrate as a set of roll icons, where each icon represents one physical roll and its fill level shows how much material remains.

### How It Works

For each substrate, the system calculates:
- **Full rolls**: `Math.floor(current_stock_meters / roll_length_meters)` -- shown as 100% filled icons
- **Partial roll**: `current_stock_meters % roll_length_meters` -- shown as a partially filled icon (e.g., 750m remaining on a 1500m roll = 50% filled)
- If a substrate has 0 meters, show one empty roll icon

### Fill Level and Colours

Each roll icon fills from the bottom up based on `meters_remaining_on_this_roll / roll_length_meters`:
- **Green** (above 75%): nearly full roll
- **Amber/Yellow** (25%-75%): partially used
- **Red** (below 25%): almost empty

This gives the print operator a direct visual match to what they see on their shelves -- 3 rolls, one green, one amber, one red.

### What Each Roll Card Shows

- Roll icon (SVG) with proportional fill
- Substrate name and key specs (width, type, glue)
- Meters on this roll (e.g., "1500m" for full, "375m" for partial)
- "Full" badge for complete rolls vs actual meters for partial
- Click to open substrate details

### View Toggle

The existing List/Grid toggle becomes a three-way toggle: **List | Grid | Rolls**

### Filters

All existing filters (search, substrate type, finish, glue, stock level) apply identically -- substrates are filtered first, then their rolls are rendered.

---

### Technical Details

**New file: `src/components/labels/stock/StockRollView.tsx`**

- Accepts same props as other views (stock array + callbacks)
- For each substrate, calculates number of full rolls + one partial roll from `current_stock_meters` and `roll_length_meters`
- Renders an inline SVG roll graphic per roll, with a clip-rect that fills proportionally
- Color based on fill percentage thresholds (green/amber/red)
- Responsive grid layout, grouped by substrate

**Modified: `src/components/labels/stock/index.ts`**

- Export `StockRollView`

**Modified: `src/pages/labels/LabelsStock.tsx`**

- Extend `viewMode` state to `'list' | 'grid' | 'rolls'`
- Add third toggle button with a cylinder/roll icon
- Render `StockRollView` when `viewMode === 'rolls'`
- Add "Out of Stock" option to stock level filter (`current_stock_meters === 0`)

