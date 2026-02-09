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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwtSecret = Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");
  if (!jwtSecret) {
    return jsonResponse({ error: "Server configuration error: JWT secret not set" }, 500);
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
    if (req.method === "GET" && (path === "/orders" || path === "" || path === "/")) {
      const { data, error } = await supabase
        .from("label_orders")
        .select(`
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*),
          items:label_items(*),
          runs:label_runs(*)
        `)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse({ orders: data || [] });
    }

    // GET /order/:id
    const orderMatch = path.match(/^\/order\/([a-f0-9-]+)$/);
    if (req.method === "GET" && orderMatch) {
      const orderId = orderMatch[1];
      const { data, error } = await supabase
        .from("label_orders")
        .select(`
          *,
          dieline:label_dielines(*),
          substrate:label_stock(*),
          items:label_items(*),
          runs:label_runs(*)
        `)
        .eq("id", orderId)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return jsonResponse({ error: "Order not found" }, 404);
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

    // POST /approve
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
      const newStatus = action === "approved" ? "approved" : "pending_approval";
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

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
