/**
 * VPS PDF API Service
 * Client-side service for interacting with the VPS PDF API via edge functions
 */

import { supabase } from "@/integrations/supabase/client";
import { PreflightReport, SlotAssignment } from "@/types/labels";

const SUPABASE_URL = "https://kgizusgqexmlfcqfjopk.supabase.co";

// ============================================================================
// PREFLIGHT SERVICE
// ============================================================================

export interface PreflightRequest {
  pdf_url: string;
  item_id?: string;
}

export interface PreflightResponse {
  success: boolean;
  item_id?: string;
  report: PreflightReport;
  status: "passed" | "failed" | "warnings";
  error?: string;
}

/**
 * Run preflight checks on a PDF file
 */
export async function runPreflight(request: PreflightRequest): Promise<PreflightResponse> {
  const { data, error } = await supabase.functions.invoke("label-preflight", {
    body: request,
  });

  if (error) {
    console.error("Preflight error:", error);
    throw new Error(`Preflight failed: ${error.message}`);
  }

  return data as PreflightResponse;
}

/**
 * Run preflight on multiple items in parallel
 */
export async function runBatchPreflight(
  items: { pdf_url: string; item_id: string }[]
): Promise<PreflightResponse[]> {
  const results = await Promise.allSettled(
    items.map(item => runPreflight(item))
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        success: false,
        item_id: items[index].item_id,
        report: {} as PreflightReport,
        status: "failed" as const,
        error: result.reason?.message || "Unknown error",
      };
    }
  });
}

// ============================================================================
// PAGE BOXES SERVICE (TrimBox, BleedBox, etc.)
// ============================================================================

export interface PageBoxesMm {
  width_mm: number;
  height_mm: number;
}

export interface PageBoxesResponse {
  success: boolean;
  item_id?: string;
  boxes: {
    mediabox: PageBoxesMm | null;
    cropbox: PageBoxesMm | null;
    bleedbox: PageBoxesMm | null;
    trimbox: PageBoxesMm | null;
    artbox: PageBoxesMm | null;
  };
  primary_box: "trimbox" | "mediabox";
  dimensions_mm: PageBoxesMm;
  page_count: number;
  error?: string;
}

/**
 * Get PDF page boxes (TrimBox, BleedBox, ArtBox) from VPS
 * This returns the actual trim dimensions for accurate validation
 */
export async function getPageBoxes(
  pdfUrl: string,
  itemId?: string
): Promise<PageBoxesResponse> {
  const { data, error } = await supabase.functions.invoke("label-page-boxes", {
    body: { pdf_url: pdfUrl, item_id: itemId },
  });

  if (error) {
    console.error("Page boxes error:", error);
    throw new Error(`Page boxes extraction failed: ${error.message}`);
  }

  return data as PageBoxesResponse;
}
// ============================================================================

export interface CmykConversionRequest {
  pdf_url: string;
  item_id?: string;
  output_filename?: string;
}

export interface CmykConversionResponse {
  success: boolean;
  item_id?: string;
  original_url: string;
  converted_url: string;
  conversion_details: {
    original_colorspace: string;
    converted_colorspace: string;
    processing_time_ms: number;
  };
  error?: string;
}

/**
 * Convert a PDF to CMYK colorspace
 */
export async function convertToCmyk(
  request: CmykConversionRequest
): Promise<CmykConversionResponse> {
  const { data, error } = await supabase.functions.invoke("label-convert-cmyk", {
    body: request,
  });

  if (error) {
    console.error("CMYK conversion error:", error);
    throw new Error(`CMYK conversion failed: ${error.message}`);
  }

  return data as CmykConversionResponse;
}

// ============================================================================
// IMPOSITION SERVICE
// ============================================================================

export interface DielineConfig {
  roll_width_mm: number;
  label_width_mm: number;
  label_height_mm: number;
  columns_across: number;
  rows_around: number;
  horizontal_gap_mm: number;
  vertical_gap_mm: number;
  corner_radius_mm?: number;
}

export interface ImpositionSlot extends SlotAssignment {
  pdf_url: string;
  needs_rotation?: boolean;
}

export interface ImpositionRequest {
  run_id: string;
  order_id: string;
  dieline: DielineConfig;
  slot_assignments: ImpositionSlot[];
  include_dielines: boolean;
  meters_to_print: number;
}

export interface ImpositionResponse {
  success: boolean;
  run_id?: string;
  status?: 'processing' | 'complete';
  imposed_pdf_url?: string;
  imposed_pdf_with_dielines_url?: string;
  frame_count?: number;
  total_meters?: number;
  processing_time_ms?: number;
  error?: string;
}

/**
 * Create imposed PDF for a label run
 */
export async function createImposition(
  request: ImpositionRequest
): Promise<ImpositionResponse> {
  const { data, error } = await supabase.functions.invoke("label-impose", {
    body: request,
  });

  if (error) {
    console.error("Imposition error:", error);
    throw new Error(`Imposition failed: ${error.message}`);
  }

  return data as ImpositionResponse;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Rotate a PDF by the given angle (90, 180, 270)
 */
export async function rotatePdf(
  pdfUrl: string,
  angle: number = 90,
  itemId?: string
): Promise<{ rotated_pdf_base64: string; angle: number; page_count: number }> {
  const { data, error } = await supabase.functions.invoke("label-rotate-pdf", {
    body: { pdf_url: pdfUrl, angle, item_id: itemId },
  });

  if (error) {
    console.error("Rotate PDF error:", error);
    throw new Error(`PDF rotation failed: ${error.message}`);
  }

  return data;
}

// ============================================================================
// SPLIT PDF SERVICE
// ============================================================================

export interface SplitPdfPage {
  page_number: number;
  pdf_url: string;
  width_mm: number;
  height_mm: number;
}

export interface SplitPdfResponse {
  success: boolean;
  item_id?: string;
  page_count: number;
  pages: SplitPdfPage[];
  child_item_ids: string[];
  error?: string;
}

/**
 * Split a multi-page PDF into individual items
 */
export async function splitPdf(
  itemId: string,
  pdfUrl: string,
  orderId: string,
  mode: "proof" | "print" = "proof"
): Promise<SplitPdfResponse> {
  const { data, error } = await supabase.functions.invoke("label-split-pdf", {
    body: { item_id: itemId, pdf_url: pdfUrl, order_id: orderId, mode },
  });

  if (error) {
    console.error("Split PDF error:", error);
    throw new Error(`PDF split failed: ${error.message}`);
  }

  return data as SplitPdfResponse;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if VPS PDF API is available
 */
export async function checkVpsApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/label-preflight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
      },
      body: JSON.stringify({ pdf_url: "health-check" }),
    });
    
    return response.status !== 502 && response.status !== 503;
  } catch (error) {
    console.error("VPS API health check failed:", error);
    return false;
  }
}
