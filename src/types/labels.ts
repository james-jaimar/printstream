/**
 * Labels Division Types
 * Completely isolated from Digital Division
 */

// HP Indigo Label Printing Constants
export const LABEL_PRINT_CONSTANTS = {
  MAX_FRAME_LENGTH_MM: 960,        // HP Indigo max print length
  ROLL_WIDTHS_MM: [250, 280, 320, 330] as const,
  FRAME_CHANGEOVER_MINUTES: 2,     // Time between frames
  SETUP_TIME_MINUTES: 15,          // Initial job setup
  METERS_PER_FRAME: 0.96,          // 960mm = 0.96m per frame
} as const;

// AI Optimization Weights (Configurable)
export const DEFAULT_OPTIMIZATION_WEIGHTS = {
  material_efficiency: 0.4,   // Minimize substrate waste
  print_efficiency: 0.35,     // Minimize number of runs/frames
  labor_efficiency: 0.25,     // Minimize handling/changeovers
} as const;

// Status types
export type LabelOrderStatus = 
  | 'quote' 
  | 'pending_approval' 
  | 'approved' 
  | 'in_production' 
  | 'completed' 
  | 'cancelled';

export type LabelRunStatus = 
  | 'planned' 
  | 'approved' 
  | 'printing' 
  | 'completed' 
  | 'cancelled';

export type LabelScheduleStatus = 
  | 'scheduled' 
  | 'in_progress' 
  | 'completed' 
  | 'cancelled';

export type PreflightStatus = 
  | 'pending' 
  | 'passed' 
  | 'failed' 
  | 'warnings';

export type PrintPdfStatus = 
  | 'pending' 
  | 'ready' 
  | 'processing' 
  | 'needs_crop';

export type ArtworkSource = 
  | 'admin' 
  | 'client';

export type ProofingStatus = 
  | 'draft' 
  | 'ready_for_proof' 
  | 'awaiting_client' 
  | 'client_needs_upload' 
  | 'approved';

