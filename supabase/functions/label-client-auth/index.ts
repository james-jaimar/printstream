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

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwtSecret = Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");
  if (!jwtSecret) {
    return jsonResponse({ error: "Server configuration error: JWT secret not set" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();

    // ── LOGIN ──
    if (path === "login") {
      const { email, password } = body;
      if (!email || !password) {
        return jsonResponse({ error: "Email and password required" }, 400);
      }

      const { data: contact, error: contactErr } = await supabase
        .from("label_customer_contacts")
        .select("id, customer_id, name, email, can_approve_proofs, is_active")
        .eq("email", email.toLowerCase().trim())
        .eq("is_active", true)
        .maybeSingle();

      if (contactErr || !contact) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
      }

      const { data: auth, error: authErr } = await supabase
        .from("label_client_auth")
        .select("password_hash, is_active")
        .eq("contact_id", contact.id)
        .maybeSingle();

      if (authErr || !auth || !auth.is_active) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
      }

      const valid = bcrypt.compareSync(password, auth.password_hash);
      if (!valid) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
      }

      await supabase
        .from("label_client_auth")
        .update({ last_login_at: new Date().toISOString() })
        .eq("contact_id", contact.id);

      const { data: customer } = await supabase
        .from("label_customers")
        .select("company_name")
        .eq("id", contact.customer_id)
        .single();

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
          exp: now + 86400,
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

    // ── SET PASSWORD (admin) ──
    if (path === "set-password") {
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

      const { error: upsertErr } = await supabase
        .from("label_client_auth")
        .upsert(
          { contact_id, password_hash: passwordHash, is_active: true },
          { onConflict: "contact_id" }
        );

      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
        return jsonResponse({ error: "Failed to set password" }, 500);
      }

      return jsonResponse({ success: true });
    }

    // ── VERIFY ──
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

    // ── FORGOT PASSWORD ──
    if (path === "forgot-password") {
      const { email } = body;
      if (!email) {
        return jsonResponse({ error: "Email required" }, 400);
      }

      // Always return success to prevent email enumeration
      const successMsg = { success: true, message: "If an account exists with that email, a reset link has been sent." };

      const { data: contact } = await supabase
        .from("label_customer_contacts")
        .select("id, name, email")
        .eq("email", email.toLowerCase().trim())
        .eq("is_active", true)
        .maybeSingle();

      if (!contact) return jsonResponse(successMsg);

      const { data: auth } = await supabase
        .from("label_client_auth")
        .select("id, is_active")
        .eq("contact_id", contact.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!auth) return jsonResponse(successMsg);

      // Generate reset token
      const resetToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

      const { error: updateErr } = await supabase
        .from("label_client_auth")
        .update({ password_reset_token: resetToken, password_reset_expires_at: expiresAt })
        .eq("contact_id", contact.id);

      if (updateErr) {
        console.error("Reset token update error:", updateErr);
        return jsonResponse({ error: "Failed to generate reset link" }, 500);
      }

      // Send email via Resend
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const portalUrl = Deno.env.get("PORTAL_URL") || "https://printstream.lovable.app";
        const resetLink = `${portalUrl}/labels/portal/reset-password?token=${resetToken}`;

        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: "PrintStream <no-reply@printstream.co.za>",
              to: [contact.email],
              subject: "Reset Your Client Portal Password",
              html: `
                <h2>Password Reset Request</h2>
                <p>Hi ${contact.name},</p>
                <p>We received a request to reset your Client Portal password.</p>
                <p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
                <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
              `,
            }),
          });
        } catch (emailErr) {
          console.error("Email send error:", emailErr);
        }
      }

      return jsonResponse(successMsg);
    }

    // ── RESET PASSWORD (token-based) ──
    if (path === "reset-password") {
      const { token, new_password } = body;
      if (!token || !new_password) {
        return jsonResponse({ error: "Token and new_password required" }, 400);
      }
      if (new_password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
      }

      const { data: auth, error: authErr } = await supabase
        .from("label_client_auth")
        .select("id, contact_id, password_reset_expires_at")
        .eq("password_reset_token", token)
        .eq("is_active", true)
        .maybeSingle();

      if (authErr || !auth) {
        return jsonResponse({ error: "Invalid or expired reset link" }, 400);
      }

      if (auth.password_reset_expires_at && new Date(auth.password_reset_expires_at) < new Date()) {
        return jsonResponse({ error: "Reset link has expired. Please request a new one." }, 400);
      }

      const passwordHash = bcrypt.hashSync(new_password);

      const { error: updateErr } = await supabase
        .from("label_client_auth")
        .update({
          password_hash: passwordHash,
          password_reset_token: null,
          password_reset_expires_at: null,
        })
        .eq("id", auth.id);

      if (updateErr) {
        console.error("Password reset update error:", updateErr);
        return jsonResponse({ error: "Failed to reset password" }, 500);
      }

      return jsonResponse({ success: true });
    }

    // ── CHANGE PASSWORD (authenticated client) ──
    if (path === "change-password") {
      const clientToken = req.headers.get("x-client-token");
      if (!clientToken) {
        return jsonResponse({ error: "Authentication required" }, 401);
      }

      const payload = await verifyJWT(clientToken, jwtSecret);
      if (!payload || !payload.contact_id) {
        return jsonResponse({ error: "Invalid or expired session" }, 401);
      }

      const { current_password, new_password } = body;
      if (!current_password || !new_password) {
        return jsonResponse({ error: "current_password and new_password required" }, 400);
      }
      if (new_password.length < 6) {
        return jsonResponse({ error: "New password must be at least 6 characters" }, 400);
      }

      const { data: auth, error: authErr } = await supabase
        .from("label_client_auth")
        .select("password_hash")
        .eq("contact_id", payload.contact_id)
        .eq("is_active", true)
        .maybeSingle();

      if (authErr || !auth) {
        return jsonResponse({ error: "Account not found" }, 404);
      }

      const valid = bcrypt.compareSync(current_password, auth.password_hash);
      if (!valid) {
        return jsonResponse({ error: "Current password is incorrect" }, 401);
      }

      const passwordHash = bcrypt.hashSync(new_password);

      const { error: updateErr } = await supabase
        .from("label_client_auth")
        .update({ password_hash: passwordHash })
        .eq("contact_id", payload.contact_id);

      if (updateErr) {
        return jsonResponse({ error: "Failed to update password" }, 500);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unknown action" }, 404);
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
