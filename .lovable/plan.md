
# "Send to Print" -- Batch Imposition for Label Runs

## What Changes

### 1. Add a "Send to Print" button on the Production Runs card
Currently each run is an individual clickable card. The user wants a single action at the order level that says "these runs are ready -- generate all imposition PDFs."

**File: `src/components/labels/LabelRunsCard.tsx`**
- Add a "Send to Print" button in the card header (next to the "Completed" counter)
- Button is enabled only when all runs are in `planned` status and the order has a dieline
- Clicking it triggers imposition for ALL runs sequentially, updating each run's status to `approved` and storing the resulting PDF URLs
- Show a progress indicator ("Imposing run 3 of 8...") while processing
- Once complete, all runs show `approved` status with their `imposed_pdf_url` populated

### 2. Create a `useBatchImpose` hook to orchestrate the process
**New file: `src/hooks/labels/useBatchImpose.ts`**

This hook will:
- Accept the order's runs, items, and dieline
- Iterate through each run sequentially
- For each run:
  1. Build the `ImpositionRequest` by looking up each slot's `item_id` to find the item's `print_pdf_url`
  2. Call `createImposition()` from `vpsApiService` (which invokes the `label-impose` edge function)
  3. The edge function already uploads the PDF to storage and updates the `label_runs` row with `imposed_pdf_url`
  4. After successful imposition, update the run status to `approved`
- Track progress (current run index, total, errors)
- Return `{ impose, isImposing, progress, errors }`

### 3. Wire into the LabelRunsCard UI
**File: `src/components/labels/LabelRunsCard.tsx`**

- Import and use `useBatchImpose`
- Add `orderId` and `onImpositionComplete` to the component props
- The "Send to Print" button calls `impose()` from the hook
- During processing, show a progress bar and disable the button
- After completion, show a toast with the result

### 4. Pass orderId down from LabelOrderModal
**File: `src/components/labels/order/LabelOrderModal.tsx`**

- Pass `orderId={order.id}` to `LabelRunsCard`

## Technical Details

### Batch imposition flow per run:
```text
For each run in order.runs:
  1. Build slot_assignments with pdf_url:
     slot.item_id -> find item -> item.print_pdf_url
  2. Call createImposition({
       run_id: run.id,
       order_id: orderId,
       dieline: { roll_width_mm, label_width_mm, ... },
       slot_assignments: [...with pdf_url],
       include_dielines: true,
       meters_to_print: run.meters_to_print
     })
  3. Edge function handles PDF generation + storage upload + DB update
  4. Update run status to 'approved'
```

### useBatchImpose hook interface:
```text
interface BatchImposeProgress {
  current: number;
  total: number;
  currentRunNumber: number;
  status: 'idle' | 'imposing' | 'complete' | 'error';
  errors: { runNumber: number; error: string }[];
}

useBatchImpose(orderId, runs, items, dieline) => {
  impose: () => Promise<void>,
  isImposing: boolean,
  progress: BatchImposeProgress
}
```

### UI changes to LabelRunsCard header:
- Add a `Printer` icon button labeled "Send to Print" in the header area
- Only shown when there are runs and none are yet approved/printing
- While imposing, shows "Imposing Run X of Y..." with a progress bar
- After complete, button changes to a checkmark "All Imposed"
