/**
 * Label Page Boxes Edge Function
 * 
 * Calls the VPS API to extract PDF page boxes (MediaBox, TrimBox, BleedBox, ArtBox)
 * Returns dimensions in mm for accurate prepress validation.
 */

import { corsHeaders } from "../_shared/cors.ts";

const VPS_API_URL = "https://pdf-api.jaimar.dev";
const VPS_API_KEY = Deno.env.get("VPS_PDF_API_KEY") || "";

// Points to mm conversion (1 pt = 0.3528 mm)
const PT_TO_MM = 25.4 / 72;

interface BoxDimensions {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;  // in points
  height: number; // in points
}

interface VpsPageBoxesResponse {
  mediabox: BoxDimensions | null;
  cropbox: BoxDimensions | null;
  bleedbox: BoxDimensions | null;
  trimbox: BoxDimensions | null;
  artbox: BoxDimensions | null;
  page_count: number;
}

interface BoxMm {
  width_mm: number;
  height_mm: number;
}

interface PageBoxesResponse {
  success: boolean;
  boxes: {
    mediabox: BoxMm | null;
    cropbox: BoxMm | null;
    bleedbox: BoxMm | null;
    trimbox: BoxMm | null;
    artbox: BoxMm | null;
  };
  primary_box: "trimbox" | "mediabox";
  dimensions_mm: BoxMm;
  page_count: number;
  error?: string;
}

function convertBoxToMm(box: BoxDimensions | null): BoxMm | null {
  if (!box) return null;
  return {
    width_mm: Math.round(box.width * PT_TO_MM * 100) / 100,
    height_mm: Math.round(box.height * PT_TO_MM * 100) / 100,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdf_url, item_id } = await req.json();

    if (!pdf_url) {
      return new Response(
        JSON.stringify({ success: false, error: "pdf_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[label-page-boxes] Requesting page boxes for: ${pdf_url.substring(0, 80)}...`);

    // Call VPS API to extract page boxes
    const vpsResponse = await fetch(`${VPS_API_URL}/page-boxes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": VPS_API_KEY,
      },
      body: JSON.stringify({ pdf_url }),
    });

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      console.error(`[label-page-boxes] VPS API error: ${vpsResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `VPS API error: ${vpsResponse.status}`,
          details: errorText,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vpsData: VpsPageBoxesResponse = await vpsResponse.json();
    console.log(`[label-page-boxes] VPS response:`, JSON.stringify(vpsData));

    // Convert all boxes to mm
    const boxes = {
      mediabox: convertBoxToMm(vpsData.mediabox),
      cropbox: convertBoxToMm(vpsData.cropbox),
      bleedbox: convertBoxToMm(vpsData.bleedbox),
      trimbox: convertBoxToMm(vpsData.trimbox),
      artbox: convertBoxToMm(vpsData.artbox),
    };

    // Determine which box to use for validation.
    // Priority:
    // 1) TrimBox (exact finished size)
    // 2) BleedBox (finished size + bleed)  <-- Acrobat "104x54mm" is typically this
    // 3) CropBox (sometimes used instead of Trim/Bleed)
    // 4) MediaBox (last resort)
    const primaryBox = boxes.trimbox ? "trimbox" : "mediabox";
    const dimensionsMm =
      boxes.trimbox ||
      boxes.bleedbox ||
      boxes.cropbox ||
      boxes.mediabox ||
      { width_mm: 0, height_mm: 0 };

    const response: PageBoxesResponse = {
      success: true,
      boxes,
      primary_box: primaryBox,
      dimensions_mm: dimensionsMm,
      page_count: vpsData.page_count || 1,
    };

    console.log(`[label-page-boxes] Returning: primary_box=${primaryBox}, dimensions=${dimensionsMm.width_mm}x${dimensionsMm.height_mm}mm`);

    return new Response(
      JSON.stringify({ ...response, item_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[label-page-boxes] Error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
