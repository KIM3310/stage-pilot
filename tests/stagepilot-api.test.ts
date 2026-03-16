import { createSign, generateKeyPairSync } from "node:crypto";
import { type AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createStagePilotApiServer } from "../src/api/stagepilot-server";
import { StagePilotEngine } from "../src/stagepilot/orchestrator";

const serversToClose: ReturnType<typeof createStagePilotApiServer>[] = [];
const BODY_TIMEOUT_ENV_KEY = "STAGEPILOT_REQUEST_BODY_TIMEOUT_MS";
const GEMINI_API_KEY_ENV_KEY = "GEMINI_API_KEY";
const GEMINI_TIMEOUT_ENV_KEY = "GEMINI_HTTP_TIMEOUT_MS";
const OPERATOR_TOKEN_ENV_KEY = "STAGEPILOT_OPERATOR_TOKEN";
const OPERATOR_ROLES_ENV_KEY = "STAGEPILOT_OPERATOR_ALLOWED_ROLES";
const OPERATOR_OIDC_ISSUER_ENV_KEY = "STAGEPILOT_OPERATOR_OIDC_ISSUER";
const OPERATOR_OIDC_AUDIENCE_ENV_KEY = "STAGEPILOT_OPERATOR_OIDC_AUDIENCE";
const OPERATOR_OIDC_JWKS_ENV_KEY = "STAGEPILOT_OPERATOR_OIDC_JWKS_JSON";
const OPENCLAW_WEBHOOK_ENV_KEY = "OPENCLAW_WEBHOOK_URL";
const BODY_TIMEOUT_ENV_SNAPSHOT = process.env[BODY_TIMEOUT_ENV_KEY];
const GEMINI_API_KEY_ENV_SNAPSHOT = process.env[GEMINI_API_KEY_ENV_KEY];
const GEMINI_TIMEOUT_ENV_SNAPSHOT = process.env[GEMINI_TIMEOUT_ENV_KEY];
const OPERATOR_TOKEN_ENV_SNAPSHOT = process.env[OPERATOR_TOKEN_ENV_KEY];
const OPERATOR_ROLES_ENV_SNAPSHOT = process.env[OPERATOR_ROLES_ENV_KEY];
const OPERATOR_OIDC_ISSUER_ENV_SNAPSHOT =
  process.env[OPERATOR_OIDC_ISSUER_ENV_KEY];
const OPERATOR_OIDC_AUDIENCE_ENV_SNAPSHOT =
  process.env[OPERATOR_OIDC_AUDIENCE_ENV_KEY];
const OPERATOR_OIDC_JWKS_ENV_SNAPSHOT = process.env[OPERATOR_OIDC_JWKS_ENV_KEY];
const HTTP_STATUS_LINE_REGEX = /^HTTP\/1\.1 (\d{3})/m;
const REVIEWER_CLAIM_TIER_REGEX =
  /runtime-backed-review-ready|bounded-review-demo/;
const OPENCLAW_WEBHOOK_ENV_SNAPSHOT = process.env[OPENCLAW_WEBHOOK_ENV_KEY];

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createOidcToken(options: {
  audience: string;
  issuer: string;
  roles?: string[];
}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: "jwk" }) as Record<
    string,
    string
  >;
  const kid = "stagepilot-test-key";
  const header = encodeBase64Url(
    JSON.stringify({ alg: "RS256", kid, typ: "JWT" })
  );
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: options.issuer,
      aud: options.audience,
      sub: "stagepilot-operator",
      exp: Math.floor(Date.now() / 1000) + 60,
      roles: options.roles ?? [],
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer
    .sign(privateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return {
    jwksJson: JSON.stringify({
      keys: [{ ...publicJwk, alg: "RS256", kid, use: "sig" }],
    }),
    token: `${header}.${payload}.${signature}`,
  };
}

afterEach(async () => {
  await Promise.all(
    serversToClose.splice(0, serversToClose.length).map((server) => {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    })
  );

  if (typeof BODY_TIMEOUT_ENV_SNAPSHOT === "undefined") {
    delete process.env[BODY_TIMEOUT_ENV_KEY];
  } else {
    process.env[BODY_TIMEOUT_ENV_KEY] = BODY_TIMEOUT_ENV_SNAPSHOT;
  }

  if (typeof GEMINI_TIMEOUT_ENV_SNAPSHOT === "undefined") {
    delete process.env[GEMINI_TIMEOUT_ENV_KEY];
  } else {
    process.env[GEMINI_TIMEOUT_ENV_KEY] = GEMINI_TIMEOUT_ENV_SNAPSHOT;
  }

  if (typeof GEMINI_API_KEY_ENV_SNAPSHOT === "undefined") {
    delete process.env[GEMINI_API_KEY_ENV_KEY];
  } else {
    process.env[GEMINI_API_KEY_ENV_KEY] = GEMINI_API_KEY_ENV_SNAPSHOT;
  }

  if (typeof OPERATOR_TOKEN_ENV_SNAPSHOT === "undefined") {
    delete process.env[OPERATOR_TOKEN_ENV_KEY];
  } else {
    process.env[OPERATOR_TOKEN_ENV_KEY] = OPERATOR_TOKEN_ENV_SNAPSHOT;
  }

  if (typeof OPERATOR_ROLES_ENV_SNAPSHOT === "undefined") {
    delete process.env[OPERATOR_ROLES_ENV_KEY];
  } else {
    process.env[OPERATOR_ROLES_ENV_KEY] = OPERATOR_ROLES_ENV_SNAPSHOT;
  }

  if (typeof OPERATOR_OIDC_ISSUER_ENV_SNAPSHOT === "undefined") {
    delete process.env[OPERATOR_OIDC_ISSUER_ENV_KEY];
  } else {
    process.env[OPERATOR_OIDC_ISSUER_ENV_KEY] =
      OPERATOR_OIDC_ISSUER_ENV_SNAPSHOT;
  }

  if (typeof OPERATOR_OIDC_AUDIENCE_ENV_SNAPSHOT === "undefined") {
    delete process.env[OPERATOR_OIDC_AUDIENCE_ENV_KEY];
  } else {
    process.env[OPERATOR_OIDC_AUDIENCE_ENV_KEY] =
      OPERATOR_OIDC_AUDIENCE_ENV_SNAPSHOT;
  }

  if (typeof OPERATOR_OIDC_JWKS_ENV_SNAPSHOT === "undefined") {
    delete process.env[OPERATOR_OIDC_JWKS_ENV_KEY];
  } else {
    process.env[OPERATOR_OIDC_JWKS_ENV_KEY] = OPERATOR_OIDC_JWKS_ENV_SNAPSHOT;
  }

  if (typeof OPENCLAW_WEBHOOK_ENV_SNAPSHOT === "undefined") {
    delete process.env[OPENCLAW_WEBHOOK_ENV_KEY];
  } else {
    process.env[OPENCLAW_WEBHOOK_ENV_KEY] = OPENCLAW_WEBHOOK_ENV_SNAPSHOT;
  }
});

