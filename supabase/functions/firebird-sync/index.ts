import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";

/**
 * firebird-sync: START endpoint
 * Creates a sync run row in quickeasy_sync_runs and fires the worker.
 * Returns immediately with runId so the browser never waits on Firebird.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate, testMode } = await req.json();

    // testMode still runs inline for fast connectivity checks
    if (testMode) {
      return await handleTestMode();
    }

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate required (YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role to write to quickeasy_sync_runs
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Insert a queued run
    const { data: run, error: insertError } = await sb
      .from("quickeasy_sync_runs")
      .insert({
        start_date: startDate,
        end_date: endDate,
        status: "queued",
        row_count: 0,
        raw_data: [],
      })
      .select("id")
      .single();

    if (insertError) throw new Error(`Failed to create sync run: ${insertError.message}`);

    const runId = run.id;
    console.log(`[firebird-sync] Created run ${runId} for ${startDate} → ${endDate}`);

    // Fire the worker asynchronously (don't await)
    const workerUrl = `${supabaseUrl}/functions/v1/firebird-sync-worker`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey;
    
    fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ runId, startDate, endDate }),
    }).catch((err) => {
      console.error(`[firebird-sync] Failed to invoke worker: ${err.message}`);
    });

    return new Response(
      JSON.stringify({ success: true, runId, status: "queued" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[firebird-sync] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/** Lightweight inline test — no worker needed */
async function handleTestMode() {
  const Firebird = (await import("npm:node-firebird@0.9.3")).default;

  const host = Deno.env.get("FIREBIRD_HOST");
  const port = parseInt(Deno.env.get("FIREBIRD_PORT") || "3050", 10);
  const database = Deno.env.get("FIREBIRD_DATABASE");
  const user = Deno.env.get("FIREBIRD_USER");
  const password = Deno.env.get("FIREBIRD_PASSWORD");

  if (!host || !database || !user || !password) {
    return new Response(
      JSON.stringify({ error: "Missing Firebird connection secrets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const options = { host, port, database, user, password, lowercase_keys: false, pageSize: 4096 };

  const db: any = await new Promise((resolve, reject) => {
    Firebird.attach(options, (err: any, db: any) => {
      if (err) reject(new Error(`Connection failed: ${err.message || err}`));
      else resolve(db);
    });
  });

  const result: any = await new Promise((resolve, reject) => {
    db.query("SELECT 1 AS TEST_VALUE FROM RDB$DATABASE", [], (err: any, res: any) => {
      if (err) reject(new Error(`Query failed: ${err.message}`));
      else resolve(res);
    });
  });

  try { db.detach(() => {}); } catch (_) {}

  return new Response(
    JSON.stringify({ success: true, testMode: true, data: result }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
