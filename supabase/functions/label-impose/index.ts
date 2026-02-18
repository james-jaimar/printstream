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
    bleed_left_mm?: number;
    bleed_right_mm?: number;
    bleed_top_mm?: number;
    bleed_bottom_mm?: number;
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

    console.log(`[label-impose] === START run=${imposeRequest.run_id} ===`);
    console.log(`[label-impose] Dieline: ${imposeRequest.dieline.columns_across}x${imposeRequest.dieline.rows_around}`);
    console.log(`[label-impose] Slot assignments: ${imposeRequest.slot_assignments.length}`);

    const timestamp = Date.now();
    const basePath = `label-runs/${imposeRequest.order_id}/${imposeRequest.run_id}`;
    const productionPath = `${basePath}/production_${timestamp}.pdf`;
    const proofPath = `${basePath}/proof_${timestamp}.pdf`;

    // Generate signed upload URLs so the VPS can upload directly to storage
    console.log(`[label-impose] Creating production upload URL...`);
    const { data: productionUploadData, error: productionUploadError } = await supabase
      .storage
      .from("label-files")
      .createSignedUploadUrl(productionPath);

    if (productionUploadError) {
      console.error(`[label-impose] FAILED to create production upload URL:`, productionUploadError);
      throw new Error(`Failed to create production upload URL: ${productionUploadError.message}`);
    }
    console.log(`[label-impose] Production upload URL created OK`);

    let proofUploadUrl: string | undefined;
    let proofPublicUrl: string | undefined;

    if (imposeRequest.include_dielines) {
      console.log(`[label-impose] Creating proof upload URL...`);
      const { data: proofUploadData, error: proofUploadError } = await supabase
        .storage
        .from("label-files")
        .createSignedUploadUrl(proofPath);

      if (proofUploadError) {
        console.error(`[label-impose] FAILED to create proof upload URL:`, proofUploadError);
      } else {
        proofUploadUrl = proofUploadData.signedUrl;
        const { data: proofPubData } = supabase.storage
          .from("label-files")
          .getPublicUrl(proofPath);
        proofPublicUrl = proofPubData.publicUrl;
        console.log(`[label-impose] Proof upload URL created OK`);
      }
    }

    const { data: productionPubData } = supabase.storage
      .from("label-files")
      .getPublicUrl(productionPath);
    const productionPublicUrl = productionPubData.publicUrl;
    const productionUploadUrl = productionUploadData.signedUrl;

    // Expand column-based slots to fill all grid positions (columns x rows)
    const columnsAcross = imposeRequest.dieline.columns_across;
    const rowsAround = imposeRequest.dieline.rows_around;
    const expandedSlots: SlotAssignment[] = [];

    for (const slot of imposeRequest.slot_assignments) {
      for (let row = 0; row < rowsAround; row++) {
        expandedSlots.push({
          ...slot,
          slot: (row * columnsAcross) + slot.slot,
        });
      }
    }

    console.log(`[label-impose] Expanded ${imposeRequest.slot_assignments.length} column slots to ${expandedSlots.length} grid slots`);

    const slotsWithRotation = expandedSlots.map(slot => ({
      ...slot,
      rotation: slot.needs_rotation ? 90 : 0,
    }));

    const uploadConfig: Record<string, string> = {
      production_upload_url: productionUploadUrl,
      production_public_url: productionPublicUrl,
    };
    if (proofUploadUrl && proofPublicUrl) {
      uploadConfig.proof_upload_url = proofUploadUrl;
      uploadConfig.proof_public_url = proofPublicUrl;
    }

    const callbackConfig = {
      supabase_url: supabaseUrl,
      supabase_service_key: supabaseServiceKey,
      run_id: imposeRequest.run_id,
      production_public_url: productionPublicUrl,
      proof_public_url: proofPublicUrl || null,
    };

    // Mark run as "imposing"
    await supabase
      .from("label_runs")
      .update({
        status: "imposing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", imposeRequest.run_id);

    // Calculate page dimensions: cell = label + gap (gap/2 = bleed per side, cells butt together)
    const d = imposeRequest.dieline;
    const cellWidth = d.label_width_mm + d.horizontal_gap_mm;
    const cellHeight = d.label_height_mm + d.vertical_gap_mm;
    const pageWidth = cellWidth * d.columns_across;
    const pageHeight = cellHeight * d.rows_around;

    console.log(`[label-impose] Calculated page: ${pageWidth}mm x ${pageHeight}mm (cell: ${cellWidth}x${cellHeight})`);

    const vpsPayload = JSON.stringify({
      dieline: {
        ...imposeRequest.dieline,
        // Override label dims with cell size so VPS calculates correct page
        label_width_mm: cellWidth,    // e.g. 70 + 3 = 73
        label_height_mm: cellHeight,  // e.g. 100 + 3 = 103
        roll_width_mm: pageWidth,     // e.g. 73 * 4 = 292
        page_height_mm: pageHeight,   // e.g. 103 * 3 = 309
        horizontal_gap_mm: 0,
        vertical_gap_mm: 0,
      },
      slots: slotsWithRotation,
      meters: 0,
      include_dielines: imposeRequest.include_dielines,
      upload_config: uploadConfig,
      callback_config: callbackConfig,
    });

    const payloadSizeKB = (new TextEncoder().encode(vpsPayload).length / 1024).toFixed(1);
    console.log(`[label-impose] VPS payload size: ${payloadSizeKB} KB`);
    console.log(`[label-impose] Firing single VPS request (no retry — client handles 503)`);

    const controller = new AbortController();
    const acceptTimeout = setTimeout(() => controller.abort(), 60000);
    let response: Response | null = null;
    let aborted = false;

    try {
      response = await fetch(`${VPS_PDF_API_URL}/imposition/labels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        signal: controller.signal,
        body: vpsPayload,
      });
      clearTimeout(acceptTimeout);
    } catch (fetchError) {
      clearTimeout(acceptTimeout);
      if (fetchError.name === "AbortError") {
        console.log(`[label-impose] VPS accepted request (10s timeout hit — processing asynchronously via callback)`);
        aborted = true;
      } else {
        console.error(`[label-impose] VPS connection error:`, fetchError.message);
        await supabase
          .from("label_runs")
          .update({ status: "planned", updated_at: new Date().toISOString() })
          .eq("id", imposeRequest.run_id);

        return new Response(
          JSON.stringify({ success: false, error: `VPS connection failed: ${fetchError.message}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Handle VPS response
    if (response) {
      if (response.status === 503) {
        const busyBody = await response.text().catch(() => '');
        console.warn(`[label-impose] VPS returned 503 (busy): ${busyBody.substring(0, 200)}`);
        // Reset status back to planned so client can retry
        await supabase
          .from("label_runs")
          .update({ status: "planned", updated_at: new Date().toISOString() })
          .eq("id", imposeRequest.run_id);

        return new Response(
          JSON.stringify({ success: false, status: "vps_busy", error: "VPS is busy" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.ok) {
        const vpsResult = await response.json();
        console.log(`[label-impose] VPS responded immediately: ${vpsResult.frame_count} frames`);

        await supabase
          .from("label_runs")
          .update({
            imposed_pdf_url: productionPublicUrl,
            imposed_pdf_with_dielines_url: proofPublicUrl || null,
            status: "approved",
            updated_at: new Date().toISOString(),
          })
          .eq("id", imposeRequest.run_id);
      } else {
        const errorText = await response.text().catch(() => 'Could not read response body');
        console.error(`[label-impose] VPS error: status=${response.status} body=${errorText.substring(0, 500)}`);

        await supabase
          .from("label_runs")
          .update({ status: "planned", updated_at: new Date().toISOString() })
          .eq("id", imposeRequest.run_id);

        return new Response(
          JSON.stringify({ success: false, error: `VPS error: ${errorText.substring(0, 200)}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[label-impose] === DONE run=${imposeRequest.run_id} ===`);

    return new Response(
      JSON.stringify({
        success: true,
        status: aborted ? "processing" : "complete",
        run_id: imposeRequest.run_id,
        imposed_pdf_url: productionPublicUrl,
        imposed_pdf_with_dielines_url: proofPublicUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[label-impose] UNCAUGHT ERROR:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
