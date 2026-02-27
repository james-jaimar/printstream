import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "@supabase/supabase-js";
import Firebird from "npm:node-firebird@0.9.3";
import { Buffer } from "node:buffer";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Convert Buffer objects returned by node-firebird into strings */
function decodeRow(row: any): Record<string, any> {
  const decoded: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      decoded[key] = value;
    } else if (Buffer.isBuffer(value)) {
      decoded[key] = value.toString("utf-8").trim();
    } else if (typeof value === "object" && (value as any).type === "Buffer" && Array.isArray((value as any).data)) {
      decoded[key] = String.fromCharCode(...(value as any).data).trim();
    } else if (value instanceof Uint8Array) {
      decoded[key] = new TextDecoder().decode(value).trim();
    } else {
      decoded[key] = value;
    }
  }
  return decoded;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  let runId: string | null = null;

  try {
    const body = await req.json();
    runId = body.runId;
    const { startDate, endDate } = body;

    if (!runId || !startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "runId, startDate, endDate required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark run as running
    const startedAt = new Date();
    await sb.from("quickeasy_sync_runs").update({
      status: "running",
      started_at: startedAt.toISOString(),
    }).eq("id", runId);

    console.log(`[worker] Run ${runId}: starting Firebird query for ${startDate} → ${endDate}`);

    // Connect to Firebird
    const host = Deno.env.get("FIREBIRD_HOST");
    const port = parseInt(Deno.env.get("FIREBIRD_PORT") || "3050", 10);
    const database = Deno.env.get("FIREBIRD_DATABASE");
    const user = Deno.env.get("FIREBIRD_USER");
    const password = Deno.env.get("FIREBIRD_PASSWORD");

    if (!host || !database || !user || !password) {
      throw new Error("Missing Firebird connection secrets");
    }

    const options = { host, port, database, user, password, lowercase_keys: false, pageSize: 4096 };

    const connectStart = Date.now();
    const db: any = await withTimeout(
      new Promise((resolve, reject) => {
        Firebird.attach(options, (err: any, db: any) => {
          if (err) reject(new Error(`Connection failed: ${err.message || err}`));
          else resolve(db);
        });
      }),
      15000,
      "Firebird connect"
    );
    console.log(`[worker] Connected in ${Date.now() - connectStart}ms`);

    // Execute SP
    const sql = `SELECT * FROM SP_DIGITAL_PRODUCTION('${startDate}','${endDate}')`;
    console.log(`[worker] SQL: ${sql}`);

    const queryStart = Date.now();
    const result: any = await withTimeout(
      new Promise((resolve, reject) => {
        db.query(sql, [], (err: any, res: any) => {
          if (err) reject(new Error(`Query failed: ${err.message || JSON.stringify(err)}`));
          else resolve(res);
        });
      }),
      290000,
      "Firebird SP query"
    );
    const queryMs = Date.now() - queryStart;
    console.log(`[worker] Query completed in ${queryMs}ms`);

    const rawRows = Array.isArray(result) ? result : (result ? [result] : []);
    const decodeStart = Date.now();
    const rows = rawRows.map(decodeRow);
    const decodeMs = Date.now() - decodeStart;
    console.log(`[worker] Decoded ${rows.length} rows in ${decodeMs}ms`);

    try { db.detach(() => {}); } catch (_) {}

    // Write results to quickeasy_sync_runs
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const sampleRows = rows.slice(0, 3);

    await sb.from("quickeasy_sync_runs").update({
      status: "completed",
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      row_count: rows.length,
      raw_data: rows,
      sample_rows: sampleRows,
      error: null,
    }).eq("id", runId);

    console.log(`[worker] Run ${runId}: completed — ${rows.length} rows in ${durationMs}ms`);

    return new Response(
      JSON.stringify({ success: true, runId, rowCount: rows.length, durationMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[worker] Run ${runId}: error —`, error);

    if (runId) {
      try {
        const finishedAt = new Date();
        await sb.from("quickeasy_sync_runs").update({
          status: "failed",
          finished_at: finishedAt.toISOString(),
          error: error.message || "Unknown error",
        }).eq("id", runId);
      } catch (updateErr) {
        console.error(`[worker] Failed to mark run ${runId} as failed:`, updateErr);
      }
    }

    return new Response(
      JSON.stringify({ error: error.message || "Unknown error", runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
