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

Deno.serve(async (req) => {
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
    const timestamp = Date.now();
    const basePath = `label-runs/${imposeRequest.order_id}/${imposeRequest.run_id}`;
    const productionPath = `${basePath}/production_${timestamp}.pdf`;
    const proofPath = `${basePath}/proof_${timestamp}.pdf`;

    // Generate signed upload URLs so the VPS can upload directly to storage
    const { data: productionUploadData, error: productionUploadError } = await supabase
      .storage
      .from("label-files")
      .createSignedUploadUrl(productionPath);

    if (productionUploadError) {
      throw new Error(`Failed to create production upload URL: ${productionUploadError.message}`);
    }

    let proofUploadUrl: string | undefined;
    let proofPublicUrl: string | undefined;

    if (imposeRequest.include_dielines) {
      const { data: proofUploadData, error: proofUploadError } = await supabase
        .storage
        .from("label-files")
        .createSignedUploadUrl(proofPath);

      if (proofUploadError) {
        console.warn("Failed to create proof upload URL:", proofUploadError);
      } else {
        proofUploadUrl = `${supabaseUrl}/storage/v1/${proofUploadData.fullPath}?token=${proofUploadData.token}`;
        const { data: proofPubData } = supabase.storage
          .from("label-files")
          .getPublicUrl(proofPath);
        proofPublicUrl = proofPubData.publicUrl;
      }
    }

    // Get public URL for production PDF
    const { data: productionPubData } = supabase.storage
      .from("label-files")
      .getPublicUrl(productionPath);
    const productionPublicUrl = productionPubData.publicUrl;

    // Build production signed upload URL
    const productionUploadUrl = `${supabaseUrl}/storage/v1/${productionUploadData.fullPath}?token=${productionUploadData.token}`;

    // Map slot assignments with rotation info
    const slotsWithRotation = imposeRequest.slot_assignments.map(slot => ({
      ...slot,
      rotation: slot.needs_rotation ? 90 : 0,
    }));

    // Build upload_config for VPS
    const uploadConfig: Record<string, string> = {
      production_upload_url: productionUploadUrl,
      production_public_url: productionPublicUrl,
    };
    if (proofUploadUrl && proofPublicUrl) {
      uploadConfig.proof_upload_url = proofUploadUrl;
      uploadConfig.proof_public_url = proofPublicUrl;
    }

    console.log("Calling VPS with upload_config (VPS will upload directly to storage)");

    // Call VPS — no more return_base64
    const response = await fetch(`${VPS_PDF_API_URL}/imposition/labels`, {
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
        upload_config: uploadConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`VPS API error: ${response.status} - ${errorText}`);
      throw new Error(`VPS error ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const vpsResult = await response.json();
    const processingTime = Date.now() - startTime;

    // VPS returns frame_count and total_meters — PDFs are already in storage
    const { error: updateError } = await supabase
      .from("label_runs")
      .update({
        imposed_pdf_url: productionPublicUrl,
        imposed_pdf_with_dielines_url: proofPublicUrl || null,
        frames_count: vpsResult.frame_count,
        meters_to_print: vpsResult.total_meters,
        updated_at: new Date().toISOString(),
      })
      .eq("id", imposeRequest.run_id);

    if (updateError) {
      console.warn("Failed to update label_runs:", updateError);
    }

    console.log(`Imposition completed in ${processingTime}ms`);
    console.log(`Frames: ${vpsResult.frame_count}, Meters: ${vpsResult.total_meters}`);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: imposeRequest.run_id,
        imposed_pdf_url: productionPublicUrl,
        imposed_pdf_with_dielines_url: proofPublicUrl,
        frame_count: vpsResult.frame_count,
        total_meters: vpsResult.total_meters,
        processing_time_ms: processingTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Imposition error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
