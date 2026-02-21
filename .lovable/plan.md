

# Substrate Highlight + Service Ordering Workflow

## Part 1: Substrate Selector Highlight

The selected substrate row currently uses `bg-primary/10` which is barely visible. We will make it much more prominent.

**File: `src/components/labels/SubstrateSelector.tsx`**
- Change the selected row class from `bg-primary/10` to `bg-primary/15 ring-1 ring-primary/40 font-semibold` so it stands out with a colored ring and stronger background
- The "selected display" box above already has `border-primary/30 bg-primary/5` which is fine -- no changes needed there

---

## Part 2: Stepped "Add Services" Workflow

Currently "Add Service" is a flat picker -- user picks any service type in any order. The request is to make it a guided, sequential workflow that respects a canonical order. When a user adds services later, they should be inserted at their correct position (not appended to the end).

### Canonical Service Order

| Position | Service Type | Required? |
|---|---|---|
| 1 | `finishing` (Die Cutting and Finishing) | Every order |
| 2 | `rewinding` | Optional |
| 3 | `joining` | Optional |
| 4 | `handwork` | Optional |
| 5 | `qa` | Optional |
| 6 | `packaging` | Optional |
| 7 | `delivery` | Every order |

### Changes to `AddServiceDialog.tsx`

Transform the dialog into a **stepped wizard** that walks through each service type in order:

1. **Step indicator** at the top showing the 7 service types as small dots/labels, highlighting the current step
2. For each step, the user sees the service type name, description, and options:
   - A toggle: "Include this service" (Yes/No or Skip)
   - If included: the existing detail form (finishing option picker, delivery method, quantity, notes, etc.)
3. Navigation: "Skip" and "Next" buttons move through the steps
4. At the end, a summary step showing all selected services, then "Save All" commits them in one batch
5. The `sort_order` value is set based on canonical position (100, 200, 300, ...) so later additions slot in correctly

### Smart Sort Order on Insert

When the user re-opens the dialog later to add more services:
- The wizard skips service types already added (shows them as "Already added" with a checkmark)
- The `sort_order` for newly added services uses the canonical position values, so a "handwork" service added later automatically sorts between "joining" and "qa" rather than appearing at the bottom
- Canonical sort values: finishing=100, rewinding=200, joining=300, handwork=400, qa=500, packaging=600, delivery=700

### File Changes

**`src/components/labels/order/AddServiceDialog.tsx`** -- Major rewrite:
- Replace the current 2-step (pick type then fill details) with a multi-step wizard
- Add a `CANONICAL_ORDER` map defining sort positions
- Each step renders the relevant form fields for that service type
- "Skip" moves to the next step without adding; "Add and Continue" saves and moves on
- "Finish" at the end closes the dialog
- Pass existing services as a prop so the wizard knows which types are already configured

**`src/components/labels/order/FinishingServicesCard.tsx`** -- Minor update:
- Pass the current `services` list into `AddServiceDialog` so it knows which types exist already

**`src/hooks/labels/useLabelOrderServices.ts`** -- Minor update:
- Add a batch insert mutation (`useAddOrderServiceBatch`) that inserts multiple services at once, or keep using the single insert but call it sequentially

### Wizard UX Flow

```
Step 1/7: Die Cutting & Finishing
  [Finishing Option dropdown]
  [Display Name]
  [Quantity / Unit]
  [Notes]
  [ Skip ]  [ Add & Continue >>> ]

Step 2/7: Rewinding
  "Does this order need rewinding?"
  [ Skip ]  [ Add & Continue >>> ]

...

Step 7/7: Delivery / Collection
  [Delivery Method dropdown]
  [Display Name]
  [Notes]
  [ Skip ]  [ Add & Finish ]
```

- Steps already added show a green checkmark and are auto-skipped (or show "Already configured -- skip" with an option to add another of the same type if multiples are allowed)
- The progress dots at the top let the user see where they are

### Summary

- 3 files modified: `SubstrateSelector.tsx`, `AddServiceDialog.tsx`, `FinishingServicesCard.tsx`
- 1 possible new batch mutation in `useLabelOrderServices.ts`
- No database changes needed (sort_order column already exists)

