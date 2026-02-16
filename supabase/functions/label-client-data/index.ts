import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyClientToken(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = `${parts[0]}.${parts[1]}`;
    const sigBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(data)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0)
        )
      )
    );

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// Helper to generate signed URLs for item artwork fields
async function enrichItemsWithSignedUrls(
  supabase: ReturnType<typeof createClient>,
  items: any[]
): Promise<any[]> {
  if (!items || items.length === 0) return items;

  const urlFields = [
    "proof_pdf_url",
    "proof_thumbnail_url",
    "artwork_pdf_url",
    "artwork_thumbnail_url",
  ];

  return Promise.all(
    items.map(async (item) => {
      const enriched = { ...item };
      for (const field of urlFields) {
        const rawUrl = item[field];
        if (!rawUrl || typeof rawUrl !== "string") continue;
        // Extract storage path from full URL or use as-is
        let storagePath = rawUrl;
        const bucketMatch = rawUrl.match(
          /\/storage\/v1\/object\/(?:public|sign)\/label-files\/(.+)/
        );
        if (bucketMatch) {
          storagePath = bucketMatch[1];
        }
        // Only sign if it looks like a storage path (not an external URL)
        if (!storagePath.startsWith("http")) {
          const { data } = await supabase.storage
            .from("label-files")
            .createSignedUrl(storagePath, 3600);
          if (data?.signedUrl) {
            enriched[`signed_${field}`] = data.signedUrl;
          }
        }
      }
      return enriched;
    })
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwtSecret =
    Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");
  if (!jwtSecret) {
    return jsonResponse(
      { error: "Server configuration error: JWT secret not set" },
      500
    );
  }

  // Extract and verify token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const payload = await verifyClientToken(token, jwtSecret);
  if (!payload || !payload.customer_id) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  const customerId = payload.customer_id as string;
  const contactId = payload.contact_id as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const path = url.pathname.split("/label-client-data").pop() || "";

  try {
    // GET /orders
    if (
      req.method === "GET" &&
      (path === "/orders" || path === "" || path === "/")
    ) {
      // Only show orders that are client-visible (not internal quotes/drafts)
      const clientVisibleStatuses = ['pending_approval', 'approved', 'in_production', 'completed'];
      const { data, error } = await supabase
        .from("label_orders")
        .select(
          `
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*),
          items:label_items(*),
          runs:label_runs(*)
        `
        )
        .eq("customer_id", customerId)
        .in("status", clientVisibleStatuses)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter out parent items that were split into child pages
      if (data) {
        for (const order of data) {
          if (order.items) {
            order.items = order.items.filter(
              (item: any) => !(item.page_count > 1 && !item.parent_item_id)
            );
          }
        }
      }

      return jsonResponse({ orders: data || [] });
    }

    // GET /order/:id
    const orderMatch = path.match(/^\/order\/([a-f0-9-]+)$/);
    if (req.method === "GET" && orderMatch) {
      const orderId = orderMatch[1];
      const { data, error } = await supabase
        .from("label_orders")
        .select(
          `
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*),
          items:label_items(*),
          runs:label_runs(*)
        `
        )
        .eq("id", orderId)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return jsonResponse({ error: "Order not found" }, 404);

      // Filter out parent items that were split into child pages
      if (data.items) {
        data.items = data.items.filter(
          (item: any) => !(item.page_count > 1 && !item.parent_item_id)
        );
        data.items = await enrichItemsWithSignedUrls(supabase, data.items);
      }

      return jsonResponse({ order: data });
    }

    // GET /approvals/:orderId
    const approvalMatch = path.match(/^\/approvals\/([a-f0-9-]+)$/);
    if (req.method === "GET" && approvalMatch) {
      const orderId = approvalMatch[1];

      // Verify order belongs to customer
      const { data: order } = await supabase
        .from("label_orders")
        .select("id")
        .eq("id", orderId)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (!order) return jsonResponse({ error: "Order not found" }, 404);

      const { data, error } = await supabase
        .from("label_proof_approvals")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse({ approvals: data || [] });
    }

    // POST /approve (legacy - order level)
    if (req.method === "POST" && path === "/approve") {
      const body = await req.json();
      const { order_id, action, comment } = body;

      if (!order_id || !action) {
        return jsonResponse({ error: "order_id and action required" }, 400);
      }
      if (action === "rejected" && !comment?.trim()) {
        return jsonResponse({ error: "Comment required for rejection" }, 400);
      }

      // Verify order belongs to customer
      const { data: order } = await supabase
        .from("label_orders")
        .select("id, status")
        .eq("id", order_id)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (!order) return jsonResponse({ error: "Order not found" }, 404);

      // Insert approval record
      const { error: approvalErr } = await supabase
        .from("label_proof_approvals")
        .insert({
          order_id,
          action,
          comment: comment || null,
          approved_by: contactId,
        });

      if (approvalErr) throw approvalErr;

      // Update order status
      const newStatus =
        action === "approved" ? "approved" : "pending_approval";
      const updateData: Record<string, unknown> = { status: newStatus };
      if (action === "approved") {
        updateData.client_approved_at = new Date().toISOString();
        updateData.client_approved_by = contactId;
      }

      const { error: orderErr } = await supabase
        .from("label_orders")
        .update(updateData)
        .eq("id", order_id);

      if (orderErr) throw orderErr;

      return jsonResponse({ success: true });
    }

    // POST /approve-items — item-level approval
    if (req.method === "POST" && path === "/approve-items") {
      const body = await req.json();
      const { order_id, item_ids, action, comment } = body;

      if (!order_id || !item_ids?.length || !action) {
        return jsonResponse(
          { error: "order_id, item_ids, and action required" },
          400
        );
      }
      if (action === "rejected" && !comment?.trim()) {
        return jsonResponse({ error: "Comment required for rejection" }, 400);
      }

      // Verify order belongs to customer
      const { data: order } = await supabase
        .from("label_orders")
        .select("id, status")
        .eq("id", order_id)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (!order) return jsonResponse({ error: "Order not found" }, 404);

      // Update proofing_status on each item
      const newProofingStatus =
        action === "approved" ? "approved" : "client_needs_upload";
      const itemUpdateData: Record<string, unknown> = {
        proofing_status: newProofingStatus,
      };
      if (action === "rejected") {
        itemUpdateData.artwork_issue = comment;
      }

      const { error: itemErr } = await supabase
        .from("label_items")
        .update(itemUpdateData)
        .eq("order_id", order_id)
        .in("id", item_ids);

      if (itemErr) throw itemErr;

      // Insert approval record
      const { error: approvalErr } = await supabase
        .from("label_proof_approvals")
        .insert({
          order_id,
          action,
          comment:
            comment ||
            `${action === "approved" ? "Approved" : "Changes requested"} for ${item_ids.length} item(s)`,
          approved_by: contactId,
        });

      if (approvalErr) throw approvalErr;

      // Check if ALL visible items in the order are now approved
      // Filter out parent multi-page items (they aren't approved individually)
      const { data: allItems } = await supabase
        .from("label_items")
        .select("id, proofing_status, print_pdf_url, page_count, parent_item_id")
        .eq("order_id", order_id);

      const visibleItems = allItems?.filter(
        (i: any) => !(i.page_count > 1 && !i.parent_item_id)
      ) || [];
      const allApproved = visibleItems.length > 0 &&
        visibleItems.every((i) => i.proofing_status === "approved");

      if (allApproved) {
        // Update order status to approved
        const { error: orderErr } = await supabase
          .from("label_orders")
          .update({
            status: "approved",
            client_approved_at: new Date().toISOString(),
            client_approved_by: contactId,
          })
          .eq("id", order_id);

        if (orderErr) throw orderErr;

        // Check if auto-imposition is possible (all items have print-ready PDFs)
        const allPrintReady =
          visibleItems.length > 0 && visibleItems.every((i: any) => i.print_pdf_url);
        if (allPrintReady) {
          // Fetch dieline for this order
          const { data: orderWithDieline } = await supabase
            .from("label_orders")
            .select("dieline_id, label_dielines(*)")
            .eq("id", order_id)
            .single();

          const dieline = (orderWithDieline as any)?.label_dielines;

          // Fetch runs with slot assignments
          const { data: runs } = await supabase
            .from("label_runs")
            .select("id, slot_assignments, meters_to_print")
            .eq("order_id", order_id)
            .eq("status", "planned");

          if (dieline && runs && runs.length > 0) {
            // Build item PDF lookup map
            const itemPdfMap = new Map(
              (allItems || [])
                .filter((i: any) => i.print_pdf_url)
                .map((i: any) => [i.id, i.print_pdf_url])
            );

            for (const run of runs) {
              // Enrich slot assignments with pdf_url
              const slots = ((run as any).slot_assignments || []).map((slot: any) => ({
                slot: slot.slot,
                item_id: slot.item_id,
                quantity_in_slot: slot.quantity_in_slot,
                needs_rotation: slot.needs_rotation || false,
                pdf_url: itemPdfMap.get(slot.item_id) || "",
              }));

              const imposePayload = {
                run_id: run.id,
                order_id: order_id,
                dieline: {
                  roll_width_mm: dieline.roll_width_mm,
                  label_width_mm: dieline.label_width_mm,
                  label_height_mm: dieline.label_height_mm,
                  columns_across: dieline.columns_across,
                  rows_around: dieline.rows_around,
                  horizontal_gap_mm: dieline.horizontal_gap_mm,
                  vertical_gap_mm: dieline.vertical_gap_mm,
                  corner_radius_mm: dieline.corner_radius_mm,
                },
                slot_assignments: slots,
                include_dielines: true,
                meters_to_print: (run as any).meters_to_print || 1,
              };

              fetch(`${supabaseUrl}/functions/v1/label-impose`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(imposePayload),
              }).catch((err) =>
                console.error("Auto-impose error for run", run.id, err)
              );
            }
          }
        }

        return jsonResponse({ success: true, all_approved: true, auto_impose_triggered: allPrintReady });
      }

      return jsonResponse({ success: true, all_approved: false });
    }

    // POST /upload-artwork — client uploads replacement artwork
    if (req.method === "POST" && path === "/upload-artwork") {
      const formData = await req.formData();
      const orderId = formData.get("order_id") as string;
      const itemId = formData.get("item_id") as string;
      const file = formData.get("file") as File;

      if (!orderId || !itemId || !file) {
        return jsonResponse(
          { error: "order_id, item_id, and file required" },
          400
        );
      }

      // Verify order belongs to customer
      const { data: order } = await supabase
        .from("label_orders")
        .select("id")
        .eq("id", orderId)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (!order) return jsonResponse({ error: "Order not found" }, 404);

      // Verify item belongs to order
      const { data: item } = await supabase
        .from("label_items")
        .select("id")
        .eq("id", itemId)
        .eq("order_id", orderId)
        .maybeSingle();

      if (!item) return jsonResponse({ error: "Item not found" }, 404);

      // Upload file to storage
      const ext = file.name.split(".").pop() || "pdf";
      const storagePath = `orders/${orderId}/client-uploads/${itemId}-${Date.now()}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from("label-files")
        .upload(storagePath, arrayBuffer, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      // Update item: reset to pending, set artwork_source to client
      const { error: updateErr } = await supabase
        .from("label_items")
        .update({
          artwork_pdf_url: storagePath,
          artwork_source: "client",
          proofing_status: "draft",
          print_pdf_status: "pending",
          preflight_status: "pending",
          artwork_issue: null,
        })
        .eq("id", itemId);

      if (updateErr) throw updateErr;

      return jsonResponse({ success: true, path: storagePath });
    }

    // GET /signed-url?path=...
    if (req.method === "GET" && path === "/signed-url") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return jsonResponse({ error: "path parameter required" }, 400);
      }

      // Validate the path belongs to an order owned by this customer
      const orderIdMatch = filePath.match(/orders\/([a-f0-9-]+)\//);
      if (orderIdMatch) {
        const fileOrderId = orderIdMatch[1];
        const { data: order } = await supabase
          .from("label_orders")
          .select("id")
          .eq("id", fileOrderId)
          .eq("customer_id", customerId)
          .maybeSingle();

        if (!order)
          return jsonResponse({ error: "Access denied" }, 403);
      }

      const { data, error: signErr } = await supabase.storage
        .from("label-files")
        .createSignedUrl(filePath, 3600);

      if (signErr) throw signErr;

      return jsonResponse({ signed_url: data?.signedUrl });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
