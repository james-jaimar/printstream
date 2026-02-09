import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";

const VPS_PDF_API_URL = "https://pdf-api.jaimar.dev";

interface SlotAssignment {
  slot: number;
  item_id: string;
  quantity_in_slot: number;
  pdf_url: string;
  needs_rotation?: boolean;
}

interface ImposeRequest {
  run_id: string;
  order_id: string;
  dieline: {
    roll_width_mm: number;
    label_width_mm: number;
    label_height_mm: number;
    columns_across: number;
    rows_around: number;
    horizontal_gap_mm: number;
    vertical_gap_mm: number;
    corner_radius_mm?: number;
  };
  slot_assignments: SlotAssignment[];
  include_dielines: boolean;
  meters_to_print: number;
}

interface ImposeResult {
  success: boolean;
  run_id: string;
  imposed_pdf_url: string;
  imposed_pdf_with_dielines_url?: string;
  frame_count: number;
  total_meters: number;
  processing_time_ms: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("VPS_PDF_API_KEY");
    if (!apiKey) {
      throw new Error("VPS_PDF_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const imposeRequest: ImposeRequest = await req.json();

    if (!imposeRequest.run_id || !imposeRequest.dieline || !imposeRequest.slot_assignments) {
      return new Response(
        JSON.stringify({ error: "run_id, dieline, and slot_assignments are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating imposition for run: ${imposeRequest.run_id}`);
    console.log(`Dieline: ${imposeRequest.dieline.columns_across}x${imposeRequest.dieline.rows_around}`);
    console.log(`Slot assignments: ${imposeRequest.slot_assignments.length}`);
    
    const startTime = Date.now();

    // Map slot assignments with rotation info for VPS
    const slotsWithRotation = imposeRequest.slot_assignments.map(slot => ({
      ...slot,
      rotation: slot.needs_rotation ? 90 : 0,
    }));

    // Call VPS PDF API imposition endpoint
    const response = await fetch(`${VPS_PDF_API_URL}/impose/labels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        dieline: imposeRequest.dieline,
        slots: slotsWithRotation,
        meters: imposeRequest.meters_to_print,
        include_dielines: imposeRequest.include_dielines,
        return_base64: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`VPS API error: ${response.status} - ${errorText}`);
      throw new Error(`Imposition error: ${response.status}`);
    }

    const impositionData = await response.json();
    const processingTime = Date.now() - startTime;

    // Upload imposed PDFs to Supabase Storage
    const timestamp = Date.now();
    const basePath = `label-runs/${imposeRequest.order_id}/${imposeRequest.run_id}`;

    // Upload production PDF (without dielines)
    const productionPdfBytes = Uint8Array.from(
      atob(impositionData.production_pdf_base64), 
      c => c.charCodeAt(0)
    );
    
    const { error: productionUploadError } = await supabase.storage
      .from("label-files")
      .upload(`${basePath}/production_${timestamp}.pdf`, productionPdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (productionUploadError) {
      throw new Error(`Failed to upload production PDF: ${productionUploadError.message}`);
    }

    const { data: productionUrl } = supabase.storage
      .from("label-files")
      .getPublicUrl(`${basePath}/production_${timestamp}.pdf`);

    let proofUrl: string | undefined;

    // Upload proof PDF (with dielines) if requested
    if (imposeRequest.include_dielines && impositionData.proof_pdf_base64) {
      const proofPdfBytes = Uint8Array.from(
        atob(impositionData.proof_pdf_base64), 
        c => c.charCodeAt(0)
      );
      
      const { error: proofUploadError } = await supabase.storage
        .from("label-files")
        .upload(`${basePath}/proof_${timestamp}.pdf`, proofPdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (proofUploadError) {
        console.warn("Failed to upload proof PDF:", proofUploadError);
      } else {
        const { data: proofUrlData } = supabase.storage
          .from("label-files")
          .getPublicUrl(`${basePath}/proof_${timestamp}.pdf`);
        proofUrl = proofUrlData.publicUrl;
      }
    }

    // Update label_runs table with PDF URLs
    const { error: updateError } = await supabase
      .from("label_runs")
      .update({
        imposed_pdf_url: productionUrl.publicUrl,
        imposed_pdf_with_dielines_url: proofUrl,
        frames_count: impositionData.frame_count,
        meters_to_print: impositionData.total_meters,
        updated_at: new Date().toISOString(),
      })
      .eq("id", imposeRequest.run_id);

    if (updateError) {
      console.warn("Failed to update label_runs:", updateError);
    }

    console.log(`Imposition completed in ${processingTime}ms`);
    console.log(`Frames: ${impositionData.frame_count}, Meters: ${impositionData.total_meters}`);

    const result: ImposeResult = {
      success: true,
      run_id: imposeRequest.run_id,
      imposed_pdf_url: productionUrl.publicUrl,
      imposed_pdf_with_dielines_url: proofUrl,
      frame_count: impositionData.frame_count,
      total_meters: impositionData.total_meters,
      processing_time_ms: processingTime,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Imposition error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
