/**
 * Label Split PDF Edge Function
 * 
 * Splits a multi-page PDF into individual single-page PDFs.
 * Creates child label_items linked to the parent via parent_item_id.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";

const VPS_API_URL = "https://pdf-api.jaimar.dev";
const VPS_API_KEY = Deno.env.get("VPS_PDF_API_KEY") || "";
const PT_TO_MM = 25.4 / 72;

interface SplitPage {
  page_number: number;
  pdf_base64: string;
  width_pts: number;
  height_pts: number;
}

interface VpsSplitResponse {
  page_count: number;
  pages: SplitPage[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { item_id, pdf_url, order_id } = await req.json();

    if (!item_id || !pdf_url || !order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "item_id, pdf_url, and order_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[label-split-pdf] Splitting PDF for item ${item_id}`);

    // Call VPS split endpoint
    const vpsResponse = await fetch(`${VPS_API_URL}/manipulate/split`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": VPS_API_KEY,
      },
      body: JSON.stringify({ pdf_url }),
    });

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      console.error(`[label-split-pdf] VPS error: ${vpsResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: `VPS split error: ${vpsResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const splitData: VpsSplitResponse = await vpsResponse.json();
    console.log(`[label-split-pdf] Split into ${splitData.page_count} pages`);

    if (splitData.page_count <= 1) {
      return new Response(
        JSON.stringify({ success: true, page_count: 1, pages: [], child_item_ids: [], message: "PDF is single-page, no split needed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get parent item to inherit properties
    const { data: parentItem, error: parentError } = await supabase
      .from("label_items")
      .select("*")
      .eq("id", item_id)
      .single();

    if (parentError || !parentItem) {
      throw new Error(`Parent item not found: ${parentError?.message}`);
    }

    // Get current max item_number for this order
    const { data: maxItem } = await supabase
      .from("label_items")
      .select("item_number")
      .eq("order_id", order_id)
      .order("item_number", { ascending: false })
      .limit(1)
      .single();

    let nextItemNumber = (maxItem?.item_number || 0) + 1;

    const childItemIds: string[] = [];
    const pagesResult: { page_number: number; pdf_url: string; width_mm: number; height_mm: number }[] = [];

    for (const page of splitData.pages) {
      // Upload page PDF to storage
      const pdfBytes = Uint8Array.from(atob(page.pdf_base64), c => c.charCodeAt(0));
      const pagePath = `label-artwork/orders/${order_id}/print-ready/${Date.now()}-page${page.page_number}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("label-files")
        .upload(pagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

      if (uploadError) {
        console.error(`[label-split-pdf] Upload error page ${page.page_number}:`, uploadError);
        continue;
      }

      // Create signed URL for the uploaded file
      const { data: signedData } = await supabase.storage
        .from("label-files")
        .createSignedUrl(pagePath, 60 * 60 * 24 * 365); // 1 year

      const pageUrl = signedData?.signedUrl || "";

      const width_mm = Math.round(page.width_pts * PT_TO_MM * 100) / 100;
      const height_mm = Math.round(page.height_pts * PT_TO_MM * 100) / 100;

      // Create child label_item
      const { data: childItem, error: childError } = await supabase
        .from("label_items")
        .insert({
          order_id,
          item_number: nextItemNumber++,
          name: `${parentItem.name} - Page ${page.page_number}`,
          quantity: parentItem.quantity,
          width_mm,
          height_mm,
          artwork_pdf_url: pageUrl,
          print_pdf_url: pageUrl,
          print_pdf_status: "ready",
          artwork_source: parentItem.artwork_source || "admin",
          proofing_status: parentItem.proofing_status || "draft",
          preflight_status: "pending",
          parent_item_id: item_id,
          source_page_number: page.page_number,
          page_count: 1,
          needs_rotation: false,
        })
        .select("id")
        .single();

      if (childError) {
        console.error(`[label-split-pdf] Insert error page ${page.page_number}:`, childError);
        continue;
      }

      childItemIds.push(childItem.id);
      pagesResult.push({ page_number: page.page_number, pdf_url: pageUrl, width_mm, height_mm });
    }

    // Update parent item's page_count
    await supabase
      .from("label_items")
      .update({ page_count: splitData.page_count })
      .eq("id", item_id);

    console.log(`[label-split-pdf] Created ${childItemIds.length} child items`);

    return new Response(
      JSON.stringify({
        success: true,
        item_id,
        page_count: splitData.page_count,
        pages: pagesResult,
        child_item_ids: childItemIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[label-split-pdf] Error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