export interface CropAmountMm {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type SubstrateType = 
  | 'Paper' 
  | 'PP' 
  | 'PE' 
  | 'PET' 
  | 'Vinyl';

export type FinishType = 
  | 'Gloss' 
  | 'Matt' 
  | 'Uncoated';

export type StockTransactionType = 
  | 'receipt' 
  | 'usage' 
  | 'adjustment' 
  | 'waste';

// Database table interfaces
export interface LabelDieline {
  id: string;
  name: string;
  roll_width_mm: number;
  label_width_mm: number;
  label_height_mm: number;
  columns_across: number;
  rows_around: number;
  horizontal_gap_mm: number;
  vertical_gap_mm: number;
  corner_radius_mm: number | null;
  dieline_pdf_url: string | null;
  is_custom: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Bleed specifications for asymmetric bleed support
  bleed_left_mm: number | null;
  bleed_right_mm: number | null;
  bleed_top_mm: number | null;
  bleed_bottom_mm: number | null;
}

export interface LabelStock {
  id: string;
  name: string;
  substrate_type: SubstrateType;
  finish: FinishType;
  width_mm: number;
  gsm: number | null;
  roll_length_meters: number;
  current_stock_meters: number;
  reorder_level_meters: number;
  cost_per_meter: number | null;
  supplier: string | null;
  last_stock_take: string | null;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabelOrder {
  id: string;
  order_number: string;
  quickeasy_wo_no: string | null;
  customer_id: string | null;
  customer_name: string;
  contact_name: string | null;
  contact_email: string | null;
  status: LabelOrderStatus;
  dieline_id: string | null;
  roll_width_mm: number | null;
  substrate_id: string | null;
  total_label_count: number;
  estimated_meters: number | null;
  estimated_frames: number | null;
  due_date: string | null;
  client_approved_at: string | null;
  client_approved_by: string | null;
  proof_token: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  dieline?: LabelDieline;
  substrate?: LabelStock;
  items?: LabelItem[];
  runs?: LabelRun[];
}

export interface LabelItem {
  id: string;
  order_id: string;
  item_number: number;
  name: string;
  artwork_pdf_url: string | null;
  artwork_thumbnail_url: string | null;
  // Dual artwork model - proof vs print-ready
  proof_pdf_url: string | null;
  proof_thumbnail_url: string | null;
  print_pdf_url: string | null;
  print_pdf_status: PrintPdfStatus;
  requires_crop: boolean;
  crop_amount_mm: CropAmountMm | null;
  artwork_source: ArtworkSource;
  // Proofing workflow
  proofing_status: ProofingStatus;
  artwork_issue: string | null;
  quantity: number;
  width_mm: number | null;
  height_mm: number | null;
  preflight_status: PreflightStatus;
  preflight_report: PreflightReport | null;
  is_cmyk: boolean | null;
  min_dpi: number | null;
  has_bleed: boolean | null;
  notes: string | null;
  // Orientation & multi-page support
  needs_rotation: boolean;
  page_count: number;
  parent_item_id: string | null;
  source_page_number: number | null;
  created_at: string;
  updated_at: string;
}

// PDF page box dimensions in mm
export interface PdfBoxMm {
  width_mm: number;
  height_mm: number;
}

// All PDF page boxes
export interface PdfBoxes {
  mediabox: PdfBoxMm | null;
  cropbox: PdfBoxMm | null;
  bleedbox: PdfBoxMm | null;
  trimbox: PdfBoxMm | null;
  artbox: PdfBoxMm | null;
}

export interface PreflightReport {
  page_count?: number;
  pdf_version?: string;
  has_bleed?: boolean;
  bleed_mm?: number;
  images?: ImageInfo[];
  low_res_images?: number;
  min_dpi?: number;
  fonts?: FontInfo[];
  unembedded_fonts?: number;
  color_spaces?: string[];
  has_rgb?: boolean;
  has_cmyk?: boolean;
  spot_colors?: string[];
  warnings?: string[];
  errors?: string[];
  // PDF page boxes for accurate dimension validation
  boxes?: PdfBoxes;
  primary_box?: "trimbox" | "mediabox";
}

export interface ImageInfo {
  page: number;
  width: number;
  height: number;
  color_space: string;
  bits_per_component: number;
  estimated_dpi: number | null;
  is_low_res: boolean;
}

export interface FontInfo {
  name: string;
  subtype: string;
  embedded: boolean;
  subset: boolean;
}

export interface SlotAssignment {
  slot: number;
  item_id: string;
  quantity_in_slot: number;
  needs_rotation?: boolean;
}

export interface LabelRun {
  id: string;
  order_id: string;
  run_number: number;
  slot_assignments: SlotAssignment[];
  meters_to_print: number | null;
  frames_count: number | null;
  estimated_duration_minutes: number | null;
  status: LabelRunStatus;
  ai_optimization_score: number | null;
  ai_reasoning: string | null;
  imposed_pdf_url: string | null;
  imposed_pdf_with_dielines_url: string | null;
  actual_meters_printed: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  schedule?: LabelSchedule;
}

export interface LabelSchedule {
  id: string;
  run_id: string;
  scheduled_date: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  printer_id: string | null;
  operator_id: string | null;
  status: LabelScheduleStatus;
  actual_start_time: string | null;
  actual_end_time: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined data
  run?: LabelRun;
}

export interface LabelStockTransaction {
  id: string;
  stock_id: string;
  run_id: string | null;
  transaction_type: StockTransactionType;
  meters: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// Form input types
export interface CreateLabelOrderInput {
  customer_id?: string;
  customer_name: string;
  contact_name?: string;
  contact_email?: string;
  dieline_id?: string;
  roll_width_mm?: number;
  substrate_id?: string;
  due_date?: string;
  notes?: string;
  quickeasy_wo_no?: string;
}

export interface CreateLabelItemInput {
  order_id: string;
  name: string;
  quantity: number;
  artwork_pdf_url?: string;
  artwork_thumbnail_url?: string;
  width_mm?: number;
  height_mm?: number;
  preflight_status?: PreflightStatus;
  preflight_report?: PreflightReport;
  notes?: string;
}

export interface CreateLabelDielineInput {
  name: string;
  roll_width_mm: number;
  label_width_mm: number;
  label_height_mm: number;
  columns_across: number;
  rows_around: number;
  horizontal_gap_mm?: number;
  vertical_gap_mm?: number;
  corner_radius_mm?: number;
  is_custom?: boolean;
}

// AI Layout types
export interface LayoutOption {
  id: string;
  runs: ProposedRun[];
  total_meters: number;
  total_frames: number;
  total_waste_meters: number;
  material_efficiency_score: number;
  print_efficiency_score: number;
  labor_efficiency_score: number;
  overall_score: number;
  reasoning: string;
}

export interface ProposedRun {
  run_number: number;
  slot_assignments: SlotAssignment[];
  meters: number;
  frames: number;
}

export interface OptimizationWeights {
  material_efficiency: number;
  print_efficiency: number;
  labor_efficiency: number;
}
