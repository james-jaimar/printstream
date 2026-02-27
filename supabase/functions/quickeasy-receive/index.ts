import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";

/**
 * quickeasy-receive: Push-based endpoint
 * Accepts pre-fetched QuickEasy data from a local relay script.
 * Validates a shared secret, then writes a completed sync run.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate with shared secret
    const relaySecret = Deno.env.get("QUICKEASY_RELAY_SECRET");
    const providedSecret = req.headers.get("x-relay-secret");

    if (!relaySecret || !providedSecret || providedSecret !== relaySecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — invalid or missing x-relay-secret header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { startDate, endDate, rows } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(rows)) {
      return new Response(
        JSON.stringify({ error: "rows must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    const sampleRows = rows.slice(0, 3);

    const { data: run, error: insertError } = await sb
      .from("quickeasy_sync_runs")
      .insert({
        start_date: startDate,
        end_date: endDate,
        status: "completed",
        started_at: now,
        finished_at: now,
        duration_ms: 0,
        row_count: rows.length,
        raw_data: rows,
        sample_rows: sampleRows,
        error: null,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    console.log(`[quickeasy-receive] Stored ${rows.length} rows as run ${run.id}`);

    return new Response(
      JSON.stringify({ success: true, runId: run.id, rowCount: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[quickeasy-receive] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
