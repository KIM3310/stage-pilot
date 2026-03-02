/**
 * Cloudflare Workers entry point for StagePilot demo surface.
 *
 * This is a lightweight edge worker that serves the demo UI, health check,
 * and read-only review-pack endpoints. The full API (plan, benchmark, etc.)
 * runs on Cloud Run or Kubernetes.
 *
 * Deploy: npx wrangler deploy
 * Dev:    npx wrangler dev
 */

// Cloudflare Workers runtime types (declared locally to avoid adding
// @cloudflare/workers-types as a full project dependency).
declare class ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
interface ExportedHandler<E = Record<string, unknown>> {
  fetch?(
    request: Request,
    env: E,
    ctx: ExecutionContext
  ): Promise<Response> | Response;
}

export interface Env {
  APP_ENV?: string;
  DEPLOYMENT_TRACK?: string;
  STAGEPILOT_CORS_ORIGINS?: string;
}

const BASE_JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

function resolveAllowedOrigins(request: Request, env: Env): Set<string> {
  const configured = String(env.STAGEPILOT_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://stage-pilot.pages.dev",
    new URL(request.url).origin,
  ];
  return new Set([...configured, ...defaults]);
}

function resolveCorsHeaders(request: Request, env: Env): HeadersInit {
  const requestOrigin = request.headers.get("Origin")?.trim();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
  if (!requestOrigin) {
    return headers;
  }
  if (resolveAllowedOrigins(request, env).has(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  }
  return headers;
}

function withCorsHeaders(
  request: Request,
  env: Env,
  headers: HeadersInit = {}
): Headers {
  return new Headers({
    ...Object.fromEntries(new Headers(headers).entries()),
    ...Object.fromEntries(
      new Headers(resolveCorsHeaders(request, env)).entries()
    ),
  });
}

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Response {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === "OPTIONS") {
      const corsHeaders = resolveCorsHeaders(request, env);
      if (
        request.headers.get("Origin") &&
        !new Headers(corsHeaders).has("Access-Control-Allow-Origin")
      ) {
        return Response.json(
          { error: "origin_not_allowed", message: "Origin is not allowed." },
          {
            status: 403,
            headers: withCorsHeaders(request, env, BASE_JSON_HEADERS),
          }
        );
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (pathname === "/health" || pathname === "/") {
      return Response.json(
        {
          status: "ok",
          service: "stagepilot-demo",
          runtime: "cloudflare-workers",
          env: env.APP_ENV ?? "production",
          track: env.DEPLOYMENT_TRACK ?? "edge",
          timestamp: new Date().toISOString(),
        },
        { headers: withCorsHeaders(request, env, BASE_JSON_HEADERS) }
      );
    }

    // Demo page
    if (pathname === "/demo") {
      return new Response(renderDemoHtml(), {
        headers: withCorsHeaders(request, env, {
          "Content-Type": "text/html; charset=utf-8",
        }),
      });
    }

    // Runtime brief
    if (pathname === "/v1/runtime-brief") {
      return Response.json(
        {
          service: "stagepilot",
          runtime: "cloudflare-workers",
          version: "4.1.3",
          deployment: env.DEPLOYMENT_TRACK ?? "edge",
          capabilities: [
            "tool-call-parsing",
            "protocol-detection",
            "schema-coercion",
            "benchmark-harness",
            "ralph-loop-retry",
          ],
          note: "This is the edge demo surface. Full API runs on Cloud Run or Kubernetes.",
        },
        { headers: withCorsHeaders(request, env, BASE_JSON_HEADERS) }
      );
    }

    // Metrics stub (edge)
    if (pathname === "/v1/metrics") {
      const body = [
        "# HELP stagepilot_edge_requests_total Total requests handled by edge worker",
        "# TYPE stagepilot_edge_requests_total counter",
        "stagepilot_edge_requests_total 1",
        "# HELP stagepilot_edge_up Whether the edge worker is running",
        "# TYPE stagepilot_edge_up gauge",
        "stagepilot_edge_up 1",
        "",
      ].join("\n");

      return new Response(body, {
        headers: withCorsHeaders(request, env, {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        }),
      });
    }

    return Response.json(
      {
        error: "not_found",
        message: `No route for ${request.method} ${pathname}`,
        hint: "Try /demo, /health, /v1/runtime-brief, or /v1/metrics",
      },
      { status: 404, headers: withCorsHeaders(request, env, BASE_JSON_HEADERS) }
    );
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Inline demo HTML
// ---------------------------------------------------------------------------

function renderDemoHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StagePilot Demo (Edge)</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #60a5fa; }
    .card { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
    .card h2 { font-size: 1.1rem; color: #a78bfa; margin-bottom: 0.5rem; }
    .card p { color: #aaa; line-height: 1.6; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #2a2a3e; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
    .badge { display: inline-block; background: #1e3a5f; color: #60a5fa; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; margin-right: 0.5rem; }
  </style>
</head>
<body>
  <h1>StagePilot Demo <span class="badge">Edge</span></h1>
  <p style="margin-bottom:1.5rem;color:#888;">Lightweight demo surface running on Cloudflare Workers.</p>
  <div class="grid">
    <div class="card">
      <h2>Runtime Brief</h2>
      <p>View runtime status and capabilities.</p>
      <p style="margin-top:0.5rem;"><a href="/v1/runtime-brief"><code>GET /v1/runtime-brief</code></a></p>
    </div>
    <div class="card">
      <h2>Health Check</h2>
      <p>Verify the edge worker is running.</p>
      <p style="margin-top:0.5rem;"><a href="/health"><code>GET /health</code></a></p>
    </div>
    <div class="card">
      <h2>Prometheus Metrics</h2>
      <p>Edge metrics in Prometheus exposition format.</p>
      <p style="margin-top:0.5rem;"><a href="/v1/metrics"><code>GET /v1/metrics</code></a></p>
    </div>
    <div class="card">
      <h2>Full API</h2>
      <p>The complete StagePilot API (plan, benchmark, insights) runs on Cloud Run or Kubernetes. This edge surface is for the demo UI and read-only review-pack routes.</p>
    </div>
  </div>
</body>
</html>`;
}
