/**
 * Label Rotate PDF Edge Function
 * 
 * Rotates a PDF by a given angle (90, 180, 270) via the VPS API.
 * Returns the rotated PDF as base64.
 */

import { corsHeaders } from "../_shared/cors.ts";

const VPS_API_URL = "https://pdf-api.jaimar.dev";
const VPS_API_KEY = Deno.env.get("VPS_PDF_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdf_url, angle = 90, item_id } = await req.json();

    if (!pdf_url) {
      return new Response(
        JSON.stringify({ success: false, error: "pdf_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (![90, 180, 270].includes(angle)) {
      return new Response(
        JSON.stringify({ success: false, error: "angle must be 90, 180, or 270" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[label-rotate-pdf] Rotating PDF by ${angle}° for item ${item_id || 'unknown'}`);

    const vpsResponse = await fetch(`${VPS_API_URL}/manipulate/rotate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": VPS_API_KEY,
      },
      body: JSON.stringify({ pdf_url, angle }),
    });

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      console.error(`[label-rotate-pdf] VPS error: ${vpsResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: `VPS rotate error: ${vpsResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rotateData = await vpsResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        item_id,
        rotated_pdf_base64: rotateData.rotated_pdf_base64,
        angle: rotateData.angle,
        page_count: rotateData.page_count,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[label-rotate-pdf] Error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
