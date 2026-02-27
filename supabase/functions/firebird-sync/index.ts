import { corsHeaders } from "../_shared/cors.ts";
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

  try {
    const { startDate, endDate, testMode } = await req.json();

    if (!testMode && (!startDate || !endDate)) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate required (YYYY-MM-DD), or testMode: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    console.log(`[firebird-sync] Connecting to ${host}:${port}${database}`);

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
    console.log("[firebird-sync] Connected");

    if (testMode) {
      const sql = "SELECT 1 AS TEST_VALUE FROM RDB$DATABASE";
      console.log(`[firebird-sync] SQL: ${sql}`);
      
      const result: any = await withTimeout(
        new Promise((resolve, reject) => {
          db.query(sql, [], (err: any, res: any) => {
            if (err) reject(new Error(`Query failed: ${err.message || JSON.stringify(err)}`));
            else resolve(res);
          });
        }),
        30000,
        "Firebird test query"
      );

      try { db.detach(() => {}); } catch (_) {}
      const rawRows = Array.isArray(result) ? result : (result ? [result] : []);
      const rows = rawRows.map(decodeRow);
      
      return new Response(
        JSON.stringify({ success: true, rowCount: rows.length, data: rows, query: { testMode: true } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use EXECUTE BLOCK with FOR SELECT to stream all rows from selectable SP
    const sql = `EXECUTE BLOCK RETURNS (
      WOID INTEGER, WODATE TIMESTAMP, COMPANY VARCHAR(200), CONTACT VARCHAR(200),
      REFERENCE VARCHAR(500), SIZE VARCHAR(200), ITEM_TYPE VARCHAR(100),
      GROUPS VARCHAR(100), DESCRIPTION VARCHAR(500), PROVIDER VARCHAR(200),
      QTY NUMERIC(18,2), WO_QTY NUMERIC(18,2), EMAIL VARCHAR(200)
    ) AS
    BEGIN
      FOR SELECT WOID, WODATE, COMPANY, CONTACT, REFERENCE, SIZE, ITEM_TYPE,
                 GROUPS, DESCRIPTION, PROVIDER, QTY, WO_QTY, EMAIL
          FROM SP_DIGITAL_PRODUCTION('${startDate}','${endDate}')
          INTO :WOID, :WODATE, :COMPANY, :CONTACT, :REFERENCE, :SIZE, :ITEM_TYPE,
               :GROUPS, :DESCRIPTION, :PROVIDER, :QTY, :WO_QTY, :EMAIL
      DO SUSPEND;
    END`;

    console.log(`[firebird-sync] Executing BLOCK for SP_DIGITAL_PRODUCTION('${startDate}','${endDate}')`);

    let rows: any[] = [];
    
    try {
      console.log("[firebird-sync] Trying db.query() with EXECUTE BLOCK...");
      const result: any = await withTimeout(
        new Promise((resolve, reject) => {
          db.query(sql, [], (err: any, res: any) => {
            if (err) reject(new Error(`EXECUTE BLOCK query failed: ${err.message || JSON.stringify(err)}`));
            else resolve(res);
          });
        }),
        120000,
        "Firebird EXECUTE BLOCK query"
      );
      const rawRows = Array.isArray(result) ? result : (result ? [result] : []);
      rows = rawRows.map(decodeRow);
      console.log(`[firebird-sync] db.query() returned ${rows.length} rows`);
    } catch (blockError) {
      console.warn("[firebird-sync] EXECUTE BLOCK failed, trying plain SELECT fallback:", blockError.message);
      
      const fallbackSql = `SELECT * FROM SP_DIGITAL_PRODUCTION('${startDate}','${endDate}')`;
      console.log(`[firebird-sync] Fallback SQL: ${fallbackSql}`);
      
      const result: any = await withTimeout(
        new Promise((resolve, reject) => {
          db.query(fallbackSql, [], (err: any, res: any) => {
            if (err) reject(new Error(`Fallback query failed: ${err.message || JSON.stringify(err)}`));
            else resolve(res);
          });
        }),
        120000,
        "Firebird fallback SELECT query"
      );
      const rawRows = Array.isArray(result) ? result : (result ? [result] : []);
      rows = rawRows.map(decodeRow);
      console.log(`[firebird-sync] Fallback returned ${rows.length} rows`);
    }

    try { db.detach(() => {}); } catch (_) {}
    console.log(`[firebird-sync] Returning ${rows.length} decoded rows`);

    return new Response(
      JSON.stringify({
        success: true,
        rowCount: rows.length,
        data: rows,
        query: { startDate, endDate }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[firebird-sync] Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Unknown error",
        hint: "Check Firebird server and credentials.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
