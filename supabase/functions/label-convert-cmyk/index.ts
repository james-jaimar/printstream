import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";

const VPS_PDF_API_URL = "https://pdf-api.jaimar.dev";

interface ConvertRequest {
  pdf_url: string;
  item_id?: string;
  output_filename?: string;
}

interface ConvertResult {
  success: boolean;
  item_id?: string;
  original_url: string;
  converted_url: string;
  conversion_details: {
    original_colorspace: string;
    converted_colorspace: string;
    processing_time_ms: number;
  };
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

    const { pdf_url, item_id, output_filename }: ConvertRequest = await req.json();

    if (!pdf_url) {
      return new Response(
        JSON.stringify({ error: "pdf_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Converting to CMYK: ${pdf_url}`);
    const startTime = Date.now();

    // Call VPS PDF API CMYK conversion endpoint
    const response = await fetch(`${VPS_PDF_API_URL}/convert/cmyk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ 
        pdf_url,
        return_base64: true // Get the converted PDF as base64
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`VPS API error: ${response.status} - ${errorText}`);
      throw new Error(`CMYK conversion error: ${response.status}`);
    }

    const conversionData = await response.json();
    const processingTime = Date.now() - startTime;

    // Upload converted PDF to Supabase Storage
    const filename = output_filename || `cmyk_${item_id || Date.now()}.pdf`;
    const storagePath = `label-artwork/cmyk/${filename}`;

    // Decode base64 and upload
    const pdfBytes = Uint8Array.from(atob(conversionData.pdf_base64), c => c.charCodeAt(0));
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("label-files")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Failed to upload converted PDF: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("label-files")
      .getPublicUrl(storagePath);

    console.log(`CMYK conversion completed in ${processingTime}ms`);

    const result: ConvertResult = {
      success: true,
      item_id,
      original_url: pdf_url,
      converted_url: urlData.publicUrl,
      conversion_details: {
        original_colorspace: conversionData.original_colorspace || "RGB",
        converted_colorspace: "CMYK",
        processing_time_ms: processingTime,
      },
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("CMYK conversion error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
