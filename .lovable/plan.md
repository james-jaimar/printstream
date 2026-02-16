

# Fix Auto-Imposition from Client Portal

## Problem

The auto-imposition code in `label-client-data/index.ts` only sends `{ run_id }` to the `label-impose` edge function, but `label-impose` requires a full request payload including dieline config, slot assignments with PDF URLs, meters to print, etc. Every auto-impose call silently fails.

Additionally, this order was marked `approved` via a manual SQL migration before the approval flow could trigger naturally, so auto-imposition was never attempted.

## Fix

Update the auto-imposition section in `label-client-data/index.ts` to build the complete `ImposeRequest` for each run by:

1. Fetching the order's dieline config from `label_dielines` (via `label_orders.dieline_id`)
2. For each planned run, reading its `slot_assignments` and enriching each slot with the item's `print_pdf_url` from `label_items`
3. Sending the full payload to `label-impose`

### What changes in `label-client-data/index.ts`

Replace the fire-and-forget block (lines ~377-402) with:

```typescript
// Fetch dieline for this order
const { data: orderWithDieline } = await supabase
  .from("label_orders")
  .select("dieline_id, label_dielines(*)")
  .eq("id", order_id)
  .single();

const dieline = orderWithDieline?.label_dielines;

if (dieline && runs && runs.length > 0) {
  // Build item PDF lookup map
  const itemPdfMap = new Map(
    (allItems || [])
      .filter((i: any) => i.print_pdf_url)
      .map((i: any) => [i.id, i.print_pdf_url])
  );

  for (const run of runs) {
    // Enrich slot assignments with pdf_url
    const slots = (run.slot_assignments || []).map((slot: any) => ({
      slot: slot.slot,
      item_id: slot.item_id,
      quantity_in_slot: slot.quantity_in_slot,
      needs_rotation: slot.needs_rotation || false,
      pdf_url: itemPdfMap.get(slot.item_id) || "",
    }));

    const imposePayload = {
      run_id: run.id,
      order_id: order_id,
      dieline: {
        roll_width_mm: dieline.roll_width_mm,
        label_width_mm: dieline.label_width_mm,
        label_height_mm: dieline.label_height_mm,
        columns_across: dieline.columns_across,
        rows_around: dieline.rows_around,
        horizontal_gap_mm: dieline.horizontal_gap_mm,
        vertical_gap_mm: dieline.vertical_gap_mm,
        corner_radius_mm: dieline.corner_radius_mm,
      },
      slot_assignments: slots,
      include_dielines: true,
      meters_to_print: run.meters_to_print || 1,
    };

    fetch(`${supabaseUrl}/functions/v1/label-impose`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(imposePayload),
    }).catch((err) =>
      console.error("Auto-impose error for run", run.id, err)
    );
  }
}
```

Also update the runs query to include `slot_assignments` and `meters_to_print`:
```typescript
const { data: runs } = await supabase
  .from("label_runs")
  .select("id, slot_assignments, meters_to_print")
  .eq("order_id", order_id)
  .eq("status", "planned");
```

### Testing

After deploying, we need to re-trigger the approval flow. Since the order is already approved, we can either:
- Reset the order status to `pending_approval` and re-approve from the portal, OR
- Manually trigger `label-impose` for each run using the operator "Send to Print" button

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/label-client-data/index.ts` | Build full impose request with dieline, enriched slots, and meters |

