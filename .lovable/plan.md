

# Enhanced Printer Reassignment: Quantity Doubling and Auto-Reschedule

## Overview

Enhance the existing "Move Jobs Between Printers" modal to handle the sheet size difference between A2 machines (HP 12000, T250) and the A3 machine (7900). When moving jobs from an A2 printer to the 7900, quantities automatically double. When moving from the 7900 to an A2 printer, quantities halve. After reassignment, the system auto-triggers a full reschedule so timings update immediately.

## How It Works

The three main printers and their effective sheet sizes:
- **HP 12000** -- A2 (large sheet)
- **T250** -- A2 equivalent (roll-to-roll, but effectively A2 page)
- **7900** -- A3 (half size)

Rules:
- HP 12000 to T250 (or vice versa): quantity stays the same (both A2)
- HP 12000 or T250 to 7900: quantity doubles (A2 to A3 = 2x sheets)
- 7900 to HP 12000 or T250: quantity halves (A3 to A2 = half sheets)

## What Changes

### 1. Database: Add size_class to production_stages

Add a `size_class` column to the `production_stages` table so the system knows which machines are A2 vs A3. This avoids hard-coding stage names or IDs.

```sql
ALTER TABLE production_stages 
  ADD COLUMN size_class TEXT DEFAULT NULL;

-- Set known values
UPDATE production_stages SET size_class = 'A2' WHERE id = '968c2e44-9fd1-452b-b497-fa29edda389c'; -- HP 12000
UPDATE production_stages SET size_class = 'A2' WHERE id = '18e39cec-1083-4b62-96fd-afd2caafc1d3'; -- T250
UPDATE production_stages SET size_class = 'A3' WHERE id = '906cd851-9c55-4694-bad8-7bffcfb10f45'; -- 7900
```

This column can also be managed from the Production Stages admin panel in future.

### 2. Update usePrinterReassignment Hook

- Fetch `size_class` alongside `id, name, color` when loading printer stages
- Add a `getQuantityMultiplier(sourceSizeClass, targetSizeClass)` function:
  - A2 to A3 = multiply by 2
  - A3 to A2 = multiply by 0.5
  - Same class = multiply by 1
- In `reassignJobs`, update the `quantity` field on each `job_stage_instances` row using the multiplier
- Also recalculate `estimated_duration_minutes` proportionally (double the sheets = double the print time)
- After successful reassignment, auto-trigger `simple-scheduler` with `{ commit: true, nuclear: true }` to rebuild the schedule

### 3. Update PrinterReassignmentModal UI

- Show a warning banner when the quantity will change (e.g., "Moving to 7900 (A3) will double quantities")
- In the job list, show the adjusted quantity in a preview column so the admin can see what will happen before confirming
- In the summary section, show total original vs adjusted quantities

### 4. Files to Modify

1. **New SQL migration** -- Add `size_class` column to `production_stages`, set values for the three printers
2. `src/hooks/tracker/usePrinterReassignment.ts` -- Add size_class to stage fetching, quantity multiplier logic, estimated_minutes recalculation, auto-reschedule call
3. `src/components/tracker/jobs/PrinterReassignmentModal.tsx` -- Show quantity adjustment warning and preview, display adjusted quantities per job

### 5. Edge Cases

- **Odd quantities when halving**: Round up (e.g., 1001 A3 sheets becomes 501 A2 sheets). Better to have one extra sheet than one missing
- **Jobs with null quantity**: Skip the multiplier, leave as-is
- **Envelope Printing / Large Format**: These don't have a `size_class` set, so multiplier defaults to 1 (no change). The modal already filters to printing stages only
