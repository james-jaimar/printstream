import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";

const VPS_PDF_API_URL = "https://pdf-api.jaimar.dev";

interface PrepareArtworkRequest {
  item_id: string;
  action: "crop" | "mark_ready" | "validate" | "use_proof_as_print" | "crop_to_bleed";
  crop_mm?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

interface PrepareArtworkResult {
  success: boolean;
  item_id: string;
  action: string;
  print_pdf_url?: string;
  print_pdf_status?: string;
  message?: string;
  error?: string;
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

    const request: PrepareArtworkRequest = await req.json();

    if (!request.item_id || !request.action) {
      return new Response(
        JSON.stringify({ error: "item_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Preparing artwork for item: ${request.item_id}, action: ${request.action}`);

    // Fetch the item
    const { data: item, error: fetchError } = await supabase
      .from("label_items")
      .select("*")
      .eq("id", request.item_id)
      .single();

    if (fetchError || !item) {
      throw new Error(`Item not found: ${fetchError?.message || "Unknown error"}`);
    }

    let result: PrepareArtworkResult = {
      success: false,
      item_id: request.item_id,
      action: request.action,
    };

    switch (request.action) {
      case "use_proof_as_print": {
        // Use the proof PDF as the print PDF (copy URL)
        if (!item.proof_pdf_url && !item.artwork_pdf_url) {
          throw new Error("No proof artwork available to use as print file");
        }

        const printUrl = item.proof_pdf_url || item.artwork_pdf_url;

        const { error: updateError } = await supabase
          .from("label_items")
          .update({
            print_pdf_url: printUrl,
            print_pdf_status: "ready",
            requires_crop: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.item_id);

        if (updateError) {
          throw new Error(`Failed to update item: ${updateError.message}`);
        }

        result = {
          success: true,
          item_id: request.item_id,
          action: request.action,
          print_pdf_url: printUrl,
          print_pdf_status: "ready",
          message: "Proof artwork marked as print-ready",
        };
        break;
      }

      case "crop": {
        // Crop the artwork using VPS
        const sourceUrl = item.proof_pdf_url || item.artwork_pdf_url;
        if (!sourceUrl) {
          throw new Error("No artwork available to crop");
        }

        const cropMm = request.crop_mm || item.crop_amount_mm;
        if (!cropMm) {
          throw new Error("No crop dimensions specified");
        }

        // Update status to processing
        await supabase
          .from("label_items")
          .update({ print_pdf_status: "processing" })
          .eq("id", request.item_id);

        // Call VPS crop endpoint
        const response = await fetch(`${VPS_PDF_API_URL}/manipulate/crop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            pdf_url: sourceUrl,
            crop_mm: cropMm,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`VPS crop error: ${response.status} - ${errorText}`);
          
          await supabase
            .from("label_items")
            .update({ print_pdf_status: "needs_crop" })
            .eq("id", request.item_id);

          throw new Error(`Crop failed: ${response.status}`);
        }

        const cropData = await response.json();

        // Upload cropped PDF to storage
        const timestamp = Date.now();
        const orderId = item.order_id;
        const storagePath = `label-items/${orderId}/${request.item_id}/print_${timestamp}.pdf`;

        const croppedPdfBytes = Uint8Array.from(
          atob(cropData.cropped_pdf_base64),
          (c) => c.charCodeAt(0)
        );

        const { error: uploadError } = await supabase.storage
          .from("label-files")
          .upload(storagePath, croppedPdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to upload cropped PDF: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from("label-files")
          .getPublicUrl(storagePath);

        // Update item with cropped PDF
        const { error: updateError } = await supabase
          .from("label_items")
          .update({
            print_pdf_url: urlData.publicUrl,
            print_pdf_status: "ready",
            requires_crop: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.item_id);

        if (updateError) {
          throw new Error(`Failed to update item: ${updateError.message}`);
        }

        result = {
          success: true,
          item_id: request.item_id,
          action: request.action,
          print_pdf_url: urlData.publicUrl,
          print_pdf_status: "ready",
          message: `Artwork cropped: ${cropData.original_size_mm?.width}x${cropData.original_size_mm?.height}mm → ${cropData.cropped_size_mm?.width}x${cropData.cropped_size_mm?.height}mm`,
        };
        break;
      }

      case "mark_ready": {
        // Mark the current print PDF as ready (no cropping needed)
        if (!item.print_pdf_url && !item.proof_pdf_url && !item.artwork_pdf_url) {
          throw new Error("No artwork available");
        }

        const printUrl = item.print_pdf_url || item.proof_pdf_url || item.artwork_pdf_url;

        const { error: updateError } = await supabase
          .from("label_items")
          .update({
            print_pdf_url: printUrl,
            print_pdf_status: "ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.item_id);

        if (updateError) {
          throw new Error(`Failed to update item: ${updateError.message}`);
        }

        result = {
          success: true,
          item_id: request.item_id,
          action: request.action,
          print_pdf_url: printUrl,
          print_pdf_status: "ready",
          message: "Artwork marked as print-ready",
        };
        break;
      }

      case "crop_to_bleed": {
        // Crop the PDF from MediaBox down to BleedBox using VPS page-boxes
        const sourceUrl = item.proof_pdf_url || item.artwork_pdf_url;
        if (!sourceUrl) {
          throw new Error("No artwork available to crop");
        }

        // Update status to processing
        await supabase
          .from("label_items")
          .update({ print_pdf_status: "processing" })
          .eq("id", request.item_id);

        // Step 1: Get page boxes from VPS
        const boxResponse = await fetch(`${VPS_PDF_API_URL}/page-boxes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({ pdf_url: sourceUrl }),
        });

        if (!boxResponse.ok) {
          await supabase
            .from("label_items")
            .update({ print_pdf_status: "needs_crop" })
            .eq("id", request.item_id);
          throw new Error(`Failed to get page boxes: ${boxResponse.status}`);
        }

        const boxData = await boxResponse.json();
        const mediabox = boxData.dimensions_mm || boxData.mediabox_mm;
        const bleedbox = boxData.bleedbox_mm || boxData.trimbox_mm;

        if (!mediabox || !bleedbox) {
          await supabase
            .from("label_items")
            .update({ print_pdf_status: "needs_crop" })
            .eq("id", request.item_id);
          throw new Error("PDF has no BleedBox or TrimBox metadata — cannot auto-crop");
        }

        const mediaW = mediabox.width;
        const mediaH = mediabox.height;
        const bleedW = bleedbox.width;
        const bleedH = bleedbox.height;

        // If MediaBox is already close to BleedBox, no crop needed
        if (Math.abs(mediaW - bleedW) < 0.5 && Math.abs(mediaH - bleedH) < 0.5) {
          // Just use as-is
          const { error: updateError } = await supabase
            .from("label_items")
            .update({
              print_pdf_url: sourceUrl,
              print_pdf_status: "ready",
              requires_crop: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", request.item_id);

          if (updateError) throw new Error(`Failed to update item: ${updateError.message}`);

          result = {
            success: true,
            item_id: request.item_id,
            action: request.action,
            print_pdf_url: sourceUrl,
            print_pdf_status: "ready",
            message: "No crop needed — MediaBox matches BleedBox",
          };
          break;
        }

        // Calculate symmetric crop offsets
        const cropLeft = (mediaW - bleedW) / 2;
        const cropRight = (mediaW - bleedW) / 2;
        const cropTop = (mediaH - bleedH) / 2;
        const cropBottom = (mediaH - bleedH) / 2;

        console.log(`Cropping to bleed: ${mediaW}x${mediaH}mm → ${bleedW}x${bleedH}mm (crop L${cropLeft.toFixed(1)} R${cropRight.toFixed(1)} T${cropTop.toFixed(1)} B${cropBottom.toFixed(1)})`);

        // Step 2: Crop via VPS
        const cropResponse = await fetch(`${VPS_PDF_API_URL}/manipulate/crop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            pdf_url: sourceUrl,
            crop_mm: {
              left: cropLeft,
              right: cropRight,
              top: cropTop,
              bottom: cropBottom,
            },
          }),
        });

        if (!cropResponse.ok) {
          const errorText = await cropResponse.text();
          console.error(`VPS crop_to_bleed error: ${cropResponse.status} - ${errorText}`);
          await supabase
            .from("label_items")
            .update({ print_pdf_status: "needs_crop" })
            .eq("id", request.item_id);
          throw new Error(`Crop to bleed failed: ${cropResponse.status}`);
        }

        const cropResult = await cropResponse.json();

        // Step 3: Upload cropped PDF
        const timestamp = Date.now();
        const orderId = item.order_id;
        const storagePath = `label-items/${orderId}/${request.item_id}/print_bleed_${timestamp}.pdf`;

        const croppedPdfBytes = Uint8Array.from(
          atob(cropResult.cropped_pdf_base64),
          (c) => c.charCodeAt(0)
        );

        const { error: uploadError } = await supabase.storage
          .from("label-files")
          .upload(storagePath, croppedPdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to upload cropped PDF: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from("label-files")
          .getPublicUrl(storagePath);

        // Step 4: Update item
        const { error: updateError } = await supabase
          .from("label_items")
          .update({
            print_pdf_url: urlData.publicUrl,
            print_pdf_status: "ready",
            requires_crop: false,
            crop_amount_mm: { left: cropLeft, right: cropRight, top: cropTop, bottom: cropBottom },
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.item_id);

        if (updateError) {
          throw new Error(`Failed to update item: ${updateError.message}`);
        }

        result = {
          success: true,
          item_id: request.item_id,
          action: request.action,
          print_pdf_url: urlData.publicUrl,
          print_pdf_status: "ready",
          message: `Cropped to bleed: ${mediaW.toFixed(1)}x${mediaH.toFixed(1)}mm → ${bleedW.toFixed(1)}x${bleedH.toFixed(1)}mm`,
        };
        break;
      }

      case "validate": {
        // Re-run validation on the artwork
        const pdfUrl = item.proof_pdf_url || item.artwork_pdf_url;
        if (!pdfUrl) {
          throw new Error("No artwork available to validate");
        }

        // Call page boxes endpoint
        const response = await fetch(`${VPS_PDF_API_URL}/page-boxes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({ pdf_url: pdfUrl }),
        });

        if (!response.ok) {
          throw new Error(`Validation failed: ${response.status}`);
        }

        const boxData = await response.json();

        // Update preflight report
        const { error: updateError } = await supabase
          .from("label_items")
          .update({
            width_mm: boxData.dimensions_mm?.width,
            height_mm: boxData.dimensions_mm?.height,
            preflight_report: boxData,
            preflight_status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.item_id);

        if (updateError) {
          throw new Error(`Failed to update item: ${updateError.message}`);
        }

        result = {
          success: true,
          item_id: request.item_id,
          action: request.action,
          message: `Validated: ${boxData.dimensions_mm?.width}x${boxData.dimensions_mm?.height}mm`,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    console.log(`Artwork preparation completed: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Prepare artwork error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
