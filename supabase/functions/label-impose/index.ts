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

/**
 * Pre-rotate a PDF 90° via VPS and upload the result to storage.
 * Returns the public URL of the rotated PDF.
 */
async function preRotatePdf(
  pdfUrl: string,
  itemId: string,
  orderId: string,
  runId: string,
  apiKey: string,
  supabase: any
): Promise<string> {
  console.log(`[label-impose] Pre-rotating PDF for item ${itemId}: ${pdfUrl}`);

  const rotateResponse = await fetch(`${VPS_PDF_API_URL}/manipulate/rotate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ pdf_url: pdfUrl, angle: 90 }),
  });

  if (!rotateResponse.ok) {
    const errorText = await rotateResponse.text().catch(() => "");
    throw new Error(`VPS rotate failed for item ${itemId}: ${rotateResponse.status} - ${errorText}`);
  }

  const rotateData = await rotateResponse.json();
  const rotatedBase64 = rotateData.rotated_pdf_base64;
  if (!rotatedBase64) {
    throw new Error(`VPS rotate returned no data for item ${itemId}`);
  }

  // Decode base64 to bytes
  const binaryString = atob(rotatedBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Upload to storage
  const rotatedPath = `label-runs/${orderId}/${runId}/rotated_${itemId}_${Date.now()}.pdf`;
  const { error: uploadError } = await supabase
    .storage
    .from("label-files")
    .upload(rotatedPath, bytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    throw new Error(`Failed to upload rotated PDF for item ${itemId}: ${uploadError.message}`);
  }

  // Use a signed URL (bucket is private) so VPS can access it
  const { data: signedData, error: signedError } = await supabase
    .storage
    .from("label-files")
    .createSignedUrl(rotatedPath, 3600); // 1 hour expiry

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL for rotated PDF: ${signedError?.message || 'no URL returned'}`);
  }

  console.log(`[label-impose] Pre-rotated PDF uploaded for item ${itemId}, signed URL created`);
  return signedData.signedUrl;
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
    console.log(`[label-impose] Label size: ${imposeRequest.dieline.label_width_mm}x${imposeRequest.dieline.label_height_mm}mm`);
    console.log(`[label-impose] Gaps: h=${imposeRequest.dieline.horizontal_gap_mm}mm v=${imposeRequest.dieline.vertical_gap_mm}mm`);
    console.log(`[label-impose] Slot assignments: ${imposeRequest.slot_assignments.length}`);

    // Log rotation flags for each slot
    for (const slot of imposeRequest.slot_assignments) {
      console.log(`[label-impose]   Slot ${slot.slot}: item=${slot.item_id} needs_rotation=${slot.needs_rotation} pdf_url=${slot.pdf_url ? 'present' : 'MISSING'}`);
    }

    // ─── DIMENSION AUTO-DETECTION: check artwork vs dieline orientation ───
    // This is a failsafe that physically prevents squashing regardless of DB flags
    const d = imposeRequest.dieline;
    const bleedH = (d.bleed_left_mm || 0) + (d.bleed_right_mm || 0);
    const bleedV = (d.bleed_top_mm || 0) + (d.bleed_bottom_mm || 0);
    const cellW = d.label_width_mm + bleedH;
    const cellH = d.label_height_mm + bleedV;
    const cellIsPortrait = cellH > cellW;
    const cellIsSquare = Math.abs(cellW - cellH) < 0.5;

    // Collect unique item PDFs to check dimensions
    const uniqueItems = new Map<string, string>(); // item_id -> pdf_url
    for (const slot of imposeRequest.slot_assignments) {
      if (slot.pdf_url && !uniqueItems.has(slot.item_id)) {
        uniqueItems.set(slot.item_id, slot.pdf_url);
      }
    }

    // Check each unique artwork's actual dimensions against the dieline
    const autoRotateItems = new Set<string>();
    if (!cellIsSquare) {
      const PT_TO_MM = 25.4 / 72;
      for (const [itemId, pdfUrl] of uniqueItems) {
        try {
          const pbResponse = await fetch(`${VPS_PDF_API_URL}/page-boxes`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey,
            },
            body: JSON.stringify({ pdf_url: pdfUrl }),
          });

          if (pbResponse.ok) {
            const pbData = await pbResponse.json();
            // Use trimbox first, fall back to mediabox
            const box = pbData.trimbox || pbData.bleedbox || pbData.cropbox || pbData.mediabox;
            if (box) {
              const artW = box.width * PT_TO_MM;
              const artH = box.height * PT_TO_MM;
              const artIsPortrait = artH > artW;

              if (artIsPortrait !== cellIsPortrait) {
                console.warn(`[label-impose] ⚠️ AUTO-DETECTED rotation needed for item ${itemId}: artwork=${Math.round(artW)}x${Math.round(artH)}mm (${artIsPortrait ? 'portrait' : 'landscape'}) vs cell=${Math.round(cellW)}x${Math.round(cellH)}mm (${cellIsPortrait ? 'portrait' : 'landscape'})`);
                autoRotateItems.add(itemId);
              } else {
                console.log(`[label-impose] ✓ Item ${itemId} orientation OK: artwork=${Math.round(artW)}x${Math.round(artH)}mm matches cell=${Math.round(cellW)}x${Math.round(cellH)}mm`);
              }
            }
          } else {
            const errText = await pbResponse.text().catch(() => '');
            console.warn(`[label-impose] Could not check page boxes for item ${itemId}: ${pbResponse.status} ${errText.substring(0, 100)}`);
          }
        } catch (pbErr) {
          console.warn(`[label-impose] Page boxes check failed for item ${itemId}:`, pbErr);
        }
      }
    }

    // Apply auto-detected rotation to slot assignments
    for (const slot of imposeRequest.slot_assignments) {
      if (autoRotateItems.has(slot.item_id)) {
        slot.needs_rotation = true;
      }
    }
    // ─── END DIMENSION AUTO-DETECTION ───

    // ─── NO PRE-ROTATION: rotation is handled natively by VPS during placement ───

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
        const gridSlot = (row * columnsAcross) + slot.slot + 1; // 1-based for VPS
        const rotationValue = slot.needs_rotation ? 90 : 0;
        expandedSlots.push({
          ...slot,
          slot: gridSlot,
          rotation: rotationValue,
        });
      }
    }

    console.log(`[label-impose] Expanded ${imposeRequest.slot_assignments.length} column slots to ${expandedSlots.length} grid slots`);

    // Log rotation values being sent to VPS
    const rotatedCount = expandedSlots.filter(s => s.rotation === 90).length;
    console.log(`[label-impose] Rotation: ${rotatedCount}/${expandedSlots.length} slots set to 90°`);

    const slotsWithRotation = expandedSlots;

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

    // Calculate page dimensions: cell = label + gap (reuse d from auto-detection above)
    const cellWidth = d.label_width_mm + d.horizontal_gap_mm;
    const cellHeight = d.label_height_mm + d.vertical_gap_mm;
    const pageWidth = cellWidth * d.columns_across;
    const pageHeight = cellHeight * d.rows_around;

    console.log(`[label-impose] Calculated page: ${pageWidth}mm x ${pageHeight}mm (cell: ${cellWidth}x${cellHeight})`);

    const vpsPayload = JSON.stringify({
      dieline: {
        ...imposeRequest.dieline,
        // Override label dims with cell size so VPS calculates correct page
        label_width_mm: cellWidth,
        label_height_mm: cellHeight,
        roll_width_mm: pageWidth,
        page_height_mm: pageHeight,
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
        console.log(`[label-impose] VPS accepted request (timeout hit — processing asynchronously via callback)`);
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
