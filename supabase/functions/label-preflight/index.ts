import { corsHeaders } from "../_shared/cors.ts";

const VPS_PDF_API_URL = "https://pdf-api.jaimar.dev";

interface PreflightRequest {
  pdf_url: string;
  item_id?: string;
}

interface PreflightResult {
  success: boolean;
  item_id?: string;
  report: {
    page_count: number;
    pdf_version: string;
    has_bleed: boolean;
    bleed_mm?: number;
    images: ImageInfo[];
    low_res_images: number;
    min_dpi: number;
    fonts: FontInfo[];
    unembedded_fonts: number;
    color_spaces: string[];
    has_rgb: boolean;
    has_cmyk: boolean;
    spot_colors: string[];
    warnings: string[];
    errors: string[];
  };
  status: "passed" | "failed" | "warnings";
}

interface ImageInfo {
  page: number;
  width: number;
  height: number;
  color_space: string;
  bits_per_component: number;
  estimated_dpi: number | null;
  is_low_res: boolean;
}

interface FontInfo {
  name: string;
  subtype: string;
  embedded: boolean;
  subset: boolean;
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

    const { pdf_url, item_id }: PreflightRequest = await req.json();

    if (!pdf_url) {
      return new Response(
        JSON.stringify({ error: "pdf_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Running preflight check for: ${pdf_url}`);

    // Call VPS PDF API preflight endpoint
    const response = await fetch(`${VPS_PDF_API_URL}/preflight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ pdf_url }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`VPS API error: ${response.status} - ${errorText}`);
      throw new Error(`Preflight API error: ${response.status}`);
    }

    const preflightData = await response.json();
    console.log("Preflight completed successfully");

    // Determine status based on report
    let status: "passed" | "failed" | "warnings" = "passed";
    if (preflightData.errors && preflightData.errors.length > 0) {
      status = "failed";
    } else if (preflightData.warnings && preflightData.warnings.length > 0) {
      status = "warnings";
    } else if (preflightData.low_res_images > 0 || preflightData.unembedded_fonts > 0) {
      status = "warnings";
    }

    const result: PreflightResult = {
      success: true,
      item_id,
      report: preflightData,
      status,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Preflight error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
