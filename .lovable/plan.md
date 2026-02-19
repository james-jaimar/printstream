

## Simplify Roll Labels

Remove the "Roll X of Y" text from both the label preview and PDF output. Each label will only show:

- Substrate name
- Substrate details (type, finish, gsm, width)
- Meters on this roll (e.g. "1500m")
- Unique barcode ID
- Date/time

This avoids confusion when old rolls coexist with new stock deliveries.

### Changes

**`src/components/labels/stock/StockBarcodeModal.tsx`**

1. **PDF generation** -- Change the roll info line from `Roll ${roll.rollNumber} of ${totalRolls} | ${roll.meters.toFixed(0)}m` to just `${roll.meters.toFixed(0)}m`
2. **Preview UI** -- Same change in the HTML preview: remove "Roll X of Y |" prefix, just show meters
3. **QR payload** -- Remove `roll_number` and `total_rolls` fields from the JSON encoded in the QR code (they add no value and would be misleading)
4. **Modal title** -- Change from "Stock Roll Labels (5 rolls)" to just "Stock Roll Labels" or show the count as informational only (e.g. "Generating 5 labels")
5. **Footer text** -- Simplify the "5 labels will be generated" note to remove "one per roll" language that implies sequencing

No database or type changes needed -- this is purely a display/output change.
