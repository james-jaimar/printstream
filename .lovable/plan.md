

## Add Ink Configuration (Color Mode) to Label Orders

### Overview

Add an `ink_config` field to label orders that determines the press speed for production calculations and scheduling. The four options are:

| Ink Config | Description | Press Speed |
|---|---|---|
| CMY | 3-colour process | 26 m/min |
| CMYK | 4-colour process | 22 m/min |
| CMYKW | 4-colour + White | 20 m/min |
| CMYKO | 4-colour + Orange | 20 m/min |

This replaces the current fixed 25 m/min constant with a dynamic speed based on the order's ink configuration.

### Step 1: Database Migration

Add `ink_config` column to `label_orders` table:

```sql
ALTER TABLE label_orders 
ADD COLUMN ink_config text NOT NULL DEFAULT 'CMYK';

ALTER TABLE label_orders 
ADD CONSTRAINT label_orders_ink_config_check 
CHECK (ink_config IN ('CMY', 'CMYK', 'CMYKW', 'CMYKO'));
```

### Step 2: Update Types

**File: `src/types/labels.ts`**

- Add `LabelInkConfig` type: `'CMY' | 'CMYK' | 'CMYKW' | 'CMYKO'`
- Add `INK_CONFIG_SPEEDS` constant mapping each config to its m/min speed
- Update `LABEL_PRINT_CONSTANTS` to keep the old `PRESS_SPEED_M_PER_MIN` as a fallback but add the new speed map
- Add `ink_config` to `LabelOrder` interface
- Add `ink_config` to `CreateLabelOrderInput` interface

```typescript
export type LabelInkConfig = 'CMY' | 'CMYK' | 'CMYKW' | 'CMYKO';

export const INK_CONFIG_SPEEDS: Record<LabelInkConfig, number> = {
  CMY: 26,
  CMYK: 22,
  CMYKW: 20,
  CMYKO: 20,
};

export const INK_CONFIG_LABELS: Record<LabelInkConfig, string> = {
  CMY: 'CMY (3-colour)',
  CMYK: 'CMYK (4-colour)',
  CMYKW: 'CMYK + White',
  CMYKO: 'CMYK + Orange',
};
```

### Step 3: Update Layout Optimizer

**File: `src/utils/labels/layoutOptimizer.ts`**

- Update `LayoutInput` interface to accept optional `inkConfig`
- Update `calculateProductionTime` and `calculateRunPrintTime` to accept an ink config parameter and use the corresponding speed instead of the fixed constant
- Fallback to `CMYK` (22 m/min) if no ink config provided

### Step 4: Update New Order Dialog

**File: `src/components/labels/NewLabelOrderDialog.tsx`**

- Add `ink_config` to the Zod form schema with default `'CMYK'`
- Add a select field in the "Print Specifications" section showing all four options with their speeds displayed (e.g. "CMYK (4-colour) -- 22 m/min")
- Pass `ink_config` through to the create mutation

### Step 5: Update Order Hooks

**File: `src/hooks/labels/useLabelOrders.ts`**

- Include `ink_config` in the `useCreateLabelOrder` insert call

### Step 6: Update Order Display

Wherever the order details are shown (e.g. `LabelOrderModal`, schedule board), display the ink configuration badge so operators know the colour setup.

### Step 7: Update Import Service

**File: `src/utils/labels/importService.ts`**

- Default imported orders to `'CMYK'` ink config (can be amended by admin later)

### Summary of Changes

| File | Change |
|---|---|
| Database migration | Add `ink_config` column with CHECK constraint |
| `src/types/labels.ts` | Add `LabelInkConfig` type, speed map, labels map; update `LabelOrder` and `CreateLabelOrderInput` |
| `src/utils/labels/layoutOptimizer.ts` | Use dynamic speed from ink config instead of fixed 25 m/min |
| `src/components/labels/NewLabelOrderDialog.tsx` | Add ink config selector in Print Specifications section |
| `src/hooks/labels/useLabelOrders.ts` | Pass `ink_config` in create mutation |
| `src/utils/labels/importService.ts` | Default to `'CMYK'` for imported orders |

