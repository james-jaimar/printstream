
# Plan: Separate Proof and Print-Ready Item Views

## Problem Summary

Currently the Labels workflow has a "separation of concerns" issue:

1. **Proof Artwork tab and Print-Ready tab both show the same 6 items** - The tabs control *uploading* behavior but don't filter the item grid below
2. **AI Layout Optimizer sees all 6 files** - It should only work with print-ready items for production layouts
3. **Duplicate items were created** - When proof artwork was uploaded, 3 items were created. When print-ready artwork was uploaded, 3 more items were created instead of updating the existing ones

The dual-artwork model (`proof_pdf_url` and `print_pdf_url` on a single `LabelItem`) isn't being utilized correctly - the UI creates separate items instead of linking proof and print files to the same item.

---

## Solution Architecture

### Approach: Filter Items by Tab Context

Rather than creating duplicate items, we'll:
1. Filter the displayed items based on which tab is active
2. Pass only print-ready items to the AI Layout Optimizer
3. Fix the item matching logic so print-ready uploads update existing items

---

## Implementation Details

### 1. Update `LabelOrderModal.tsx` - Add Tab State for Item Display

Connect the upload zone's tab state to the items grid display.

**Changes**:
- Lift the `activeTab` state from `DualArtworkUploadZone` to `LabelOrderModal`
- Pass the tab state to control which items are displayed
- Filter items based on tab:
  - **Proof tab**: Show items that have `proof_pdf_url` or `artwork_pdf_url`
  - **Print-Ready tab**: Show items that have `print_pdf_url`

```typescript
// In LabelOrderModal
const [artworkTab, setArtworkTab] = useState<'proof' | 'print'>('proof');

// Filter items based on active tab
const filteredItems = useMemo(() => {
  if (!order?.items) return [];
  
  if (artworkTab === 'proof') {
    // Show items with proof/artwork files
    return order.items.filter(item => 
      item.proof_pdf_url || item.artwork_pdf_url
    );
  } else {
    // Show items with print-ready files
    return order.items.filter(item => 
      item.print_pdf_url
    );
  }
}, [order?.items, artworkTab]);
```

### 2. Update `DualArtworkUploadZone.tsx` - Accept External Tab Control

Make the component accept tab state from parent for synchronized control.

**Changes**:
- Add optional `activeTab` and `onTabChange` props
- Use these when provided, otherwise use internal state

```typescript
interface DualArtworkUploadZoneProps {
  // ... existing props
  activeTab?: 'proof' | 'print';
  onTabChange?: (tab: 'proof' | 'print') => void;
}
```

### 3. Fix Item Matching Logic in `handleDualFilesUploaded`

The current logic only matches by exact name. We need better matching to link print files to existing proof items.

**Current problem**:
- File: `Eazi Tool BLUE (4300).pdf` uploaded to proof → creates item named `Eazi Tool BLUE (4300)`
- File: `Eazi Tool BLUE (4300).pdf` uploaded to print → should update existing item, but name matching may fail

**Fix**: Improve the matching algorithm:
- Strip common suffixes like "proof", "print", "final", etc.
- Use case-insensitive matching
- Match by normalized base name

```typescript
function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(pdf|png|jpg|jpeg)$/i, '')
    .replace(/[\s_-]*(proof|print|final|ready|v\d+)[\s_-]*/gi, '')
    .trim();
}

// In handleDualFilesUploaded
const normalizedFileName = normalizeItemName(file.name);
const existingItem = order.items?.find(item => 
  normalizeItemName(item.name) === normalizedFileName
);
```

### 4. Update AI Layout Optimizer - Only Use Print-Ready Items

Modify `LabelOrderModal.tsx` to pass only print-ready items to the `LayoutOptimizer`.

**Changes**:
```typescript
// In the LayoutOptimizer dialog
const printReadyItems = useMemo(() => {
  return (order?.items || []).filter(item => item.print_pdf_url);
}, [order?.items]);

<LayoutOptimizer
  orderId={order.id}
  items={printReadyItems}  // Only print-ready items
  dieline={order.dieline || null}
  onLayoutApplied={...}
/>
```

### 5. Update Grid Display Based on Context

Show appropriate thumbnails and info based on which tab is active.

**Changes to `LabelItemsGrid.tsx`**:
- Accept a `viewMode` prop ('proof' | 'print')
- Choose appropriate thumbnail URL based on mode
- Show appropriate status indicators

```typescript
interface LabelItemsGridProps {
  items: LabelItem[];
  orderId: string;
  viewMode?: 'proof' | 'print';
  itemAnalyses?: Record<string, ItemAnalysis>;
}

// In the render
const thumbnailUrl = viewMode === 'print' 
  ? item.print_thumbnail_url || item.artwork_thumbnail_url
  : item.proof_thumbnail_url || item.artwork_thumbnail_url;
```

---

## Files to Change

1. **`src/components/labels/order/LabelOrderModal.tsx`**
   - Lift tab state from upload zone to modal level
   - Filter items based on active tab
   - Pass only print-ready items to AI Layout Optimizer
   - Add tab synchronization with items grid

2. **`src/components/labels/items/DualArtworkUploadZone.tsx`**
   - Accept external tab control props
   - Use parent-controlled state when provided

3. **`src/components/labels/items/LabelItemsGrid.tsx`**
   - Accept `viewMode` prop
   - Display appropriate thumbnails/status based on mode

4. **`src/components/labels/order/LabelOrderModal.tsx`** (item matching)
   - Improve name normalization for print-ready file matching
   - Update existing items instead of creating duplicates

---

## Expected Result

After implementation:
- **Proof Artwork tab**: Shows only items with proof files (3 items)
- **Print-Ready tab**: Shows only items with print files (3 items if uploaded, or 0 if not yet prepared)
- **AI Layout Optimizer**: Works only with print-ready items (production-focused)
- **Uploading print files**: Updates existing items rather than creating duplicates

---

## Technical Details

```text
Current Data Model (per LabelItem):
┌─────────────────────────────────────────────────┐
│  LabelItem                                      │
│  ├── proof_pdf_url        (client-facing)       │
│  ├── proof_thumbnail_url                        │
│  ├── print_pdf_url        (production)          │
│  ├── print_pdf_status     (pending/ready/...)   │
│  └── artwork_pdf_url      (legacy/combined)     │
└─────────────────────────────────────────────────┘

Tab Filtering Logic:
┌──────────────┐     ┌──────────────┐
│  Proof Tab   │     │ Print Tab    │
│ proof_pdf_url│     │ print_pdf_url│
│     OR       │     │              │
│artwork_pdf   │     │              │
└──────────────┘     └──────────────┘
       │                    │
       ▼                    ▼
   Filter items         Filter items
   with proof           with print
       │                    │
       ▼                    ▼
   LabelItemsGrid       LabelItemsGrid
   (proof view)         (print view)
```

