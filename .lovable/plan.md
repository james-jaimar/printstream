
# Fix Plan: Proof Area Buttons & AI Layout Flexibility

## Problem Summary

**Issue 1**: The "Use as Print" buttons appear in the Proof Artwork section. These buttons shouldn't show here as it confuses the workflow - the proof area is for client-facing files, and preparation actions belong in a separate context.

**Issue 2**: The AI Layout Optimizer shows "Artwork Not Ready for Production" and blocks layout generation when items only have proof files. The system should allow previewing/generating layouts with proof files while only enforcing print-ready status at the final "Apply Layout" stage.

---

## Solution

### 1. Remove "Use as Print" buttons from Proof Area

**What changes**: The item cards displayed in the main order view will no longer show the "Use as Print" or "Auto-Crop" buttons.

**Why**: These preparation actions are better suited to the AI Layout workflow where there's a clear "Prepare Items" action. Showing them on every card in the proof area clutters the interface and creates confusion about the workflow.

**Technical approach**:
- Modify `LabelItemsGrid` to NOT pass `onPrepareArtwork` to `LabelItemCard`
- The preparation actions will remain available in the AI Layout Optimizer panel via the "Prepare X Items" button

---

### 2. Allow AI Layout to Generate Options with Proof Files

**What changes**: 
- Layout generation will work when items have proof files (not just print-ready)
- The warning will change from blocking to informational ("X items will need print files before production")
- The "Apply Layout" button will remain locked until all items are print-ready

**Why**: This allows admins to plan production layouts during the proofing phase, optimizing the workflow and providing earlier visibility into production schedules.

**Technical approach**:
- Update the artwork readiness check in `LayoutOptimizer` to distinguish between:
  - Items with NO artwork (blocking)
  - Items with proof artwork but no print file (allow generation, warn at apply)
  - Items with print-ready files (fully ready)
- Change the alert from blocking to informational when items have proof but not print
- Move the "Prepare Items" action to be more prominent

---

## Files to Change

1. **`src/components/labels/items/LabelItemsGrid.tsx`**
   - Remove the `onPrepareArtwork` handler from `LabelItemCard` calls

2. **`src/components/labels/LayoutOptimizer.tsx`**
   - Update `artworkReadiness` logic to check for ANY artwork (proof or print)
   - Add separate tracking for "has artwork" vs "is print-ready"
   - Change alert to informational when items have proof files
   - Keep "Apply Layout" disabled only when items aren't print-ready

---

## Expected Result

After these changes:
- The order view will show clean item cards without action buttons
- AI Layout can generate options for orders where items have proof artwork
- The "Prepare Items" button in the AI Layout dialog handles artwork preparation
- Final layout application remains blocked until artwork is print-ready, maintaining production safety

---

## Technical Details

```text
Artwork State Machine:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   No Artwork    │ -> │   Proof Only    │ -> │  Print Ready    │
│  (blocks all)   │    │ (allows layout) │    │ (allows apply)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**`artworkReadiness` updated logic**:
- `hasArtwork`: Item has `proof_pdf_url` OR `artwork_pdf_url` OR `print_pdf_url`
- `isPrintReady`: Item has `print_pdf_status === 'ready'`
- `canGenerateLayout`: All items have artwork (proof or print)
- `canApplyLayout`: All items are print-ready
