
## Roll-Level Stock Tracking

Currently the system tracks stock as a single aggregate number (e.g. 7500m). This plan introduces individual roll tracking so each physical roll gets its own identity, meters remaining, and unique QR label.

### The Problem

- 7500m of stock at 1500m/roll = 5 rolls, but you can only print 1 label with 1 barcode today
- After using 500m from roll 1, you'd need to reprint ALL labels if the label shows total stock
- No way to identify which specific roll is which

### The Solution

A new `label_stock_rolls` database table that tracks individual rolls. Each roll has its own meters remaining and unique QR code. The label shows **roll meters**, not total stock.

---

### 1. New Database Table: `label_stock_rolls`

```text
label_stock_rolls
-----------------
id              UUID (PK)
stock_id        UUID (FK -> label_stock.id)
roll_number     INT (auto-incremented per stock item, e.g. 1, 2, 3...)
barcode         TEXT (unique QR identifier, e.g. LS-333-SEM-ABC123)
meters_remaining NUMERIC (starts at roll_length_meters, decremented on usage)
is_active       BOOLEAN (default true, false when roll is empty/retired)
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### 2. Updated Modal Flow

The `StockBarcodeModal` will be redesigned:

- **Step 1**: Modal opens showing the stock item info and calculates number of rolls (total stock / roll length)
- **Step 2**: Shows a list of rolls -- existing ones from DB plus any new ones to generate
- **Step 3**: User can select which rolls to print labels for (default: all)
- **Step 4**: Each label shows:
  - Substrate name, type, gsm, width
  - **Roll X of Y** (e.g. "Roll 3 of 5")
  - **This roll: 1000m** (not total stock)
  - Unique barcode ID for this specific roll
  - Date/time generated
  - QR code encoding this roll's unique data

### 3. Label Design Change

The label text changes from "Stock: 7500m" to:

```text
Semi Gloss
Semi Gloss - Gloss - 85gsm - 333mm
Roll 3 of 5 | 1000m
LS-333-SEM-R3-ABC123
19/02/2026, 12:34:48
```

The QR payload will encode the roll-specific data (roll ID, stock ID, meters remaining).

### 4. New TypeScript Type

```text
LabelStockRoll {
  id: string
  stock_id: string
  roll_number: number
  barcode: string
  meters_remaining: number
  is_active: boolean
  created_at: string
  updated_at: string
}
```

### 5. New Hook: `useLabelStockRolls`

- `useLabelStockRolls(stockId)` -- fetch all rolls for a stock item
- `useCreateStockRolls()` -- bulk create rolls when generating labels
- `useUpdateStockRoll()` -- update meters remaining on a single roll

### 6. Files to Create/Modify

| File | Action |
|------|--------|
| `label_stock_rolls` table | **Create** via SQL migration |
| `src/types/labels.ts` | **Edit** -- add `LabelStockRoll` interface |
| `src/hooks/labels/useLabelStockRolls.ts` | **Create** -- CRUD hooks for rolls |
| `src/components/labels/stock/StockBarcodeModal.tsx` | **Rewrite** -- roll selection UI, multi-label generation, updated preview |

### 7. How Re-labelling Works After Usage

When a roll is used (e.g. 500m consumed from roll 1):
1. Scan the roll's QR code (existing scanner feature)
2. System identifies the specific roll by its barcode
3. Stock transaction deducts from that roll's `meters_remaining`
4. User prints a new label for just that one roll -- shows updated meters
5. Other rolls are untouched, no need to reprint their labels

### 8. Migration Path

The existing `label_stock.barcode` field becomes less relevant (rolls have their own barcodes). It can be kept for backward compatibility but won't be actively used. The `current_stock_meters` on `label_stock` remains as the aggregate total (sum of all roll meters).