async function startServer(
  options: Parameters<typeof createStagePilotApiServer>[0]
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createStagePilotApiServer(options);
  serversToClose.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () => {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

function sendStalledPlanRequest(options: {
  bodyChunk: string;
  contentType?: string;
  contentLength: number;
  port: number;
}): Promise<{
  body: string;
  headers: Record<string, string>;
  statusCode: number;
}> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let rawResponse = "";
    let settled = false;

    const parseRawResponse = () => {
      const [head, body = ""] = rawResponse.split("\r\n\r\n");
      const match = head.match(HTTP_STATUS_LINE_REGEX);
      if (!match) {
        return null;
      }

      const headers = Object.fromEntries(
        head
          .split("\r\n")
          .slice(1)
          .map((line) => {
            const separator = line.indexOf(":");
            if (separator < 0) {
              return null;
            }
            const key = line.slice(0, separator).trim().toLowerCase();
            const value = line.slice(separator + 1).trim();
            return [key, value] as const;
          })
          .filter((entry): entry is readonly [string, string] => entry !== null)
      );

      return {
        body,
        headers,
        statusCode: Number.parseInt(match[1] ?? "0", 10),
      };
    };

    const finish = (value: {
      body: string;
      headers: Record<string, string>;
      statusCode: number;
    }) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(5000, () => {
      fail(new Error("stalled request test socket timeout"));
    });

    socket.connect(options.port, "127.0.0.1", () => {
      const headers = [
        "POST /v1/plan HTTP/1.1",
        `Host: 127.0.0.1:${options.port}`,
        `Content-Type: ${options.contentType ?? "application/json"}`,
        `Content-Length: ${options.contentLength}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n");

      socket.write(headers);
      socket.write(options.bodyChunk);
      // Keep socket open to simulate a client that never finishes body upload.
    });

    socket.on("data", (chunk) => {
      rawResponse += chunk.toString("utf8");
    });

    socket.on("error", (error) => {
      const networkError = error as NodeJS.ErrnoException;
      if (networkError.code === "ECONNRESET") {
        const parsed = parseRawResponse();
        if (parsed) {
          finish(parsed);
          return;
        }
      }
      fail(error);
    });

    socket.on("end", () => {
      const parsed = parseRawResponse();
      if (!parsed) {
        reject(new Error(`unable to parse response: ${rawResponse}`));
        return;
      }
      finish(parsed);
    });
  });
}

function sendTrickledPlanRequest(options: {
  chunks: Array<{
    atMs: number;
    data: string;
  }>;
  contentLength: number;
  port: number;
}): Promise<{
  body: string;
  elapsedMs: number;
  headers: Record<string, string>;
  statusCode: number;
}> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let rawResponse = "";
    const startedAt = Date.now();
    const timers: NodeJS.Timeout[] = [];

    const finish = (
      fn: (value: {
        body: string;
        elapsedMs: number;
        headers: Record<string, string>;
        statusCode: number;
      }) => void,
      value: {
        body: string;
        elapsedMs: number;
        headers: Record<string, string>;
        statusCode: number;
      }
    ) => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      socket.destroy();
      fn(value);
    };

    const fail = (error: Error) => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(7000, () => {
      fail(new Error("trickled request test socket timeout"));
    });

    socket.connect(options.port, "127.0.0.1", () => {
      const headers = [
        "POST /v1/plan HTTP/1.1",
        `Host: 127.0.0.1:${options.port}`,
        "Content-Type: application/json",
        `Content-Length: ${options.contentLength}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n");

      socket.write(headers);
      for (const chunk of options.chunks) {
        timers.push(
          setTimeout(() => {
            if (!socket.destroyed) {
              socket.write(chunk.data);
            }
          }, chunk.atMs)
        );
      }
      // Do not end socket; keep it open to mimic trickling uploader.
    });

    socket.on("data", (chunk) => {
      rawResponse += chunk.toString("utf8");
    });

    socket.on("error", (error) => {
      fail(error);
    });

    socket.on("end", () => {
      const [head, body = ""] = rawResponse.split("\r\n\r\n");
      const match = head.match(HTTP_STATUS_LINE_REGEX);
      if (!match) {
        reject(new Error(`unable to parse response: ${rawResponse}`));
        return;
      }

      const headers = Object.fromEntries(
        head
          .split("\r\n")
          .slice(1)
          .map((line) => {
            const separator = line.indexOf(":");
            if (separator < 0) {
              return null;
            }
            const key = line.slice(0, separator).trim().toLowerCase();
            const value = line.slice(separator + 1).trim();
            return [key, value] as const;
          })
          .filter((entry): entry is readonly [string, string] => entry !== null)
      );

      finish(resolve, {
        body,
        elapsedMs: Date.now() - startedAt,
        headers,
        statusCode: Number.parseInt(match[1] ?? "0", 10),
      });
    });
  });
}

