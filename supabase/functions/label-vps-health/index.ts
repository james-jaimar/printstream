import { corsHeaders } from "../_shared/cors.ts";

const VPS_PDF_API_URL = "https://pdf-api.jaimar.dev";

interface ProbeResult {
  name: string;
  reachable: boolean;
  status_code: number | null;
  response_time_ms: number;
  response_snippet: string;
  error: string | null;
}

async function runProbe(
  name: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
  timeoutMs = 10000
): Promise<ProbeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const opts: RequestInit = { method, headers, signal: controller.signal };
    if (body) opts.body = body;

    const res = await fetch(url, opts);
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    const text = await res.text().catch(() => "");

    return {
      name,
      reachable: true,
      status_code: res.status,
      response_time_ms: elapsed,
      response_snippet: text.substring(0, 300),
      error: null,
    };
  } catch (err) {
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    return {
      name,
      reachable: false,
      status_code: null,
      response_time_ms: elapsed,
      response_snippet: "",
      error: err.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : err.message,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("VPS_PDF_API_KEY") || "";

    const commonHeaders = {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    };

    // Run all 3 probes in parallel
    const [ping, health, endpoint] = await Promise.all([
      // Probe 1: Basic connectivity
      runProbe("ping", `${VPS_PDF_API_URL}/`, "GET", {}),

      // Probe 2: Health endpoint
      runProbe("health", `${VPS_PDF_API_URL}/health`, "GET", {}),

      // Probe 3: Imposition endpoint with empty payload (should get 400/422, NOT 503)
      runProbe(
        "imposition_endpoint",
        `${VPS_PDF_API_URL}/imposition/labels`,
        "POST",
        commonHeaders,
        JSON.stringify({ test: true }),
      ),
    ]);

    const allReachable = ping.reachable && endpoint.reachable;
    const vpsBusy = endpoint.status_code === 503;

    const report = {
      timestamp: new Date().toISOString(),
      vps_url: VPS_PDF_API_URL,
      overall_status: vpsBusy ? "busy" : allReachable ? "healthy" : "unreachable",
      probes: [ping, health, endpoint],
      summary: {
        ping_ok: ping.reachable,
        ping_ms: ping.response_time_ms,
        health_ok: health.reachable,
        health_ms: health.response_time_ms,
        endpoint_ok: endpoint.reachable,
        endpoint_ms: endpoint.response_time_ms,
        endpoint_status: endpoint.status_code,
        is_busy: vpsBusy,
      },
    };

    console.log(`[label-vps-health] Result: ${report.overall_status} | ping=${ping.response_time_ms}ms health=${health.response_time_ms}ms endpoint=${endpoint.response_time_ms}ms (${endpoint.status_code})`);

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[label-vps-health] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
