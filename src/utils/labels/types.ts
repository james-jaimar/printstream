/**
 * Quickeasy Label Import Types
 * Types specific to parsing and importing label jobs from Quickeasy Excel exports
 */

// Parsed label item from Excel row
export interface ParsedLabelItem {
  name: string;
  quantity: number;
  width_mm?: number;
  height_mm?: number;
  artwork_reference?: string;
  notes?: string;
}

// Parsed label order from Excel
export interface ParsedLabelOrder {
  wo_no: string;
  customer_name: string;
  contact_name?: string;
  contact_email?: string;
  due_date?: string;
  // Label specifications
  label_width_mm?: number;
  label_height_mm?: number;
  roll_width_mm?: number;
  substrate_type?: string;
  substrate_finish?: string;
  // Items in this order
  items: ParsedLabelItem[];
  // Raw data for debugging
  raw_notes?: string;
}

// Import statistics
export interface LabelImportStats {
  totalRows: number;
  ordersCreated: number;
  itemsCreated: number;
  skippedRows: number;
  errors: string[];
  warnings: string[];
  matchedDielines: number;
  matchedSubstrates: number;
}

// Excel column mapping for labels
export interface LabelColumnMap {
  woNo: number;
  customer: number;
  contact: number;
  email: number;
  dueDate: number;
  itemName: number;
  quantity: number;
  labelWidth: number;
  labelHeight: number;
  rollWidth: number;
  substrate: number;
  finish: number;
  notes: number;
  artworkRef: number;
}

// Matching result for dieline auto-detection
export interface DielineMatch {
  dieline_id: string;
  dieline_name: string;
  confidence: number;
  match_reason: string;
}

// Matching result for substrate auto-detection
export interface SubstrateMatch {
  substrate_id: string;
  substrate_name: string;
  confidence: number;
  match_reason: string;
}

// Complete parsed data from import
export interface ParsedLabelData {
  orders: ParsedLabelOrder[];
  stats: LabelImportStats;
}

// Import options
export interface LabelImportOptions {
  autoMatchDielines?: boolean;
  autoMatchSubstrates?: boolean;
  skipDuplicates?: boolean;
  verbose?: boolean;
}