describe("stagepilot api server", () => {
  it("serves desktop demo page", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/demo`);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("StagePilot Judge Console");
    expect(html).toContain("/v1/whatif");
    expect(html).toContain("Loading benchmark-backed reviewer surface");
    expect(html).toContain("Static/docs surfaces stay reviewer aids");
  });

  it("supports HEAD for desktop demo page", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/demo`, {
      method: "HEAD",
    });
    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/html");

    const html = await response.text();
    expect(html).toBe("");
  });

  it("returns health response", async () => {
    process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS = "1500";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      diagnostics: {
        integrationReady: boolean;
        nextAction: string;
        requestBodyTimeoutMs: number;
      };
      ok: boolean;
      ops_contract: {
        schema: string;
      };
      readinessContract: string;
      reportContract: {
        schema: string;
      };
      service: string;
      status: string;
      useGpu: boolean;
    };

    expect(body.ok).toBe(true);
    expect(body.service).toBeTypeOf("string");
    expect(body.status).toBe("ok");
    expect(body.ops_contract.schema).toBe("ops-envelope-v1");
    expect(body.readinessContract).toBe("stagepilot-runtime-brief-v1");
    expect(body.reportContract.schema).toBe("stagepilot-plan-report-v1");
    expect(body.useGpu).toBe(false);
    expect(body.diagnostics.integrationReady).toBe(false);
    expect(body.diagnostics.requestBodyTimeoutMs).toBe(1500);
    expect(body.diagnostics.nextAction).toContain("gemini_api_key");
  });

  it("supports HEAD for health response", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/health`, {
      method: "HEAD",
    });
    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/json");

    const body = await response.text();
    expect(body).toBe("");
  });

  it("returns runtime meta for integrations and routes", async () => {
    process.env.GEMINI_HTTP_TIMEOUT_MS = "4321";
    process.env.GEMINI_API_KEY = "stagepilot-test-key";
    process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS = "2100";
    process.env.OPENCLAW_WEBHOOK_URL = "https://example.invalid/webhook";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/meta`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      diagnostics: {
        integrationReady: boolean;
        missingIntegrations: string[];
        nextAction: string;
      };
      integrations: {
        gemini: {
          timeoutMs: number;
        };
        openClaw: {
          configured: boolean;
          hasWebhookUrl: boolean;
        };
      };
      ok: boolean;
      readinessContract: string;
      reportContract: {
        schema: string;
      };
      requestLimits: {
        bodyTimeoutMs: number;
      };
      routes: Array<{
        method: string;
        path: string;
      }>;
    };

    expect(body.ok).toBe(true);
    expect(body.readinessContract).toBe("stagepilot-runtime-brief-v1");
    expect(body.reportContract.schema).toBe("stagepilot-plan-report-v1");
    expect(body.requestLimits.bodyTimeoutMs).toBe(2100);
    expect(body.diagnostics.integrationReady).toBe(true);
    expect(body.diagnostics.missingIntegrations).toEqual([]);
    expect(body.diagnostics.nextAction).toContain("POST /v1/plan");
    expect(body.integrations.gemini.timeoutMs).toBe(4321);
    expect(body.integrations.openClaw.configured).toBe(true);
    expect(body.integrations.openClaw.hasWebhookUrl).toBe(true);
    expect(body.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "GET", path: "/v1/meta" }),
        expect.objectContaining({ method: "GET", path: "/v1/protocol-matrix" }),
        expect.objectContaining({
          method: "GET",
          path: "/v1/provider-benchmark-scorecard",
        }),
        expect.objectContaining({
          method: "GET",
          path: "/v1/perf-evidence-pack",
        }),
        expect.objectContaining({
          method: "GET",
          path: "/v1/trace-observability-pack",
        }),
        expect.objectContaining({ method: "POST", path: "/v1/plan" }),
      ])
    );
  });

  it("supports HEAD for runtime meta response", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/meta`, {
      method: "HEAD",
    });
    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/json");

    const body = await response.text();
    expect(body).toBe("");
  });

  it("returns operator runtime brief", async () => {
    process.env.GEMINI_API_KEY = "stagepilot-test-key";
    process.env.OPENCLAW_WEBHOOK_URL = "https://example.invalid/webhook";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/runtime-brief`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      diagnostics: {
        integrationReady: boolean;
      };
      headline: string;
      links: {
        developerOpsPack: string;
        perfEvidencePack: string;
        providerBenchmarkScorecard: string;
        protocolMatrix: string;
        traceObservabilityPack: string;
        workflowRuns: string;
      };
      readinessContract: string;
      reportContract: {
        schema: string;
      };
      reviewFlow: string[];
      routeCount: number;
    };

    expect(body.readinessContract).toBe("stagepilot-runtime-brief-v1");
    expect(body.reportContract.schema).toBe("stagepilot-plan-report-v1");
    expect(body.diagnostics.integrationReady).toBe(true);
    expect(body.reviewFlow.length).toBeGreaterThanOrEqual(3);
    expect(body.routeCount).toBeGreaterThanOrEqual(10);
    expect(body.headline).toContain("orchestration");
    expect(body.links.developerOpsPack).toBe("/v1/developer-ops-pack");
    expect(body.links.perfEvidencePack).toBe("/v1/perf-evidence-pack");
    expect(body.links.providerBenchmarkScorecard).toBe(
      "/v1/provider-benchmark-scorecard"
    );
    expect(body.links.protocolMatrix).toBe("/v1/protocol-matrix");
    expect(body.links.traceObservabilityPack).toBe(
      "/v1/trace-observability-pack"
    );
    expect(body.links.workflowRuns).toBe("/v1/workflow-runs");
    expect(body.links.workflowReplay).toBe("/v1/workflow-run-replay");
  });

  it("returns protocol matrix for cross-provider tool-call coverage", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/protocol-matrix`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      schema: string;
      headline: string;
      summary: {
        protocolCount: number;
        readyCount: number;
      };
      protocols: Array<{
        id: string;
        coverage: string[];
        failureHotspots: string[];
      }>;
      links: {
        protocolMatrix: string;
        reviewPack: string;
      };
      reviewPath: string[];
    };

    expect(body.schema).toBe("stagepilot-protocol-matrix-v1");
    expect(body.headline).toContain("Cross-protocol matrix");
    expect(body.summary.protocolCount).toBeGreaterThanOrEqual(4);
    expect(body.summary.readyCount).toBeGreaterThanOrEqual(4);
    expect(body.protocols.some((item) => item.id === "morph-xml")).toBe(true);
    expect(
      body.protocols.every(
        (item) => item.coverage.length >= 3 && item.failureHotspots.length >= 3
      )
    ).toBe(true);
    expect(body.links.protocolMatrix).toBe("/v1/protocol-matrix");
    expect(body.links.reviewPack).toBe("/v1/review-pack");
    expect(body.reviewPath.length).toBeGreaterThanOrEqual(3);
  });

  it("returns provider benchmark scorecard for frontier review posture", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/provider-benchmark-scorecard`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      headline: string;
      links: {
        providerBenchmarkScorecard: string;
        protocolMatrix: string;
      };
      providers: Array<{
        contractConfidencePct: number;
        posture: string;
        provider: string;
        proofRoutes: string[];
      }>;
      reviewPath: string[];
      schema: string;
      summary: {
        providerCount: number;
        topStrategy: { strategy: string } | null;
      };
    };

    expect(body.schema).toBe("stagepilot-provider-benchmark-scorecard-v1");
    expect(body.headline).toContain("Provider benchmark scorecard");
    expect(body.summary.providerCount).toBeGreaterThanOrEqual(4);
    expect(body.summary.topStrategy).not.toBeNull();
    expect(
      body.providers.some((item) => item.provider === "openai-compatible")
    ).toBe(true);
    expect(
      body.providers.every(
        (item) =>
          item.contractConfidencePct >= 0 && item.proofRoutes.length >= 3
      )
    ).toBe(true);
    expect(body.links.providerBenchmarkScorecard).toBe(
      "/v1/provider-benchmark-scorecard"
    );
    expect(body.links.protocolMatrix).toBe("/v1/protocol-matrix");
    expect(body.reviewPath.length).toBeGreaterThanOrEqual(3);
  });

  it("returns perf evidence pack for runtime pressure review", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/perf-evidence-pack`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      headline: string;
      links: {
        perfEvidencePack: string;
        runtimeScorecard: string;
      };
      observedRun: {
        p95DurationMs: number | null;
        routeMix: Array<{
          path: string;
          sharePct: number;
        }>;
      };
      reviewPath: string[];
      schema: string;
      summary: {
        checksPassRatePct: number | null;
        requestCount: number | null;
        topStrategy: { strategy: string } | null;
      };
    };

    expect(body.schema).toBe("stagepilot-perf-evidence-pack-v1");
    expect(body.headline).toContain("Perf evidence pack");
    expect(body.summary.topStrategy).not.toBeNull();
    expect(body.summary.requestCount).toBeGreaterThanOrEqual(100);
    expect(body.summary.checksPassRatePct).toBeGreaterThanOrEqual(100);
    expect(body.observedRun.p95DurationMs).toBeGreaterThanOrEqual(1000);
    expect(body.observedRun.routeMix.some((item) => item.path === "/v1/plan")).toBe(true);
    expect(body.links.perfEvidencePack).toBe("/v1/perf-evidence-pack");
    expect(body.links.runtimeScorecard).toBe("/v1/runtime-scorecard");
    expect(body.reviewPath.length).toBeGreaterThanOrEqual(3);
  });

  it("returns trace observability pack for frontier replay review", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/trace-observability-pack`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      headline: string;
      hotspots: Array<{
        providerFamily: string;
        risk: string;
      }>;
      links: {
        failureTaxonomy: string;
        traceObservabilityPack: string;
      };
      reviewPath: string[];
      schema: string;
      summary: {
        gate: string;
        totalTraces: number;
        topStrategy: { strategy: string } | null;
      };
      traces: Array<{
        providerFamily: string;
        regressionGate: string;
        traceId: string;
      }>;
    };

    expect(body.schema).toBe("stagepilot-trace-observability-pack-v1");
    expect(body.headline).toContain("Trace observability pack");
    expect(body.summary.gate).toBe("bounded-review-ready");
    expect(body.summary.topStrategy).not.toBeNull();
    expect(body.summary.totalTraces).toBeGreaterThanOrEqual(4);
    expect(
      body.traces.some((item) => item.providerFamily === "anthropic-xml-style")
    ).toBe(true);
    expect(
      body.hotspots.some((item) => item.risk === "chunk-boundary drift")
    ).toBe(true);
    expect(body.links.traceObservabilityPack).toBe(
      "/v1/trace-observability-pack"
    );
    expect(body.links.failureTaxonomy).toBe("/v1/failure-taxonomy");
    expect(body.reviewPath.length).toBeGreaterThanOrEqual(4);
  });

  it("returns runtime scorecard with live route telemetry", async () => {
    process.env.GEMINI_API_KEY = "stagepilot-test-key";
    process.env.OPENCLAW_WEBHOOK_URL = "https://example.invalid/webhook";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    await fetch(`${baseUrl}/v1/runtime-brief`);
    await fetch(`${baseUrl}/v1/benchmark-summary`);

    const response = await fetch(`${baseUrl}/v1/runtime-scorecard`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      benchmark: {
        topStrategy: { strategy: string } | null;
      };
      links: {
        perfEvidencePack: string;
        providerBenchmarkScorecard: string;
        runtimeScorecard: string;
      };
      live?: never;
      recommendations: string[];
      runtime: {
        integrationsReady: boolean;
      };
      schema: string;
      traffic: {
        requestCount: number;
        routeCounts: Array<{
          count: number;
          path: string;
        }>;
      };
      persistence: {
        enabled: boolean;
        methodCounts: Record<string, number>;
        persistedCount: number;
        statusClasses: { ok: number };
      };
      workflowRuns: {
        schema: string;
      };
      operatorAuth: {
        enabled: boolean;
      };
    };

    expect(body.schema).toBe("stagepilot-runtime-scorecard-v1");
    expect(body.links.providerBenchmarkScorecard).toBe(
      "/v1/provider-benchmark-scorecard"
    );
    expect(body.links.perfEvidencePack).toBe("/v1/perf-evidence-pack");
    expect(body.links.runtimeScorecard).toBe("/v1/runtime-scorecard");
    expect(body.runtime.integrationsReady).toBe(true);
    expect(body.traffic.requestCount).toBeGreaterThanOrEqual(2);
    expect(body.persistence.enabled).toBe(true);
    expect(typeof body.persistence.persistedCount).toBe("number");
    expect(body.persistence.methodCounts.GET).toBeGreaterThanOrEqual(1);
    expect(body.persistence.statusClasses.ok).toBeGreaterThanOrEqual(1);
    expect(body.workflowRuns.schema).toBe("stagepilot-workflow-runs-v1");
    expect(body.links.workflowReplay).toBe("/v1/workflow-run-replay");
    expect(body.operatorAuth.enabled).toBe(false);
    expect(body.traffic.routeCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/v1/runtime-brief" }),
        expect.objectContaining({ path: "/v1/benchmark-summary" }),
      ])
    );
    expect(body.benchmark.topStrategy).not.toBeNull();
    expect(body.recommendations.length).toBeGreaterThanOrEqual(3);
  });

  it("returns failure taxonomy for parser, delivery, and runtime review", async () => {
    process.env.GEMINI_API_KEY = "stagepilot-test-key";
    process.env.OPENCLAW_WEBHOOK_URL = "https://example.invalid/webhook";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    await fetch(`${baseUrl}/v1/runtime-brief`);
    await fetch(`${baseUrl}/v1/benchmark-summary`);

    const response = await fetch(`${baseUrl}/v1/failure-taxonomy`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      failureModes: Array<{
        id: string;
        reviewerSurfaces: string[];
        signals: string[];
        status: string;
      }>;
      headline: string;
      links: {
        failureTaxonomy: string;
        providerBenchmarkScorecard: string;
        runtimeScorecard: string;
      };
      reviewPath: string[];
      schema: string;
      summary: {
        attentionCount: number;
        categoryCount: number;
        observedRequestCount: number;
      };
    };

    expect(body.schema).toBe("stagepilot-failure-taxonomy-v1");
    expect(body.links.failureTaxonomy).toBe("/v1/failure-taxonomy");
    expect(body.links.providerBenchmarkScorecard).toBe(
      "/v1/provider-benchmark-scorecard"
    );
    expect(body.links.runtimeScorecard).toBe("/v1/runtime-scorecard");
    expect(body.summary.categoryCount).toBeGreaterThanOrEqual(4);
    expect(body.summary.observedRequestCount).toBeGreaterThanOrEqual(2);
    expect(body.reviewPath.length).toBeGreaterThanOrEqual(3);
    expect(body.headline).toContain("Failure taxonomy");
    expect(
      body.failureModes.some((item) => item.id === "parse-contract-drift")
    ).toBe(true);
    expect(
      body.failureModes.some((item) =>
        item.reviewerSurfaces.includes("/v1/runtime-scorecard")
      )
    ).toBe(true);
    expect(
      body.failureModes.every((item) => item.signals.length >= 2)
    ).toBe(true);
    expect(body.summary.attentionCount).toBeGreaterThanOrEqual(1);
  });

  it("returns benchmark-backed review pack", async () => {
    process.env.GEMINI_API_KEY = "stagepilot-test-key";
    process.env.OPENCLAW_WEBHOOK_URL = "https://example.invalid/webhook";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/review-pack`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      links: {
        benchmarkSummary: string;
        developerOpsPack: string;
        providerBenchmarkScorecard: string;
        reviewPack: string;
        traceObservabilityPack: string;
        workflowRuns: string;
      };
      operatorJourney: Array<{ stage: string }>;
      proofAssets: Array<{ label: string; path: string }>;
      proofBundle: {
        benchmark: {
          caseCount: number;
          improvements: {
            loopVsBaseline: number | null;
          };
        };
        benchmarkSummarySchema: string;
        traceObservabilityPackSchema: string;
        reviewerPosture: {
          claimTier: string;
          claimRule: string;
          docsOnlySurfaces: string[];
        };
      };
      reviewPackId: string;
      reviewSequence: string[];
      twoMinuteReview: Array<{ step: string }>;
    };

    expect(body.reviewPackId).toBe("stagepilot-review-pack-v1");
    expect(body.links.reviewPack).toBe("/v1/review-pack");
    expect(body.operatorJourney).toHaveLength(4);
    expect(body.reviewSequence.length).toBeGreaterThanOrEqual(3);
    expect(body.twoMinuteReview.length).toBe(4);
    expect(body.proofAssets.length).toBeGreaterThanOrEqual(5);
    expect(body.proofAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "docs/reviewer-proof-guide.md",
        }),
      ])
    );
    expect(body.proofBundle.benchmark.caseCount).toBeGreaterThanOrEqual(20);
    expect(
      body.proofBundle.benchmark.improvements.loopVsBaseline
    ).toBeGreaterThan(50);
    expect(body.links.developerOpsPack).toBe("/v1/developer-ops-pack");
    expect(body.links.providerBenchmarkScorecard).toBe(
      "/v1/provider-benchmark-scorecard"
    );
    expect(body.links.traceObservabilityPack).toBe(
      "/v1/trace-observability-pack"
    );
    expect(body.links.workflowRuns).toBe("/v1/workflow-runs");
    expect(body.links.workflowReplay).toBe("/v1/workflow-run-replay");
    expect(body.links.benchmarkSummary).toBe("/v1/benchmark-summary");
    expect(body.proofBundle.benchmarkSummarySchema).toBe(
      "stagepilot-benchmark-summary-v1"
    );
    expect(body.proofBundle.traceObservabilityPackSchema).toBe(
      "stagepilot-trace-observability-pack-v1"
    );
    expect(body.proofBundle.reviewerPosture.docsOnlySurfaces).toContain(
      "site/"
    );
    expect(body.proofBundle.reviewerPosture.claimTier).toMatch(
      REVIEWER_CLAIM_TIER_REGEX
    );
    expect(body.proofBundle.reviewerPosture.claimRule).toContain(
      "reviewer aids"
    );
  });

  it("returns benchmark summary for reviewer triage", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(
      `${baseUrl}/v1/benchmark-summary?minSuccessRate=80&strategy=middleware`
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      benchmark: {
        strategies: Array<{
          status: string;
          strategy: string;
          successRate: number;
        }>;
        topStrategy: { strategy: string } | null;
        weakestStrategy: { strategy: string } | null;
      };
      filters: {
        minSuccessRate: number | null;
        strategy: string | null;
      };
      links: {
        benchmarkSummary: string;
      };
      schema: string;
      status: string;
    };

    expect(body.status).toBe("ok");
    expect(body.schema).toBe("stagepilot-benchmark-summary-v1");
    expect(body.filters.minSuccessRate).toBe(80);
    expect(body.filters.strategy).toBe("middleware");
    expect(body.links.benchmarkSummary).toBe("/v1/benchmark-summary");
    expect(
      body.benchmark.strategies.every((item) => item.successRate >= 80)
    ).toBe(true);
    expect(
      body.benchmark.strategies.every((item) => item.strategy === "middleware")
    ).toBe(true);
    expect(body.benchmark.topStrategy).not.toBeNull();
    expect(body.benchmark.weakestStrategy).not.toBeNull();
  });

  it("returns developer ops pack for merge-request and release review lanes", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(
      `${baseUrl}/v1/developer-ops-pack?lane=release-governor`
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      lane: string;
      links: {
        developerOpsPack: string;
      };
      proofRoutes: string[];
      reviewerNotes: string[];
      schema: string;
      selectedLane: {
        operatorFlow: string[];
      };
    };

    expect(body.schema).toBe("stagepilot-developer-ops-pack-v1");
    expect(body.lane).toBe("release-governor");
    expect(body.selectedLane.operatorFlow.length).toBeGreaterThanOrEqual(3);
    expect(body.proofRoutes).toContain("/v1/developer-ops-pack");
    expect(body.proofRoutes).toContain("/v1/workflow-runs");
    expect(body.links.developerOpsPack).toBe("/v1/developer-ops-pack");
    expect(body.links.workflowRuns).toBe("/v1/workflow-runs");
    expect(body.reviewerNotes.length).toBeGreaterThanOrEqual(3);
  });

  it("returns workflow run history for developer workflow replay", async () => {
    const { baseUrl } = await startServer({
      benchmarkRunner: () =>
        Promise.resolve({
          caseCount: 2,
          generatedAt: "2026-02-28T00:00:00.000Z",
          improvements: {
            loopVsBaseline: 20,
            loopVsMiddleware: 10,
            middlewareVsBaseline: 10,
          },
          seed: 1,
          strategies: [],
        }),
      engine: new StagePilotEngine(),
    });

    await fetch(`${baseUrl}/v1/plan`, {
      body: JSON.stringify({
        caseId: "workflow-001",
        district: "Gangbuk-gu",
        notes: "Needs triage",
        risks: ["food"],
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const benchmark = await fetch(`${baseUrl}/v1/benchmark`, {
      body: JSON.stringify({ caseCount: 2 }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const benchmarkRequestId = benchmark.headers.get("x-request-id");
    expect(benchmarkRequestId).toBeTruthy();

    const list = await fetch(
      `${baseUrl}/v1/workflow-runs?lane=pipeline-recovery`
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      items: Array<{ requestId: string | null }>;
      schema: string;
      summary: { totalRuns: number };
    };
    expect(listBody.schema).toBe("stagepilot-workflow-runs-v1");
    expect(listBody.summary.totalRuns).toBeGreaterThanOrEqual(1);
    expect(
      listBody.items.some((item) => item.requestId === benchmarkRequestId)
    ).toBe(true);

    const detail = await fetch(
      `${baseUrl}/v1/workflow-runs/${benchmarkRequestId}`
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      lane: string | null;
      links: { workflowRuns: string };
      schema: string;
      timeline: Array<{ path: string }>;
    };
    expect(detailBody.schema).toBe("stagepilot-workflow-run-detail-v1");
    expect(detailBody.lane).toBe("pipeline-recovery");
    expect(
      detailBody.timeline.some((item) => item.path === "/v1/benchmark")
    ).toBe(true);
    expect(detailBody.links.workflowRuns).toBe("/v1/workflow-runs");
  });

  it("returns workflow replay surface with proof routes after execution", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    await fetch(`${baseUrl}/v1/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caseId: "runtime-replay-001",
        district: "Gangbuk-gu",
        notes: "Parser drift and delivery proof need review",
        risks: ["housing", "food", "income"],
        urgencyHint: "high",
      }),
    });

    const benchmark = await fetch(`${baseUrl}/v1/benchmark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caseId: "runtime-replay-001",
        baselineStrategy: "prompt-only",
        candidateStrategy: "middleware",
      }),
    });
    const benchmarkRequestId = benchmark.headers.get("x-request-id");
    expect(benchmarkRequestId).toBeTruthy();

    const response = await fetch(
      `${baseUrl}/v1/workflow-run-replay?lane=pipeline-recovery`
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      schema: string;
      summary: { visibleRuns: number };
      items: Array<{
        requestId: string | null;
        proofRoutes: string[];
        timelineCount: number;
      }>;
      links: { workflowReplay: string; workflowRuns: string };
    };

    expect(body.schema).toBe("stagepilot-workflow-replay-v1");
    expect(body.summary.visibleRuns).toBeGreaterThanOrEqual(2);
    expect(
      body.items.some(
        (item) =>
          typeof item.requestId === "string" && item.requestId.length > 0
      )
    ).toBe(true);
    expect(body.items[0].proofRoutes).toContain("/v1/runtime-scorecard");
    expect(body.items[0].timelineCount).toBeGreaterThanOrEqual(1);
    expect(body.links.workflowReplay).toBe("/v1/workflow-run-replay");
    expect(body.links.workflowRuns).toBe("/v1/workflow-runs");
  });

  it("rejects invalid benchmark summary filter", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(
      `${baseUrl}/v1/benchmark-summary?strategy=invalid`
    );
    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("strategy");
  });

  it("rejects invalid developer ops lane", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(
      `${baseUrl}/v1/developer-ops-pack?lane=invalid`
    );
    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("lane");
  });

  it("rejects invalid workflow runs lane", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/workflow-runs?lane=invalid`);
    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("lane");
  });

  it("returns plan report schema surface", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/schema/plan-report`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      operatorRules: string[];
      requiredSections: string[];
      schema: string;
      status: string;
    };

    expect(body.status).toBe("ok");
    expect(body.schema).toBe("stagepilot-plan-report-v1");
    expect(body.requiredSections).toContain("plan");
    expect(body.operatorRules.length).toBeGreaterThanOrEqual(3);
  });

  it("runs planning endpoint", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/plan`, {
      body: JSON.stringify({
        caseId: "api-001",
        district: "Gangbuk-gu",
        notes: "Rent overdue, food instability",
        risks: ["housing", "food", "income"],
        urgencyHint: "high",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      result: {
        plan: {
          actions: unknown[];
        };
      };
    };

    expect(body.ok).toBe(true);
    expect(body.result.plan.actions.length).toBeGreaterThanOrEqual(4);
  });

  it("requires an allowed operator role when runtime mutation roles are configured", async () => {
    process.env.STAGEPILOT_OPERATOR_TOKEN = "stagepilot-secret";
    process.env.STAGEPILOT_OPERATOR_ALLOWED_ROLES =
      "release-manager,case-worker";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const denied = await fetch(`${baseUrl}/v1/plan`, {
      body: JSON.stringify({
        caseId: "api-roles-001",
        district: "Gangbuk-gu",
        notes: "Rent overdue, food instability",
        risks: ["housing", "food", "income"],
        urgencyHint: "high",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-operator-token": "stagepilot-secret",
      },
      method: "POST",
    });

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: "missing required operator role",
      ok: false,
      path: "/v1/plan",
    });

    const allowed = await fetch(`${baseUrl}/v1/plan`, {
      body: JSON.stringify({
        caseId: "api-roles-002",
        district: "Gangbuk-gu",
        notes: "Rent overdue, food instability",
        risks: ["housing", "food", "income"],
        urgencyHint: "high",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-operator-token": "stagepilot-secret",
        "x-operator-role": "release-manager",
      },
      method: "POST",
    });

    expect(allowed.status).toBe(200);

    const scorecard = await fetch(`${baseUrl}/v1/runtime-scorecard`);
    const scorecardBody = (await scorecard.json()) as {
      operatorAuth: {
        requiredRoles: string[];
        roleHeaders: string[];
      };
    };

    expect(scorecard.status).toBe(200);
    expect(scorecardBody.operatorAuth.requiredRoles).toEqual([
      "release-manager",
      "case-worker",
    ]);
    expect(scorecardBody.operatorAuth.roleHeaders).toContain("x-operator-role");
  });

  it("boots an operator session cookie and reuses it for protected mutation routes", async () => {
    process.env.STAGEPILOT_OPERATOR_TOKEN = "stagepilot-session-secret";
    process.env.STAGEPILOT_OPERATOR_ALLOWED_ROLES = "release-manager";

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const sessionResponse = await fetch(`${baseUrl}/v1/auth/session`, {
      body: JSON.stringify({
        authMode: "token",
        credential: "stagepilot-session-secret",
        roles: ["release-manager"],
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const sessionCookie = String(
      sessionResponse.headers.get("set-cookie") || ""
    )
      .split(";")[0]
      .trim();
    const sessionBody = (await sessionResponse.json()) as {
      active: boolean;
      session: { roles: string[] };
    };

    expect(sessionResponse.status).toBe(200);
    expect(sessionCookie).toContain("stagepilot_operator_session=");
    expect(sessionBody.active).toBe(true);
    expect(sessionBody.session.roles).toContain("release-manager");

    const planned = await fetch(`${baseUrl}/v1/plan`, {
      body: JSON.stringify({
        caseId: "api-session-001",
        district: "Mapo-gu",
        notes: "Need food and rent support after missed shifts.",
        risks: ["food", "income"],
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      method: "POST",
    });
    expect(planned.status).toBe(200);

    const currentSession = await fetch(`${baseUrl}/v1/auth/session`, {
      headers: {
        Cookie: sessionCookie,
      },
    });
    const currentSessionBody = (await currentSession.json()) as {
      active: boolean;
      validation: { ok: boolean };
    };
    expect(currentSession.status).toBe(200);
    expect(currentSessionBody.active).toBe(true);
    expect(currentSessionBody.validation.ok).toBe(true);

    const cleared = await fetch(`${baseUrl}/v1/auth/session`, {
      method: "DELETE",
    });
    expect(cleared.status).toBe(200);
    expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("accepts OIDC bearer tokens with required roles for mutation routes", async () => {
    delete process.env[OPERATOR_TOKEN_ENV_KEY];
    process.env[OPERATOR_ROLES_ENV_KEY] = "release-manager";
    process.env[OPERATOR_OIDC_ISSUER_ENV_KEY] =
      "https://stagepilot.example/issuer";
    process.env[OPERATOR_OIDC_AUDIENCE_ENV_KEY] = "stagepilot-api";
    const { jwksJson, token } = createOidcToken({
      issuer: "https://stagepilot.example/issuer",
      audience: "stagepilot-api",
      roles: ["release-manager"],
    });
    process.env[OPERATOR_OIDC_JWKS_ENV_KEY] = jwksJson;

    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const allowed = await fetch(`${baseUrl}/v1/plan`, {
      body: JSON.stringify({
        caseId: "api-oidc-001",
        district: "Gangbuk-gu",
        notes: "Two residents need coordinated rent and meal support.",
        risks: ["housing", "food"],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(allowed.status).toBe(200);

    const scorecard = await fetch(`${baseUrl}/v1/runtime-scorecard`);
    const scorecardBody = (await scorecard.json()) as {
      operatorAuth: {
        mode: string;
        oidc: {
          enabled: boolean;
          issuer: string | null;
        };
      };
    };

    expect(scorecard.status).toBe(200);
    expect(scorecardBody.operatorAuth.mode).toBe("oidc");
    expect(scorecardBody.operatorAuth.oidc.enabled).toBe(true);
    expect(scorecardBody.operatorAuth.oidc.issuer).toBe(
      "https://stagepilot.example/issuer"
    );
  });

  it("returns 400 for invalid input body", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/plan`, {
      body: JSON.stringify({
        district: "Gangbuk-gu",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("returns 400 for malformed json body", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/plan`, {
      body: '{"caseId":',
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("invalid JSON");
  });

  it("returns 413 for oversized body", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });
    const huge = "x".repeat(1_100_000);

    const response = await fetch(`${baseUrl}/v1/plan`, {
      body: huge,
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(413);
    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("too large");
  });

  it("returns 415 when content type is not json", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/plan`, {
      body: "caseId=1",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    expect(response.status).toBe(415);
  });

  it("returns 415 and closes connection for non-json request with pending body", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });
    const port = Number.parseInt(new URL(baseUrl).port, 10);

    const response = await sendStalledPlanRequest({
      bodyChunk: "caseId=still-uploading",
      contentLength: 1024,
      contentType: "text/plain",
      port,
    });

    expect(response.statusCode).toBe(415);
    expect((response.headers.connection ?? "").toLowerCase()).toBe("close");
    const parsed = JSON.parse(response.body) as {
      error: string;
      ok: boolean;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("content-type");
  }, 7000);

  it("returns 413 and closes connection for oversized upload", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });
    const port = Number.parseInt(new URL(baseUrl).port, 10);

    const response = await sendStalledPlanRequest({
      bodyChunk: "x".repeat(1_100_000),
      contentLength: 1_200_000,
      port,
    });

    expect(response.statusCode).toBe(413);
    expect((response.headers.connection ?? "").toLowerCase()).toBe("close");
    const parsed = JSON.parse(response.body) as {
      error: string;
      ok: boolean;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("too large");
  }, 9000);

  it("returns 408 when request body upload stalls", async () => {
    process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS = "1000";
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });
    const port = Number.parseInt(new URL(baseUrl).port, 10);

    const response = await sendStalledPlanRequest({
      bodyChunk: '{"caseId":"stalling-upload"',
      contentLength: 256,
      port,
    });

    expect(response.statusCode).toBe(408);
    expect((response.headers.connection ?? "").toLowerCase()).toBe("close");
    const parsed = JSON.parse(response.body) as {
      error: string;
      ok: boolean;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("request body timeout");
  }, 7000);

  it("returns 408 when upload trickles beyond total timeout budget", async () => {
    process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS = "1200";
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });
    const port = Number.parseInt(new URL(baseUrl).port, 10);

    const response = await sendTrickledPlanRequest({
      chunks: [
        { atMs: 0, data: '{"caseId":"slow-1",' },
        { atMs: 500, data: '"district":"Gangbuk-gu",' },
        { atMs: 1000, data: '"notes":"delayed"' },
      ],
      contentLength: 1024,
      port,
    });

    expect(response.statusCode).toBe(408);
    expect((response.headers.connection ?? "").toLowerCase()).toBe("close");
    expect(response.elapsedMs).toBeLessThan(1800);
    const parsed = JSON.parse(response.body) as {
      error: string;
      ok: boolean;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("request body timeout");
  }, 9000);

  it("returns benchmark report from benchmark endpoint", async () => {
    const { baseUrl } = await startServer({
      benchmarkRunner: () =>
        Promise.resolve({
          caseCount: 2,
          generatedAt: "2026-02-28T00:00:00.000Z",
          improvements: {
            loopVsBaseline: 20,
            loopVsMiddleware: 10,
            middlewareVsBaseline: 10,
          },
          seed: 1,
          strategies: [],
        }),
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/benchmark`, {
      body: JSON.stringify({ caseCount: 2 }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      report: {
        caseCount: number;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.report.caseCount).toBe(2);
  });

  it("returns ontology insights from insights endpoint", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
      insightDeriver: () =>
        Promise.resolve({
          kpis: {
            judgeScore: 88,
            referralCount: 2,
            slaMinutes: 120,
            topPrograms: ["Emergency Livelihood Support"],
          },
          narrative: "- insight 1\n- insight 2\n- insight 3",
          source: "gemini",
        }),
    });

    const response = await fetch(`${baseUrl}/v1/insights`, {
      body: JSON.stringify({
        caseId: "api-insight-001",
        district: "Gangbuk-gu",
        notes: "Need routing",
        risks: ["food", "income"],
        urgencyHint: "high",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      insights: {
        source: string;
      };
      ok: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.insights.source).toBe("gemini");
  });

  it("returns what-if simulation from twin endpoint", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/whatif`, {
      body: JSON.stringify({
        caseId: "api-whatif-001",
        district: "Jungnang-gu",
        notes: "Need rapid routing with limited staffing",
        risks: ["food", "isolation"],
        profile: {
          caseWorkers: 7,
          demandPerHour: 10.2,
        },
        scenario: {
          demandDeltaPct: 20,
          staffingDeltaPct: -15,
        },
        urgencyHint: "high",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      twin: {
        alternatives: unknown[];
        profile: {
          caseWorkers: number;
        };
        recommendation: unknown | null;
        scenario: {
          demandDeltaPct: number;
          staffingDeltaPct: number;
        };
        simulated: {
          expectedFirstContactMinutes: number;
          slaBreachProbability: number;
        };
      };
    };

    expect(body.ok).toBe(true);
    expect(body.twin.scenario.staffingDeltaPct).toBe(-15);
    expect(body.twin.scenario.demandDeltaPct).toBe(20);
    expect(body.twin.profile.caseWorkers).toBe(7);
    expect(body.twin.simulated.expectedFirstContactMinutes).toBeGreaterThan(0);
    expect(body.twin.simulated.slaBreachProbability).toBeGreaterThanOrEqual(0);
    expect(body.twin.alternatives.length).toBeGreaterThan(0);
    expect(body.twin.recommendation).not.toBeNull();
  });

  it("returns 400 for invalid what-if scenario", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/whatif`, {
      body: JSON.stringify({
        caseId: "api-whatif-002",
        district: "Gangbuk-gu",
        notes: "Invalid scenario payload",
        risks: ["food"],
        scenario: {
          staffingDeltaPct: "fast",
        },
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("scenario.staffingDeltaPct");
  });

  it("returns 400 for invalid what-if profile", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/whatif`, {
      body: JSON.stringify({
        caseId: "api-whatif-003",
        district: "Gangbuk-gu",
        notes: "Invalid profile payload",
        profile: {
          caseWorkers: "many",
        },
        risks: ["housing", "income"],
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("profile.caseWorkers");
  });

  it("returns delivery result from notify endpoint", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
      openClawNotifier: () =>
        Promise.resolve({
          channel: "telegram",
          delivered: true,
          detail: "sent",
          mode: "cli",
          target: "@welfare-ops",
        }),
    });

    const response = await fetch(`${baseUrl}/v1/notify`, {
      body: JSON.stringify({
        caseId: "api-notify-001",
        delivery: {
          channel: "telegram",
          dryRun: false,
          target: "@welfare-ops",
        },
        district: "Gangbuk-gu",
        notes: "Need immediate dispatch",
        risks: ["food", "housing"],
        urgencyHint: "high",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      delivery: {
        delivered: boolean;
        mode: string;
      };
      ok: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.delivery.delivered).toBe(true);
    expect(body.delivery.mode).toBe("cli");
  });

  it("returns 400 for invalid notify delivery payload", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/notify`, {
      body: JSON.stringify({
        caseId: "api-notify-002",
        delivery: {
          dryRun: "yes",
        },
        district: "Gangbuk-gu",
        notes: "Need immediate dispatch",
        risks: ["food"],
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("delivery.dryRun");
  });

  it("handles openclaw inbox insights command and replies", async () => {
    let capturedMessage = "";
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
      insightDeriver: () =>
        Promise.resolve({
          kpis: {
            judgeScore: 93,
            referralCount: 2,
            slaMinutes: 120,
            topPrograms: ["Emergency Livelihood Support"],
          },
          narrative: "insight summary",
          source: "fallback",
        }),
      openClawNotifier: (input) => {
        capturedMessage = input.message ?? "";
        return Promise.resolve({
          channel: "telegram",
          delivered: false,
          detail: "dry run",
          mode: "dry-run",
          target: "@welfare-ops",
        });
      },
    });

    const response = await fetch(`${baseUrl}/v1/openclaw/inbox`, {
      body: JSON.stringify({
        delivery: {
          channel: "telegram",
          dryRun: true,
          target: "@welfare-ops",
        },
        message: "/insights single resident needs fast routing",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      action: string;
      delivery?: { mode: string };
      insights?: { narrative: string };
      ok: boolean;
      result: { intake: { notes: string } };
    };
    expect(body.ok).toBe(true);
    expect(body.action).toBe("insights");
    expect(body.insights?.narrative).toContain("insight");
    expect(body.delivery?.mode).toBe("dry-run");
    expect(body.result.intake.notes).toContain("single resident");
    expect(capturedMessage).toContain("[StagePilot Inbox]");
  });

  it("returns 400 for invalid openclaw inbox command", async () => {
    const { baseUrl } = await startServer({
      engine: new StagePilotEngine(),
    });

    const response = await fetch(`${baseUrl}/v1/openclaw/inbox`, {
      body: JSON.stringify({
        command: "dispatch-now",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      ok: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("plan|insights|whatif");
  });
});
