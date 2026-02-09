import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64url } from "https://deno.land/std@0.208.0/encoding/base64url.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Simple JWT implementation using HMAC-SHA256
async function signJWT(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();

  const h = base64url(enc.encode(JSON.stringify(header)));
  const p = base64url(enc.encode(JSON.stringify(payload)));
  const data = `${h}.${p}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const s = base64url(new Uint8Array(sig));

  return `${data}.${s}`;
}

async function verifyJWT(
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
    const signature = base64url(
      Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0)
      )
    );
    // Re-sign and compare
    const expectedSig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
    const expectedB64 = base64url(new Uint8Array(expectedSig));

    if (signature !== expectedB64) {
      // Direct comparison failed, try proper verify
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
    }

    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0)
        )
      )
    );

    // Check expiry
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

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") || Deno.env.get("JWT_SECRET")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();

    if (path === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return jsonResponse({ error: "Email and password required" }, 400);
      }

      // Find contact by email
      const { data: contact, error: contactErr } = await supabase
        .from("label_customer_contacts")
        .select("id, customer_id, name, email, can_approve_proofs, is_active")
        .eq("email", email.toLowerCase().trim())
        .eq("is_active", true)
        .maybeSingle();

      if (contactErr || !contact) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
      }

      // Get auth record
      const { data: auth, error: authErr } = await supabase
        .from("label_client_auth")
        .select("password_hash, is_active")
        .eq("contact_id", contact.id)
        .maybeSingle();

      if (authErr || !auth || !auth.is_active) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
      }

      // Verify password
      const valid = bcrypt.compareSync(password, auth.password_hash);
      if (!valid) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
      }

      // Update last login
      await supabase
        .from("label_client_auth")
        .update({ last_login_at: new Date().toISOString() })
        .eq("contact_id", contact.id);

      // Get customer company name
      const { data: customer } = await supabase
        .from("label_customers")
        .select("company_name")
        .eq("id", contact.customer_id)
        .single();

      // Sign JWT
      const now = Math.floor(Date.now() / 1000);
      const token = await signJWT(
        {
          sub: contact.id,
          contact_id: contact.id,
          customer_id: contact.customer_id,
          email: contact.email,
          name: contact.name,
          company_name: customer?.company_name || "",
          can_approve: contact.can_approve_proofs,
          iat: now,
          exp: now + 86400, // 24 hours
        },
        jwtSecret
      );

      return jsonResponse({
        token,
        contact: {
          id: contact.id,
          customer_id: contact.customer_id,
          name: contact.name,
          email: contact.email,
          company_name: customer?.company_name || "",
          can_approve: contact.can_approve_proofs,
        },
      });
    }

    if (path === "set-password") {
      // Admin-only: verify staff JWT
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const staffClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await staffClient.auth.getClaims(
        authHeader.replace("Bearer ", "")
      );
      if (claimsErr || !claimsData?.claims?.sub) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { contact_id, password } = body;
      if (!contact_id || !password) {
        return jsonResponse({ error: "contact_id and password required" }, 400);
      }
      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
      }

      const passwordHash = bcrypt.hashSync(password);

      // Upsert auth record
      const { error: upsertErr } = await supabase
        .from("label_client_auth")
        .upsert(
          {
            contact_id,
            password_hash: passwordHash,
            is_active: true,
          },
          { onConflict: "contact_id" }
        );

      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
        return jsonResponse({ error: "Failed to set password" }, 500);
      }

      return jsonResponse({ success: true });
    }

    if (path === "verify") {
      const { token } = body;
      if (!token) {
        return jsonResponse({ error: "Token required" }, 400);
      }

      const payload = await verifyJWT(token, jwtSecret);
      if (!payload) {
        return jsonResponse({ error: "Invalid or expired token" }, 401);
      }

      return jsonResponse({ valid: true, payload });
    }

    return jsonResponse({ error: "Unknown action" }, 404);
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
