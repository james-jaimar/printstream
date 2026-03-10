/**
 * Label Layout Optimizer — Math Utilities
 * 
 * Pure calculation functions for HP Indigo label press layouts.
 * All strategy/optimization logic is handled by the AI edge function.
 * This module provides: slot config, frame/meter math, scoring, trade-offs.
 */

import { LABEL_PRINT_CONSTANTS, DEFAULT_OPTIMIZATION_WEIGHTS, INK_CONFIG_SPEEDS } from '@/types/labels';
import type { 
  LabelItem, 
  LabelDieline, 
  LabelInkConfig,
  LayoutOption, 
  LayoutTradeOffs,
  ProposedRun, 
  SlotAssignment,
  OptimizationWeights 
} from '@/types/labels';

const { MAX_FRAME_LENGTH_MM, MAKE_READY_FIRST_MIN } = LABEL_PRINT_CONSTANTS;

/** Default absolute max overrun per slot (label count) */
export const DEFAULT_MAX_OVERRUN = 250;

export interface SlotConfig {
  totalSlots: number;
  labelsPerFrame: number;
  labelsPerSlotPerFrame: number;
  framesPerMeter: number;
}

/**
 * Calculate slot configuration from dieline
 */
export function getSlotConfig(dieline: LabelDieline): SlotConfig {
  const totalSlots = dieline.columns_across;
  const bleedVertical = (dieline.bleed_top_mm || 0) + (dieline.bleed_bottom_mm || 0);
  const templateHeightMm = dieline.label_height_mm * dieline.rows_around + 
                           dieline.vertical_gap_mm * (dieline.rows_around - 1) +
                           bleedVertical;
  const templatesPerFrame = Math.max(1, Math.floor(MAX_FRAME_LENGTH_MM / templateHeightMm));
  const labelsPerSlotPerFrame = dieline.rows_around * templatesPerFrame;
  const labelsPerFrame = totalSlots * labelsPerSlotPerFrame;
  const frameHeightMm = templateHeightMm * templatesPerFrame;
  const framesPerMeter = 1000 / frameHeightMm;
  
  return { totalSlots, labelsPerFrame, labelsPerSlotPerFrame, framesPerMeter };
}

/**
 * Calculate how many frames needed for a given quantity in ONE slot
 */
export function calculateFramesForSlot(quantity: number, config: SlotConfig): number {
  return Math.ceil(quantity / config.labelsPerSlotPerFrame);
}

/**
 * Calculate meters needed for a number of frames
 */
export function calculateMeters(frames: number, config: SlotConfig): number {
  return Math.round((frames / config.framesPerMeter) * 100) / 100;
}

/**
 * Calculate production time in minutes.
 */
export function calculateProductionTime(runs: ProposedRun[], inkConfig?: LabelInkConfig): number {
  const speed = INK_CONFIG_SPEEDS[inkConfig || 'CMYK'];
  const totalMeters = runs.reduce((sum, r) => sum + r.meters, 0);
  const printTimeMinutes = totalMeters / speed;
  return Math.ceil(MAKE_READY_FIRST_MIN + printTimeMinutes);
}

/**
 * Calculate print-only time for a single run (no make-ready).
 */
export function calculateRunPrintTime(run: ProposedRun, inkConfig?: LabelInkConfig): number {
  const speed = INK_CONFIG_SPEEDS[inkConfig || 'CMYK'];
  return Math.ceil(run.meters / speed);
}

/**
 * Score a layout option based on weighted criteria
 */
export function scoreLayout(
  option: Omit<LayoutOption, 'overall_score'>,
  weights: OptimizationWeights
): number {
  return (
    option.material_efficiency_score * weights.material_efficiency +
    option.print_efficiency_score * weights.print_efficiency +
    option.labor_efficiency_score * weights.labor_efficiency
  );
}

/**
 * Validate that a run's actual output doesn't exceed any slot's requested
 * quantity by more than maxOverrun.
 */
export function validateRunOverrun(
  assignments: SlotAssignment[],
  config: SlotConfig,
  maxOverrun: number
): boolean {
  const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
  const frames = calculateFramesForSlot(maxSlotQty, config);
  const actualPerSlot = frames * config.labelsPerSlotPerFrame;

  for (const a of assignments) {
    if (a.quantity_in_slot > 0 && (actualPerSlot - a.quantity_in_slot) > maxOverrun) {
      return false;
    }
  }
  return true;
}

/**
 * Create a single-item run — used as fallback when AI fails
 */
