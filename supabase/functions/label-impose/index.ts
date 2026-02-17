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
        proofUploadUrl = proofUploadData.signedUrl;
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

    console.log(`Expanded ${imposeRequest.slot_assignments.length} column slots to ${expandedSlots.length} grid slots`);

    // Map expanded slots with rotation info
    const slotsWithRotation = expandedSlots.map(slot => ({
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

    // Build callback_config so VPS can update label_runs directly
    const callbackConfig = {
      supabase_url: supabaseUrl,
      supabase_service_key: supabaseServiceKey,
      run_id: imposeRequest.run_id,
      production_public_url: productionPublicUrl,
      proof_public_url: proofPublicUrl || null,
    };

    // Mark run as "imposing" so frontend knows it's in progress
    await supabase
      .from("label_runs")
      .update({
        status: "imposing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", imposeRequest.run_id);

    console.log("Firing VPS request (fire-and-forget with callback)");

    // Fire-and-forget: send to VPS but don't await the full response
    // Use a short timeout just to confirm the VPS accepted the request
    const controller = new AbortController();
    const acceptTimeout = setTimeout(() => controller.abort(), 10000); // 10s to accept

    try {
      const response = await fetch(`${VPS_PDF_API_URL}/imposition/labels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          dieline: imposeRequest.dieline,
          slots: slotsWithRotation,
          meters: 0, // Single frame only — VPS defaults to max(1, ...) so 0 yields exactly 1 page
          include_dielines: imposeRequest.include_dielines,
          upload_config: uploadConfig,
          callback_config: callbackConfig,
        }),
      });

      clearTimeout(acceptTimeout);

      // If we get a quick response (small jobs), handle it normally
      if (response.ok) {
        const vpsResult = await response.json();
        console.log(`VPS responded immediately: ${vpsResult.frame_count} frames`);

        // Update label_runs with the result
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
        const errorText = await response.text();
        console.error(`VPS error: ${response.status} - ${errorText}`);
        
        // Mark run as failed
        await supabase
          .from("label_runs")
          .update({
            status: "planned",
            updated_at: new Date().toISOString(),
          })
          .eq("id", imposeRequest.run_id);

        return new Response(
          JSON.stringify({ success: false, error: `VPS error: ${errorText.substring(0, 200)}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (fetchError) {
      clearTimeout(acceptTimeout);

      // AbortError means the VPS accepted but is still processing (large job)
      // The VPS will use callback_config to update label_runs when done
      if (fetchError.name === "AbortError") {
        console.log("VPS accepted request, processing asynchronously (will callback)");
      } else {
        console.error("VPS connection error:", fetchError);
        
        // Mark run back to planned on connection failure
        await supabase
          .from("label_runs")
          .update({
            status: "planned",
            updated_at: new Date().toISOString(),
          })
          .eq("id", imposeRequest.run_id);

        return new Response(
          JSON.stringify({ success: false, error: `VPS connection failed: ${fetchError.message}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Return immediately — VPS will update label_runs via callback when done
    return new Response(
      JSON.stringify({
        success: true,
        status: "processing",
        run_id: imposeRequest.run_id,
        imposed_pdf_url: productionPublicUrl,
        imposed_pdf_with_dielines_url: proofPublicUrl,
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
