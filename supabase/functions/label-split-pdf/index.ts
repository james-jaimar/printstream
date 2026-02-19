/**
 * Label Split PDF Edge Function
 * 
 * Splits a multi-page PDF into individual single-page PDFs.
 * In "proof" mode: creates child label_items linked to the parent via parent_item_id.
 * In "print" mode: matches split pages to existing child items by source_page_number
 *                  and updates their print_pdf_url instead of creating duplicates.
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
    const { item_id, pdf_url, order_id, mode = "proof" } = await req.json();

    if (!item_id || !pdf_url || !order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "item_id, pdf_url, and order_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[label-split-pdf] Splitting PDF for item ${item_id}, mode=${mode}`);

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

    // ========================================================================
    // PRINT MODE: match pages to existing child items by source_page_number
    // ========================================================================
    if (mode === "print") {
      // Find existing child items for this order
      const { data: existingChildren } = await supabase
        .from("label_items")
        .select("id, source_page_number")
        .eq("order_id", order_id)
        .not("parent_item_id", "is", null)
        .not("source_page_number", "is", null);

      const childByPage = new Map<number, string>();
      for (const child of existingChildren || []) {
        if (child.source_page_number != null) {
          childByPage.set(child.source_page_number, child.id);
        }
      }

      const updatedIds: string[] = [];
      const createdIds: string[] = [];
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

        const { data: signedData } = await supabase.storage
          .from("label-files")
          .createSignedUrl(pagePath, 60 * 60 * 24 * 365);

        const pageUrl = signedData?.signedUrl || "";
        const width_mm = Math.round(page.width_pts * PT_TO_MM * 100) / 100;
        const height_mm = Math.round(page.height_pts * PT_TO_MM * 100) / 100;

        const existingChildId = childByPage.get(page.page_number);

        if (existingChildId) {
          // UPDATE existing child with print-ready artwork
          await supabase
            .from("label_items")
            .update({
              print_pdf_url: pageUrl,
              print_pdf_status: "ready",
            })
            .eq("id", existingChildId);

          updatedIds.push(existingChildId);
          console.log(`[label-split-pdf] Updated existing child ${existingChildId} with print page ${page.page_number}`);
        } else {
          // No matching child found - create new item (edge case)
          console.warn(`[label-split-pdf] No existing child for page ${page.page_number}, creating new item`);
          // Get parent for inherited props
          const { data: parentItem } = await supabase
            .from("label_items")
            .select("*")
            .eq("id", item_id)
            .single();

          const { data: maxItem } = await supabase
            .from("label_items")
            .select("item_number")
            .eq("order_id", order_id)
            .order("item_number", { ascending: false })
            .limit(1)
            .single();

          const nextItemNumber = (maxItem?.item_number || 0) + 1;

          const { data: childItem, error: childError } = await supabase
            .from("label_items")
            .insert({
              order_id,
              item_number: nextItemNumber,
              name: `${parentItem?.name || 'Item'} - Page ${page.page_number}`,
              quantity: parentItem?.quantity || 1,
              width_mm,
              height_mm,
              print_pdf_url: pageUrl,
              print_pdf_status: "ready",
              artwork_source: parentItem?.artwork_source || "admin",
              proofing_status: parentItem?.proofing_status || "draft",
              preflight_status: "pending",
              parent_item_id: item_id,
              source_page_number: page.page_number,
              page_count: 1,
              needs_rotation: parentItem?.needs_rotation ?? false,
            })
            .select("id")
            .single();

          if (!childError && childItem) {
            createdIds.push(childItem.id);
          }
        }

        pagesResult.push({ page_number: page.page_number, pdf_url: pageUrl, width_mm, height_mm });
      }

      // Update parent item's page_count
      await supabase
        .from("label_items")
        .update({ page_count: splitData.page_count })
        .eq("id", item_id);

      console.log(`[label-split-pdf] Print mode: updated ${updatedIds.length}, created ${createdIds.length}`);

      return new Response(
        JSON.stringify({
          success: true,
          item_id,
          mode: "print",
          page_count: splitData.page_count,
          pages: pagesResult,
          updated_item_ids: updatedIds,
          child_item_ids: createdIds,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // PROOF MODE (default): fill placeholders first, then create new items
    // ========================================================================

    // Get parent item to inherit properties
    const { data: parentItem, error: parentError } = await supabase
      .from("label_items")
      .select("*")
      .eq("id", item_id)
      .single();

    if (parentError || !parentItem) {
      throw new Error(`Parent item not found: ${parentError?.message}`);
    }

    // Query for existing placeholder items (no artwork at all, no parent)
    const { data: placeholders } = await supabase
      .from("label_items")
      .select("id, name")
      .eq("order_id", order_id)
      .is("proof_pdf_url", null)
      .is("artwork_pdf_url", null)
      .is("print_pdf_url", null)
      .is("parent_item_id", null)
      .neq("id", item_id); // exclude the parent item being split

    // Build map: page number -> placeholder id (from "Page X" naming)
    const placeholderMap = new Map<number, string>();
    for (const ph of placeholders || []) {
      const match = ph.name.match(/^Page\s+(\d+)$/i);
      if (match) {
        placeholderMap.set(parseInt(match[1], 10), ph.id);
      }
    }
    console.log(`[label-split-pdf] Found ${placeholderMap.size} matching placeholders`);

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
    const updatedPlaceholderIds: string[] = [];
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

      const { data: signedData } = await supabase.storage
        .from("label-files")
        .createSignedUrl(pagePath, 60 * 60 * 24 * 365);

      const pageUrl = signedData?.signedUrl || "";
      const width_mm = Math.round(page.width_pts * PT_TO_MM * 100) / 100;
      const height_mm = Math.round(page.height_pts * PT_TO_MM * 100) / 100;

      // Check if a placeholder exists for this page number
      const placeholderId = placeholderMap.get(page.page_number);

      if (placeholderId) {
        // UPDATE existing placeholder with artwork
        const { error: updateError } = await supabase
          .from("label_items")
          .update({
            artwork_pdf_url: pageUrl,
            proof_pdf_url: parentItem.proof_pdf_url || pageUrl,
            width_mm,
            height_mm,
            parent_item_id: item_id,
            source_page_number: page.page_number,
            page_count: 1,
            artwork_source: parentItem.artwork_source || "admin",
            proofing_status: parentItem.proofing_status || "draft",
            preflight_status: "pending",
            needs_rotation: parentItem.needs_rotation ?? false,
          })
          .eq("id", placeholderId);

        if (updateError) {
          console.error(`[label-split-pdf] Update placeholder error page ${page.page_number}:`, updateError);
          continue;
        }

        updatedPlaceholderIds.push(placeholderId);
        console.log(`[label-split-pdf] Filled placeholder ${placeholderId} with page ${page.page_number}`);
      } else {
        // No placeholder - INSERT new child item
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
            proof_pdf_url: parentItem.proof_pdf_url || pageUrl,
            print_pdf_url: null,
            print_pdf_status: "pending",
            artwork_source: parentItem.artwork_source || "admin",
            proofing_status: parentItem.proofing_status || "draft",
            preflight_status: "pending",
            parent_item_id: item_id,
            source_page_number: page.page_number,
            page_count: 1,
            needs_rotation: parentItem.needs_rotation ?? false,
          })
          .select("id")
          .single();

        if (childError) {
          console.error(`[label-split-pdf] Insert error page ${page.page_number}:`, childError);
          continue;
        }

        childItemIds.push(childItem.id);
      }

      pagesResult.push({ page_number: page.page_number, pdf_url: pageUrl, width_mm, height_mm });
    }

    // Update parent item's page_count
    await supabase
      .from("label_items")
      .update({ page_count: splitData.page_count })
      .eq("id", item_id);

    console.log(`[label-split-pdf] Filled ${updatedPlaceholderIds.length} placeholders, created ${childItemIds.length} new items`);

    return new Response(
      JSON.stringify({
        success: true,
        item_id,
        mode: "proof",
        page_count: splitData.page_count,
        pages: pagesResult,
        child_item_ids: childItemIds,
        updated_placeholder_ids: updatedPlaceholderIds,
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