export function createSingleItemRun(
  item: LabelItem,
  runNumber: number,
  config: SlotConfig
): ProposedRun {
  const qtyPerSlot = Math.ceil(item.quantity / config.totalSlots);
  let remaining = item.quantity;
  
  const assignments: SlotAssignment[] = [];
  for (let s = 0; s < config.totalSlots; s++) {
    const qty = Math.min(qtyPerSlot, remaining);
    assignments.push({
      slot: s,
      item_id: item.id,
      quantity_in_slot: qty,
      needs_rotation: item.needs_rotation || false,
    });
    remaining -= qty;
  }
  
  const maxSlotQty = Math.max(...assignments.map(a => a.quantity_in_slot));
  const frames = calculateFramesForSlot(maxSlotQty, config);
  
  return {
    run_number: runNumber,
    slot_assignments: assignments,
    meters: calculateMeters(frames, config),
    frames,
  };
}

/**
 * Suggest a sensible qty_per_roll based on label dimensions
 */
export function suggestQtyPerRoll(dieline: LabelDieline): { suggested: number; note: string } {
  const labelArea = dieline.label_width_mm * dieline.label_height_mm;
  if (labelArea < 2500) {
    return { suggested: 1000, note: 'Small labels (<50mm) — suggested 1,000 per roll' };
  } else if (labelArea < 10000) {
    return { suggested: 500, note: 'Medium labels (50–100mm) — suggested 500 per roll' };
  } else {
    return { suggested: 250, note: 'Large labels (>100mm) — suggested 250 per roll' };
  }
}

/**
 * Build trade-off annotations from runs
 */
export function buildTradeOffs(
  runs: ProposedRun[],
  config: SlotConfig,
  dieline: LabelDieline,
  qtyPerRoll?: number,
  maxOverrun: number = DEFAULT_MAX_OVERRUN
): LayoutTradeOffs {
  let blankSlots = 0;
  for (const run of runs) {
    for (const slot of run.slot_assignments) {
      if (slot.quantity_in_slot === 0) blankSlots++;
    }
  }

  const overrunWarnings: string[] = [];
  for (const run of runs) {
    const actualPerSlot = run.frames * config.labelsPerSlotPerFrame;
    for (const slot of run.slot_assignments) {
      if (slot.quantity_in_slot > 0) {
        const overrun = actualPerSlot - slot.quantity_in_slot;
        if (overrun > maxOverrun) {
          overrunWarnings.push(
            `Run ${run.run_number}, Slot ${slot.slot + 1}: +${overrun} overrun (max ${maxOverrun})`
          );
        }
      }
    }
  }

  let rollSizeNote: string | undefined;
  if (!qtyPerRoll) {
    const suggestion = suggestQtyPerRoll(dieline);
    rollSizeNote = suggestion.note;
  }

  return {
    blank_slots_available: blankSlots,
    blank_slot_note: blankSlots > 0
      ? `${blankSlots} blank slot(s) available — use for internal labels or another job`
      : undefined,
    roll_size_note: rollSizeNote,
    overrun_warnings: overrunWarnings.length > 0 ? overrunWarnings : undefined,
  };
}

/**
 * Create a LayoutOption from proposed runs (scoring helper)
 */
export function createLayoutOption(
  id: string,
  runs: ProposedRun[],
  config: SlotConfig,
  theoreticalMinMeters: number,
  reasoning: string,
  qtyPerRoll?: number,
  dieline?: LabelDieline,
  maxOverrun: number = DEFAULT_MAX_OVERRUN
): Omit<LayoutOption, 'overall_score'> {
  const totalMeters = runs.reduce((sum, r) => sum + r.meters, 0);
  const totalFrames = runs.reduce((sum, r) => sum + r.frames, 0);
  const wasteMeters = Math.max(0, totalMeters - theoreticalMinMeters);
  
  const materialEfficiency = totalMeters > 0 
    ? Math.max(0, 1 - (wasteMeters / totalMeters)) 
    : 0;
  const printEfficiency = 1 / (1 + runs.length * 0.1);
  let laborEfficiency = 1 / (1 + runs.length * 0.15);
  
  if (qtyPerRoll && qtyPerRoll > 0) {
    const rewindingRuns = runs.filter(r => r.needs_rewinding);
    if (rewindingRuns.length > 0) {
      const rewindPenalty = (rewindingRuns.length / runs.length) * 0.4;
      laborEfficiency = Math.max(0, laborEfficiency - rewindPenalty);
    }
  }

  const trade_offs = dieline
    ? buildTradeOffs(runs, config, dieline, qtyPerRoll, maxOverrun)
    : undefined;
  
  return {
    id,
    runs,
    total_meters: totalMeters,
    total_frames: totalFrames,
    total_waste_meters: Math.round(wasteMeters * 100) / 100,
    material_efficiency_score: materialEfficiency,
    print_efficiency_score: printEfficiency,
    labor_efficiency_score: laborEfficiency,
    reasoning,
    trade_offs,
  };
}

/**
 * Format a layout option for display
 */
export function formatLayoutSummary(option: LayoutOption): string {
  return `${option.runs.length} run(s), ${option.total_meters.toFixed(1)}m total, ` +
         `${option.total_waste_meters.toFixed(1)}m waste, ` +
         `${Math.round(option.overall_score * 100)}% score`;
}
