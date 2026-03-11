/**
 * Label Layout Optimizer — Math Utilities
 * 
 * Pure calculation functions for HP Indigo label press layouts.
 * All optimization logic is handled by the AI edge function.
 */

import { LABEL_PRINT_CONSTANTS, INK_CONFIG_SPEEDS } from '@/types/labels';
import type { 
  LabelDieline, 
  LabelInkConfig,
  LayoutOption, 
  ProposedRun,
} from '@/types/labels';

const { MAX_FRAME_LENGTH_MM, MAKE_READY_FIRST_MIN } = LABEL_PRINT_CONSTANTS;

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
 * Format a layout option for display
 */
export function formatLayoutSummary(option: LayoutOption): string {
  return `${option.runs.length} run(s), ${option.total_meters.toFixed(1)}m total, ` +
         `${option.total_waste_meters.toFixed(1)}m waste`;
}
