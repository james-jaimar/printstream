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
// CMYK CONVERSION SERVICE
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
  run_id: string;
  imposed_pdf_url: string;
  imposed_pdf_with_dielines_url?: string;
  frame_count: number;
  total_meters: number;
  processing_time_ms: number;
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
 * Check if VPS PDF API is available
 */
export async function checkVpsApiHealth(): Promise<boolean> {
  try {
    // Simple preflight with a test - will fail but confirms connectivity
    const response = await fetch(`${SUPABASE_URL}/functions/v1/label-preflight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
      },
      body: JSON.stringify({ pdf_url: "health-check" }),
    });
    
    // Even a 400 error means the function is reachable
    return response.status !== 502 && response.status !== 503;
  } catch (error) {
    console.error("VPS API health check failed:", error);
    return false;
  }
}
