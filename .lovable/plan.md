

## Root Cause: Pre-Rotation is a No-Op for the VPS Imposition Engine

### What's Actually Happening

The logs prove every layer is working correctly at the detection level:
- Auto-detection correctly identifies landscape artwork (160x60mm) vs portrait cells (63x163mm)
- Pre-rotation fires, uploads a "rotated" PDF, and creates a signed URL
- The VPS imposition engine receives the payload and returns "1 frames" successfully

**But the output is still squashed.** The issue is the pre-rotation strategy itself.

### The Real Bug

The VPS `/manipulate/rotate` endpoint almost certainly applies a PDF page-level rotation (setting the `/Rotate` flag on the PDF page dictionary) rather than performing a true content-stream transformation. This is a very common PDF behavior:

- A PDF with `/Rotate 90` will **display** as portrait in a PDF viewer
- But its **MediaBox** (the actual content dimensions) remains 160x60mm (landscape)
- When the VPS imposition engine reads this "rotated" PDF to place it in a cell, it reads the raw content dimensions (160x60mm) and **scales it to fit** a 63x163mm cell -- producing the exact squashing you see

The current code then sets `rotation: 0` for ALL slots (line 311), telling the VPS "don't rotate anything" -- but the artwork was never truly rotated in the first place.

### The Fix

**Remove the entire pre-rotation step and instead tell the VPS imposition engine to rotate during placement** by setting `rotation: 90` per slot. The imposition engine handles rotation natively during placement -- it knows how to rotate content within a cell without scaling.

### Changes to `supabase/functions/label-impose/index.ts`

1. **Remove** the entire pre-rotation block (lines 208-246): the `preRotatePdf` function call, the rotated URL map, and the URL-swapping logic
2. **Update** the slot rotation assignment (lines 310-314): instead of hardcoding `rotation: 0` for all slots, set `rotation: 90` for any slot where `needs_rotation` is true and `rotation: 0` for normal slots
3. **Keep** the dimension auto-detection block (lines 141-206) -- this remains valuable as a failsafe that forces `needs_rotation = true` when artwork orientation mismatches the cell
4. **Keep** the `preRotatePdf` function definition but it will become unused (can be removed for cleanliness)
5. **Add a log** showing what rotation value each slot is being sent with, so we can verify in logs

### Updated Rotation Logic (replaces lines 236-314)

```text
// No URL swapping needed -- use original artwork URLs
// Set rotation per slot based on needs_rotation flag
const expandedSlots = [];
for (const slot of imposeRequest.slot_assignments) {
  for (let row = 0; row < rowsAround; row++) {
    expandedSlots.push({
      ...slot,
      slot: (row * columnsAcross) + slot.slot + 1,
      rotation: slot.needs_rotation ? 90 : 0,
    });
  }
}
```

### Why This Will Work

- The VPS imposition engine already accepts a `rotation` field per slot
- Setting `rotation: 90` tells the engine to rotate the 160x60mm artwork 90 degrees during placement into the 63x163mm cell
- The engine handles this correctly because it transforms the content within the cell coordinate space, not by modifying the source PDF
- The artwork size is never changed -- it is placed at its native dimensions, just rotated

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/label-impose/index.ts` | Remove pre-rotation block; set `rotation: 90` for rotated slots instead of 0 |

### No Other Files Affected

The client-side code (`useBatchImpose.ts`, `vpsApiService.ts`) and the split function (`label-split-pdf`) remain unchanged. The `needs_rotation` flag detection, inheritance, and auto-detection all stay in place.

