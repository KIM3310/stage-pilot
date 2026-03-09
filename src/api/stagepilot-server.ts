import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readGeminiHttpTimeoutMs } from "../stagepilot/agents";
import {
  benchmarkStagePilotStrategies,
  type StagePilotBenchmarkReport,
} from "../stagepilot/benchmark";
import {
  deriveStagePilotInsights,
  type StagePilotInsights,
} from "../stagepilot/insights";
import {
  createStagePilotOpenClawNotifierFromEnv,
  type StagePilotOpenClawNotifier,
  type StagePilotOpenClawTarget,
} from "../stagepilot/openclaw";
import {
  createStagePilotEngine,
  createStagePilotEngineFromEnv,
} from "../stagepilot/orchestrator";
import {
  type StagePilotTwinProfileInput,
  type StagePilotTwinResult,
  type StagePilotTwinScenarioInput,
  simulateStagePilotTwin,
} from "../stagepilot/twin";
import type {
  IntakeInput,
  RiskType,
  StagePilotResult,
} from "../stagepilot/types";
import {
  getStagePilotOperatorAuthStatus,
  isStagePilotOperatorAuthEnabled,
  requiresStagePilotOperatorToken,
  validateStagePilotOperatorAccess,
} from "./operator-access";
import {
  applyStagePilotOperatorSession,
  clearStagePilotOperatorSessionCookie,
  createStagePilotOperatorSessionCookie,
  getStagePilotOperatorSessionCookieName,
  readStagePilotOperatorSession,
  type StagePilotOperatorSessionView,
} from "./operator-session";
import {
  appendStagePilotRuntimeEvent,
  buildStagePilotRuntimeStoreSummary,
  buildStagePilotWorkflowRunDetail,
  buildStagePilotWorkflowRunList,
} from "./runtime-store";
import { renderStagePilotDemoHtml } from "./stagepilot-demo";
import {
  buildStagePilotBenchmarkSummary,
  buildStagePilotDeveloperOpsPack,
  buildStagePilotPlanReportSchema,
  buildStagePilotReviewPack,
  buildStagePilotRouteDescriptors,
  buildStagePilotRuntimeBrief,
  buildStagePilotRuntimeScorecard,
  type StagePilotRouteDescriptor,
} from "./stagepilot-service-meta";

interface JsonObject {
  [key: string]: unknown;
}

interface ParsedRequestUrl {
  pathname: string;
}

type StagePilotTrackedRequest = IncomingMessage & {
  operatorSession?: StagePilotOperatorSessionView | null;
  requestId?: string;
};

export interface StagePilotEngineLike {
  run(input: IntakeInput): Promise<StagePilotResult>;
}

export interface StagePilotApiServerOptions {
  benchmarkRunner?: BenchmarkRunner;
  engine?: StagePilotEngineLike;
  insightDeriver?: InsightDeriver;
  logger?: Pick<Console, "error" | "info" | "warn">;
  openClawNotifier?: StagePilotOpenClawNotifier;
}

interface BenchmarkOptions {
  caseCount?: number;
  maxLoopAttempts?: number;
  seed?: number;
}

type BenchmarkRunner = (
  options?: BenchmarkOptions
) => Promise<StagePilotBenchmarkReport>;
type InsightDeriver = (result: StagePilotResult) => Promise<StagePilotInsights>;
type TwinSimulator = (options: {
  profile?: StagePilotTwinProfileInput;
  result: StagePilotResult;
  scenario?: StagePilotTwinScenarioInput;
}) => StagePilotTwinResult;

interface StagePilotRuntimeTelemetry {
  errorCount: number;
  lastErrorAt: string | null;
  lastRequestAt: string | null;
  requestCount: number;
  routeCounts: Map<string, number>;
}

interface NotifyRequestOptions {
  dryRun?: boolean;
  message?: string;
  target?: StagePilotOpenClawTarget;
}

type InboxAction = "insights" | "plan" | "whatif";
type SessionAuthMode = "oidc" | "token";

interface InboxRequestOptions {
  action: InboxAction;
  promptText?: string;
  reply: boolean;
}

const HTML_CONTENT_TYPE = "text/html; charset=utf-8";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const DEFAULT_BODY_LIMIT_BYTES = 1_048_576;
const DEFAULT_BODY_TIMEOUT_MS = 10_000;
const CLOSE_CONNECTION_STATUS_CODES = new Set([408, 413, 415]);
const RISK_TYPES: RiskType[] = [
  "housing",
  "food",
  "income",
  "isolation",
  "care",
  "other",
];
const INBOX_MESSAGE_COMMAND_REGEX = /^\/?([a-zA-Z-]+)\s*(.*)$/;
const LEADING_SLASHES_REGEX = /^\/+/;
const BENCHMARK_DEFAULT_CASE_COUNT = 24;
const BENCHMARK_DEFAULT_MAX_LOOP_ATTEMPTS = 2;
const BENCHMARK_DEFAULT_SEED = 20_260_228;

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

function readInteger(
  value: unknown,
  options: {
    fallback: number;
    max: number;
    min: number;
  }
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return options.fallback;
  }

  const normalized = Math.trunc(value);
  return Math.min(options.max, Math.max(options.min, normalized));
}

function parseRequestUrl(rawUrl: string | undefined): ParsedRequestUrl {
  const parsed = new URL(rawUrl ?? "/", "http://127.0.0.1");
  return {
    pathname: parsed.pathname,
  };
}

function isRiskType(value: string): value is RiskType {
  return RISK_TYPES.includes(value as RiskType);
}

function toNonEmptyString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonObject,
  options?: {
    includeBody?: boolean;
  }
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", JSON_CONTENT_TYPE);
  if (CLOSE_CONNECTION_STATUS_CODES.has(statusCode)) {
    response.setHeader("Connection", "close");
  }
  if (options?.includeBody === false) {
    response.end();
    return;
  }
  response.end(`${JSON.stringify(payload)}\n`);
}

function sendHtml(
  response: ServerResponse,
  statusCode: number,
  html: string,
  options?: {
    includeBody?: boolean;
  }
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", HTML_CONTENT_TYPE);
  if (options?.includeBody === false) {
    response.end();
    return;
  }
  response.end(html);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
}

function logStagePilotEvent(
  logger: Pick<Console, "error" | "info" | "warn">,
  level: "error" | "info" | "warn",
  event: string,
  payload: Record<string, unknown>
) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    event,
    level,
    service: "stagepilot-api",
    ...payload,
  });
  if (level === "error") {
    logger.error(line);
  } else if (level === "warn") {
    logger.warn(line);
  } else {
    logger.info(line);
  }
}

function normalizeSessionAuthMode(value: unknown): SessionAuthMode | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "oidc" || normalized === "token") {
    return normalized;
  }
  return null;
}

function normalizeSessionRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function readOperatorSessionBootstrapBody(body: unknown):
  | {
      authMode: SessionAuthMode | null;
      credential: string;
      roles: string[];
    }
  | {
      error: string;
    } {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const authMode = normalizeSessionAuthMode(record.authMode ?? null);
  if (Object.hasOwn(record, "authMode") && authMode === null) {
    return {
      error: "authMode must be either token or oidc",
    };
  }
  return {
    authMode,
    credential: String(record.credential || "").trim(),
    roles: normalizeSessionRoles(record.roles ?? []),
  };
}

function setStagePilotOperatorHeaders(
  request: StagePilotTrackedRequest,
  bootstrap: {
    authMode: SessionAuthMode | null;
    credential: string;
    roles: string[];
  }
): () => void {
  const previousAuthorization = request.headers.authorization;
  const previousOperatorToken = request.headers["x-operator-token"];
  const previousOperatorRoles = request.headers["x-operator-roles"];

  request.headers.authorization = undefined;
  request.headers["x-operator-token"] = undefined;
  request.headers["x-operator-roles"] = undefined;

  if (bootstrap.authMode === "oidc") {
    request.headers.authorization = `Bearer ${bootstrap.credential}`;
  } else {
    request.headers["x-operator-token"] = bootstrap.credential;
  }
  if (bootstrap.roles.length > 0) {
    request.headers["x-operator-roles"] = bootstrap.roles.join(",");
  }

  return () => {
    request.headers.authorization =
      typeof previousAuthorization === "string"
        ? previousAuthorization
        : undefined;
    request.headers["x-operator-token"] =
      typeof previousOperatorToken === "string"
        ? previousOperatorToken
        : undefined;
    request.headers["x-operator-roles"] =
      typeof previousOperatorRoles === "string"
        ? previousOperatorRoles
        : undefined;
  };
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof SyntaxError) {
    return new HttpError(400, "invalid JSON body");
  }

  return new HttpError(500, toErrorMessage(error));
}

function readBodyTimeoutMs(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return DEFAULT_BODY_TIMEOUT_MS;
  }
  return Math.min(30_000, Math.max(1000, parsed));
}

async function readBodyChunkWithTimeout(
  iterator: AsyncIterator<unknown>,
  timeoutMs: number,
  configuredTimeoutMs = timeoutMs
): Promise<IteratorResult<unknown>> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new HttpError(
              408,
              `request body timeout (${configuredTimeoutMs}ms)`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function cancelBodyIterator(iterator: AsyncIterator<unknown>): void {
  if (typeof iterator.return !== "function") {
    return;
  }

  try {
    // Best-effort cancellation only; awaiting here can stall timeout responses.
    const cancellation = iterator.return();
    if (cancellation && typeof cancellation.catch === "function") {
      cancellation.catch(() => {
        // ignore cancellation errors
      });
    }
  } catch {
    // ignore cancellation errors
  }
}

async function readNextBodyChunkWithTimeout(options: {
  configuredTimeoutMs: number;
  iterator: AsyncIterator<unknown>;
  remainingMs: number;
}): Promise<IteratorResult<unknown>> {
  try {
    return await readBodyChunkWithTimeout(
      options.iterator,
      options.remainingMs,
      options.configuredTimeoutMs
    );
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.statusCode === 408) {
      cancelBodyIterator(options.iterator);
    }
    throw httpError;
  }
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes = DEFAULT_BODY_LIMIT_BYTES
): Promise<unknown> {
  const contentType = request.headers["content-type"];
  if (
    typeof contentType === "string" &&
    !contentType.includes("application/json")
  ) {
    throw new HttpError(415, "content-type must be application/json");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  const bodyTimeoutMs = readBodyTimeoutMs(
    process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS
  );
  const iterator = request[Symbol.asyncIterator]();
  const startedAt = Date.now();

  while (true) {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = bodyTimeoutMs - elapsedMs;
    if (remainingMs <= 0) {
      cancelBodyIterator(iterator);
      throw new HttpError(408, `request body timeout (${bodyTimeoutMs}ms)`);
    }
    const nextChunk = await readNextBodyChunkWithTimeout({
      configuredTimeoutMs: bodyTimeoutMs,
      iterator,
      remainingMs,
    });
    const { done, value } = nextChunk;
    if (done) {
      break;
    }
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    total += buffer.length;
    if (total > maxBytes) {
      cancelBodyIterator(iterator);
      throw new HttpError(413, "request body too large");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw toHttpError(error);
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function toIntakeInput(value: unknown): IntakeInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const caseId = record.caseId;
  const district = record.district;
  const notes = record.notes;
  const risks = record.risks;
  const urgencyHint = record.urgencyHint;
  const contactWindow = record.contactWindow;

  if (
    typeof caseId !== "string" ||
    typeof district !== "string" ||
    typeof notes !== "string" ||
    !isStringArray(risks)
  ) {
    return null;
  }

  return {
    caseId,
    contactWindow:
      typeof contactWindow === "string" ? contactWindow : undefined,
    district,
    notes,
    risks: risks.map((risk) => (isRiskType(risk) ? risk : "other")),
    urgencyHint:
      urgencyHint === "high" ||
      urgencyHint === "medium" ||
      urgencyHint === "low"
        ? urgencyHint
        : undefined,
  };
}

function extractBenchmarkOptions(body: unknown): Required<BenchmarkOptions> {
  const record = body && typeof body === "object" ? (body as JsonObject) : {};
  return {
    caseCount: readInteger(record.caseCount, {
      fallback:
        Number.parseInt(
          process.env.BENCHMARK_CASES ?? String(BENCHMARK_DEFAULT_CASE_COUNT),
          10
        ) || BENCHMARK_DEFAULT_CASE_COUNT,
      max: 200,
      min: 1,
    }),
    maxLoopAttempts: readInteger(record.maxLoopAttempts, {
      fallback: BENCHMARK_DEFAULT_MAX_LOOP_ATTEMPTS,
      max: 5,
      min: 2,
    }),
    seed: readInteger(record.seed, {
      fallback: BENCHMARK_DEFAULT_SEED,
      max: 2_147_483_647,
      min: 1,
    }),
  };
}

function buildRouteDescriptors(): StagePilotRouteDescriptor[] {
  return buildStagePilotRouteDescriptors();
}

function createRuntimeTelemetry(): StagePilotRuntimeTelemetry {
  return {
    errorCount: 0,
    lastErrorAt: null,
    lastRequestAt: null,
    requestCount: 0,
    routeCounts: new Map(),
  };
}

function recordRuntimeTelemetry(
  telemetry: StagePilotRuntimeTelemetry,
  method: string,
  pathname: string,
  statusCode: number,
  options?: {
    requestId?: string;
  }
): void {
  telemetry.requestCount += 1;
  telemetry.lastRequestAt = new Date().toISOString();
  telemetry.routeCounts.set(
    pathname,
    (telemetry.routeCounts.get(pathname) ?? 0) + 1
  );
  if (statusCode >= 400) {
    telemetry.errorCount += 1;
    telemetry.lastErrorAt = telemetry.lastRequestAt;
  }
  appendStagePilotRuntimeEvent({
    method,
    path: pathname,
    requestId: options?.requestId,
    statusCode,
    timestamp: telemetry.lastRequestAt ?? new Date().toISOString(),
  });
}

function buildMetaPayload(): JsonObject {
  const geminiTimeoutMs = readGeminiHttpTimeoutMs(
    process.env.GEMINI_HTTP_TIMEOUT_MS
  );
  const bodyTimeoutMs = readBodyTimeoutMs(
    process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS
  );
  const geminiHasApiKey =
    typeof process.env.GEMINI_API_KEY === "string" &&
    process.env.GEMINI_API_KEY.trim().length > 0;
  const openClawConfigured =
    Boolean(toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)) ||
    Boolean(toNonEmptyString(process.env.OPENCLAW_CMD));
  const missingIntegrations: string[] = [];
  if (!geminiHasApiKey) {
    missingIntegrations.push("gemini_api_key");
  }
  if (!openClawConfigured) {
    missingIntegrations.push("openclaw_delivery");
  }

  const service = process.env.SERVICE_NAME_API ?? "stagepilot-api";
  const runtimeBrief = buildStagePilotRuntimeBrief({
    bodyTimeoutMs,
    geminiHasApiKey,
    geminiTimeoutMs,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    openClawConfigured,
    openClawHasWebhookUrl: Boolean(
      toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)
    ),
    service,
  });

  return {
    benchmarkDefaults: {
      caseCount:
        Number.parseInt(
          process.env.BENCHMARK_CASES ?? String(BENCHMARK_DEFAULT_CASE_COUNT),
          10
        ) || BENCHMARK_DEFAULT_CASE_COUNT,
      maxLoopAttempts: BENCHMARK_DEFAULT_MAX_LOOP_ATTEMPTS,
      seed: BENCHMARK_DEFAULT_SEED,
    },
    features: {
      benchmark: true,
      insights: true,
      notify: true,
      openClawInbox: true,
      whatIf: true,
    },
    integrations: {
      gemini: {
        hasApiKey: geminiHasApiKey,
        timeoutMs: geminiTimeoutMs,
      },
      openClaw: {
        configured: openClawConfigured,
        hasApiKey:
          typeof process.env.OPENCLAW_API_KEY === "string" &&
          process.env.OPENCLAW_API_KEY.trim().length > 0,
        hasWebhookUrl: Boolean(
          toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)
        ),
      },
    },
    links: runtimeBrief.links,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    ok: true,
    diagnostics: {
      integrationReady: missingIntegrations.length === 0,
      missingIntegrations,
      nextAction:
        missingIntegrations.length === 0
          ? "Run POST /v1/plan or POST /v1/benchmark to validate live flows."
          : `Configure ${missingIntegrations[0]} to unlock live planning diagnostics.`,
      requestBodyTimeoutMs: bodyTimeoutMs,
    },
    ops_contract: {
      schema: "ops-envelope-v1",
      version: 1,
      required_fields: ["service", "status", "diagnostics.nextAction"],
    },
    readinessContract: runtimeBrief.readinessContract,
    reportContract: runtimeBrief.reportContract,
    requestLimits: {
      bodyBytes: DEFAULT_BODY_LIMIT_BYTES,
      bodyTimeoutMs,
    },
    routes: buildRouteDescriptors(),
    service,
    status: "ok",
    useGpu: false,
  };
}

function buildRuntimeBriefPayload(): JsonObject {
  const meta = buildMetaPayload();
  const service =
    typeof meta.service === "string" ? meta.service : "stagepilot-api";
  return buildStagePilotRuntimeBrief({
    bodyTimeoutMs: readBodyTimeoutMs(
      process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS
    ),
    geminiHasApiKey:
      typeof process.env.GEMINI_API_KEY === "string" &&
      process.env.GEMINI_API_KEY.trim().length > 0,
    geminiTimeoutMs: readGeminiHttpTimeoutMs(
      process.env.GEMINI_HTTP_TIMEOUT_MS
    ),
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    openClawConfigured:
      Boolean(toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)) ||
      Boolean(toNonEmptyString(process.env.OPENCLAW_CMD)),
    openClawHasWebhookUrl: Boolean(
      toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)
    ),
    service,
  });
}

function readStagePilotBenchmarkSnapshot() {
  const fallback = {
    caseCount: BENCHMARK_DEFAULT_CASE_COUNT,
    generatedAt: null,
    improvements: {
      loopVsBaseline: null,
      loopVsMiddleware: null,
      middlewareVsBaseline: null,
    },
    strategies: {
      baseline: null,
      middleware: null,
      ralphLoop: null,
    },
  };

  try {
    const payload = JSON.parse(
      readFileSync(
        new URL(
          "../../docs/benchmarks/stagepilot-latest.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as {
      caseCount?: unknown;
      generatedAt?: unknown;
      improvements?: Record<string, unknown>;
      strategies?: Array<{ strategy?: unknown; successRate?: unknown }>;
    };

    const strategyMap = new Map(
      Array.isArray(payload.strategies)
        ? payload.strategies.map((strategy) => [
            String(strategy.strategy ?? ""),
            typeof strategy.successRate === "number"
              ? strategy.successRate
              : null,
          ])
        : []
    );

    return {
      caseCount:
        typeof payload.caseCount === "number"
          ? payload.caseCount
          : fallback.caseCount,
      generatedAt:
        typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      improvements: {
        loopVsBaseline:
          typeof payload.improvements?.loopVsBaseline === "number"
            ? payload.improvements.loopVsBaseline
            : null,
        loopVsMiddleware:
          typeof payload.improvements?.loopVsMiddleware === "number"
            ? payload.improvements.loopVsMiddleware
            : null,
        middlewareVsBaseline:
          typeof payload.improvements?.middlewareVsBaseline === "number"
            ? payload.improvements.middlewareVsBaseline
            : null,
      },
      strategies: {
        baseline: strategyMap.get("baseline") ?? null,
        middleware: strategyMap.get("middleware") ?? null,
        ralphLoop: strategyMap.get("middleware+ralph-loop") ?? null,
      },
    };
  } catch {
    return fallback;
  }
}

function buildReviewPackPayload(): JsonObject {
  const runtimeBrief = buildRuntimeBriefPayload() as ReturnType<
    typeof buildStagePilotRuntimeBrief
  >;

  return buildStagePilotReviewPack({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    bodyTimeoutMs: readBodyTimeoutMs(
      process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS
    ),
    geminiHasApiKey:
      typeof process.env.GEMINI_API_KEY === "string" &&
      process.env.GEMINI_API_KEY.trim().length > 0,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    openClawConfigured:
      Boolean(toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)) ||
      Boolean(toNonEmptyString(process.env.OPENCLAW_CMD)),
    openClawHasWebhookUrl: Boolean(
      toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)
    ),
    service:
      typeof runtimeBrief.service === "string"
        ? runtimeBrief.service
        : "stagepilot-api",
  });
}

function buildBenchmarkSummaryPayload(
  minSuccessRate?: number,
  strategy?: string
): JsonObject {
  const service = process.env.SERVICE_NAME_API ?? "stagepilot-api";
  return buildStagePilotBenchmarkSummary({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    minSuccessRate,
    service,
    strategy,
  });
}

function buildDeveloperOpsPackPayload(lane?: string): JsonObject {
  return buildStagePilotDeveloperOpsPack({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    lane,
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
  });
}

function buildRuntimeScorecardPayload(
  telemetry: StagePilotRuntimeTelemetry
): JsonObject {
  const persisted = buildStagePilotRuntimeStoreSummary(10);
  const workflowRuns = buildStagePilotWorkflowRunList({ limit: 5 });
  const scorecard = buildStagePilotRuntimeScorecard({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    bodyTimeoutMs: readBodyTimeoutMs(
      process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS
    ),
    geminiHasApiKey:
      typeof process.env.GEMINI_API_KEY === "string" &&
      process.env.GEMINI_API_KEY.trim().length > 0,
    openClawConfigured:
      Boolean(toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)) ||
      Boolean(toNonEmptyString(process.env.OPENCLAW_CMD)),
    runtimeTelemetry: {
      errorCount: telemetry.errorCount,
      lastErrorAt: telemetry.lastErrorAt,
      lastRequestAt: telemetry.lastRequestAt,
      requestCount: telemetry.requestCount,
      routeCounts: [...telemetry.routeCounts.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.path.localeCompare(right.path)
        ),
    },
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
  });
  return {
    ...scorecard,
    persistence: {
      backend: persisted.backend,
      enabled: persisted.enabled,
      path: persisted.path,
      persistedCount: persisted.persistedCount,
      lastEventAt: persisted.lastEventAt,
      methodCounts: persisted.methodCounts,
      statusClasses: persisted.statusClasses,
      recentEvents: persisted.recentEvents,
    },
    workflowRuns,
    operatorAuth: {
      enabled: getStagePilotOperatorAuthStatus().enabled,
      mode: getStagePilotOperatorAuthStatus().mode,
      protectedRoutes: [
        "/v1/plan",
        "/v1/benchmark",
        "/v1/insights",
        "/v1/whatif",
        "/v1/notify",
        "/v1/openclaw/inbox",
      ],
      acceptedHeaders: getStagePilotOperatorAuthStatus().acceptedHeaders,
      sessionCookie: getStagePilotOperatorSessionCookieName(),
      roleHeaders: getStagePilotOperatorAuthStatus().roleHeaders,
      requiredRoles: getStagePilotOperatorAuthStatus().requiredRoles,
      oidc: getStagePilotOperatorAuthStatus().oidc,
    },
  };
}

function nextStagePilotRequestId(): string {
  return `spr-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function buildPlanReportSchemaPayload(): JsonObject {
  return {
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
    status: "ok",
    generatedAt: new Date().toISOString(),
    ...buildStagePilotPlanReportSchema(),
  };
}

function parseNumericRecord(options: {
  label: string;
  requiredMessage: string;
  value: unknown;
  valueKeys: string[];
}): {
  error?: string;
  record?: JsonObject;
} {
  const { label, requiredMessage, value, valueKeys } = options;
  if (typeof value === "undefined") {
    return {};
  }

  if (!value || typeof value !== "object") {
    return {
      error: requiredMessage,
    };
  }

  const record = value as JsonObject;
  for (const key of valueKeys) {
    const raw = record[key];
    if (
      typeof raw !== "undefined" &&
      (typeof raw !== "number" || !Number.isFinite(raw))
    ) {
      return {
        error: `invalid ${label}.${key}. expected finite number`,
      };
    }
  }

  return { record };
}

function parseTwinConfig(body: unknown): {
  error?: string;
  profile?: StagePilotTwinProfileInput;
  scenario?: StagePilotTwinScenarioInput;
} {
  if (!body || typeof body !== "object") {
    return {};
  }

  const parsed: {
    profile?: StagePilotTwinProfileInput;
    scenario?: StagePilotTwinScenarioInput;
  } = {};

  const scenarioCheck = parseNumericRecord({
    label: "scenario",
    requiredMessage:
      "invalid scenario. expected object with numeric deltas: staffingDeltaPct, demandDeltaPct, contactRateDeltaPct",
    value: (body as JsonObject).scenario,
    valueKeys: ["staffingDeltaPct", "demandDeltaPct", "contactRateDeltaPct"],
  });
  if (scenarioCheck.error) {
    return {
      error: scenarioCheck.error,
    };
  }
  if (scenarioCheck.record) {
    const scenarioRecord = scenarioCheck.record;
    parsed.scenario = {
      contactRateDeltaPct: scenarioRecord.contactRateDeltaPct as
        | number
        | undefined,
      demandDeltaPct: scenarioRecord.demandDeltaPct as number | undefined,
      staffingDeltaPct: scenarioRecord.staffingDeltaPct as number | undefined,
    };
  }

  const profileCheck = parseNumericRecord({
    label: "profile",
    requiredMessage:
      "invalid profile. expected object with numeric fields: avgHandleMinutes, backlogCases, caseWorkers, demandPerHour, contactSuccessRate",
    value: (body as JsonObject).profile,
    valueKeys: [
      "avgHandleMinutes",
      "backlogCases",
      "caseWorkers",
      "demandPerHour",
      "contactSuccessRate",
    ],
  });
  if (profileCheck.error) {
    return {
      error: profileCheck.error,
    };
  }
  if (profileCheck.record) {
    const profileRecord = profileCheck.record;
    parsed.profile = {
      avgHandleMinutes: profileRecord.avgHandleMinutes as number | undefined,
      backlogCases: profileRecord.backlogCases as number | undefined,
      caseWorkers: profileRecord.caseWorkers as number | undefined,
      contactSuccessRate: profileRecord.contactSuccessRate as
        | number
        | undefined,
      demandPerHour: profileRecord.demandPerHour as number | undefined,
    };
  }

  return parsed;
}

function parseNotifyConfig(body: unknown): {
  error?: string;
  options?: NotifyRequestOptions;
} {
  if (!body || typeof body !== "object") {
    return {
      options: {},
    };
  }

  const bodyRecord = body as JsonObject;
  const deliveryRaw = bodyRecord.delivery;
  if (typeof deliveryRaw === "undefined") {
    return {
      options: {},
    };
  }

  if (!deliveryRaw || typeof deliveryRaw !== "object") {
    return {
      error: "invalid delivery. expected object",
    };
  }

  const delivery = deliveryRaw as JsonObject;
  const channel = delivery.channel;
  const target = delivery.target;
  const threadId = delivery.threadId;
  const dryRun = delivery.dryRun;
  const message = delivery.message;

  if (typeof channel !== "undefined" && typeof channel !== "string") {
    return {
      error: "invalid delivery.channel. expected string",
    };
  }
  if (typeof target !== "undefined" && typeof target !== "string") {
    return {
      error: "invalid delivery.target. expected string",
    };
  }
  if (typeof threadId !== "undefined" && typeof threadId !== "string") {
    return {
      error: "invalid delivery.threadId. expected string",
    };
  }
  if (typeof dryRun !== "undefined" && typeof dryRun !== "boolean") {
    return {
      error: "invalid delivery.dryRun. expected boolean",
    };
  }
  if (typeof message !== "undefined" && typeof message !== "string") {
    return {
      error: "invalid delivery.message. expected string",
    };
  }

  return {
    options: {
      dryRun: dryRun as boolean | undefined,
      message: message as string | undefined,
      target: {
        channel: channel as string | undefined,
        target: target as string | undefined,
        threadId: threadId as string | undefined,
      },
    },
  };
}

function normalizeInboxAction(raw: string): InboxAction | null {
  const token = raw.replace(LEADING_SLASHES_REGEX, "").trim().toLowerCase();
  if (token === "plan") {
    return "plan";
  }
  if (token === "insights") {
    return "insights";
  }
  if (token === "whatif" || token === "what-if") {
    return "whatif";
  }
  return null;
}

function parseInboxPrimitiveTypes(record: JsonObject): string | undefined {
  if (
    typeof record.command !== "undefined" &&
    typeof record.command !== "string"
  ) {
    return "invalid command. expected string";
  }
  if (
    typeof record.message !== "undefined" &&
    typeof record.message !== "string"
  ) {
    return "invalid message. expected string";
  }
  if (
    typeof record.reply !== "undefined" &&
    typeof record.reply !== "boolean"
  ) {
    return "invalid reply. expected boolean";
  }
  return undefined;
}

function parseInboxActionFromCommand(commandRaw: unknown): {
  action?: InboxAction;
  error?: string;
} {
  if (typeof commandRaw !== "string" || commandRaw.trim().length === 0) {
    return {};
  }

  const action = normalizeInboxAction(commandRaw);
  if (!action) {
    return {
      error: "invalid command. expected plan|insights|whatif",
    };
  }

  return { action };
}

function parseInboxActionFromMessage(messageRaw: unknown): {
  action?: InboxAction;
  promptText?: string;
} {
  if (typeof messageRaw !== "string" || messageRaw.trim().length === 0) {
    return {};
  }

  const trimmed = messageRaw.trim();
  const match = trimmed.match(INBOX_MESSAGE_COMMAND_REGEX);
  const possibleAction = match?.[1] ? normalizeInboxAction(match[1]) : null;
  if (possibleAction) {
    return {
      action: possibleAction,
      promptText: match?.[2]?.trim() || undefined,
    };
  }

  return {
    action: "plan",
    promptText: trimmed,
  };
}

function parseInboxConfig(body: unknown): {
  error?: string;
  options?: InboxRequestOptions;
} {
  if (!body || typeof body !== "object") {
    return {
      options: {
        action: "plan",
        reply: true,
      },
    };
  }

  const record = body as JsonObject;
  const primitiveError = parseInboxPrimitiveTypes(record);
  if (primitiveError) {
    return {
      error: primitiveError,
    };
  }

  const fromCommand = parseInboxActionFromCommand(record.command);
  if (fromCommand.error) {
    return {
      error: fromCommand.error,
    };
  }
  const fromMessage = parseInboxActionFromMessage(record.message);

  const action = fromCommand.action ?? fromMessage.action ?? "plan";
  const promptText = fromMessage.promptText;

  return {
    options: {
      action,
      promptText,
      reply: (record.reply as boolean | undefined) ?? true,
    },
  };
}

function inferRisksFromText(text: string): RiskType[] {
  const lowered = text.toLowerCase();
  const inferred: RiskType[] = [];

  if (
    lowered.includes("food") ||
    lowered.includes("meal") ||
    lowered.includes("hungry")
  ) {
    inferred.push("food");
  }
  if (
    lowered.includes("rent") ||
    lowered.includes("housing") ||
    lowered.includes("evict")
  ) {
    inferred.push("housing");
  }
  if (
    lowered.includes("income") ||
    lowered.includes("job") ||
    lowered.includes("salary")
  ) {
    inferred.push("income");
  }
  if (
    lowered.includes("alone") ||
    lowered.includes("isolation") ||
    lowered.includes("lonely")
  ) {
    inferred.push("isolation");
  }
  if (
    lowered.includes("care") ||
    lowered.includes("elder") ||
    lowered.includes("disability")
  ) {
    inferred.push("care");
  }

  return inferred.length > 0 ? inferred : ["other"];
}

function normalizeUrgency(value: unknown): IntakeInput["urgencyHint"] {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return undefined;
}

function buildInboxIntake(options: {
  body: unknown;
  promptText?: string;
}): IntakeInput {
  const record =
    options.body && typeof options.body === "object"
      ? (options.body as JsonObject)
      : {};
  const noteSeed =
    (typeof record.notes === "string" ? record.notes.trim() : "") ||
    options.promptText ||
    "OpenClaw inbox request";

  const risks = isStringArray(record.risks)
    ? record.risks.map((risk) => (isRiskType(risk) ? risk : "other"))
    : inferRisksFromText(noteSeed);

  return {
    caseId:
      typeof record.caseId === "string" && record.caseId.trim().length > 0
        ? record.caseId.trim()
        : `inbox-${Date.now()}`,
    contactWindow:
      typeof record.contactWindow === "string" &&
      record.contactWindow.trim().length > 0
        ? record.contactWindow.trim()
        : undefined,
    district:
      typeof record.district === "string" && record.district.trim().length > 0
        ? record.district.trim()
        : "Gangbuk-gu",
    notes: noteSeed,
    risks,
    urgencyHint: normalizeUrgency(record.urgencyHint),
  };
}

function buildInboxReplyMessage(options: {
  action: InboxAction;
  insights?: StagePilotInsights;
  result: StagePilotResult;
  twin?: StagePilotTwinResult;
}): string {
  const lines = [
    `[StagePilot Inbox] action=${options.action}`,
    `Case: ${options.result.intake.caseId} | District: ${options.result.intake.district} | Score: ${options.result.judge.score}`,
    `Summary: ${options.result.plan.summary}`,
  ];

  if (options.insights) {
    lines.push(
      `Insights(${options.insights.source}): ${options.insights.narrative}`
    );
  }

  if (options.twin?.recommendation) {
    lines.push(
      `Twin: ${options.twin.recommendation.agencyName} wait ${options.twin.recommendation.expectedWaitMinutes}m breach ${Math.round(options.twin.recommendation.slaBreachProbability * 100)}%`
    );
  }

  return lines.join("\n");
}

function handleHealthRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  sendJson(response, 200, buildMetaPayload(), options);
}

function handleMetaRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  sendJson(response, 200, buildMetaPayload(), options);
}

function handleRuntimeBriefRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  sendJson(response, 200, buildRuntimeBriefPayload(), options);
}

function handlePlanReportSchemaRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  sendJson(response, 200, buildPlanReportSchemaPayload(), options);
}

function handleReviewPackRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildReviewPackPayload(), options);
}

function handleBenchmarkSummaryRequest(
  response: ServerResponse,
  minSuccessRate?: number,
  strategy?: string,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(
    response,
    200,
    buildBenchmarkSummaryPayload(minSuccessRate, strategy),
    options
  );
}

function handleDeveloperOpsPackRequest(
  response: ServerResponse,
  lane?: string,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildDeveloperOpsPackPayload(lane), options);
}

function parseStagePilotLane(rawUrl?: string): {
  error?: string;
  lane?: string;
} {
  const parsed = new URL(rawUrl ?? "/", "http://127.0.0.1");
  const rawLane = parsed.searchParams.get("lane");
  const lane =
    rawLane === null || rawLane.trim().length === 0
      ? undefined
      : rawLane.trim().toLowerCase();

  if (
    typeof lane !== "undefined" &&
    !["merge-request", "pipeline-recovery", "release-governor"].includes(lane)
  ) {
    return {
      error:
        "lane must be merge-request, pipeline-recovery, or release-governor",
    };
  }

  return { lane };
}

function handleWorkflowRunsRequest(
  response: ServerResponse,
  lane?: string,
  limit?: number,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(
    response,
    200,
    buildStagePilotWorkflowRunList({
      lane:
        lane === "merge-request" ||
        lane === "pipeline-recovery" ||
        lane === "release-governor"
          ? lane
          : undefined,
      limit,
    }),
    options
  );
}

function handleWorkflowRunDetailRequest(
  response: ServerResponse,
  requestId: string,
  options?: {
    includeBody?: boolean;
  }
) {
  const detail = buildStagePilotWorkflowRunDetail(requestId);
  if (!detail) {
    sendJson(response, 404, {
      error: `unknown workflow run: ${requestId}`,
      ok: false,
    });
    return;
  }
  sendJson(response, 200, detail, options);
}

function handleBenchmarkSummaryReadonly(
  response: ServerResponse,
  rawUrl: string | undefined,
  options: { includeBody?: boolean }
) {
  const parsed = new URL(rawUrl ?? "/", "http://127.0.0.1");
  const rawMinSuccessRate = parsed.searchParams.get("minSuccessRate");
  const rawStrategy = parsed.searchParams.get("strategy");
  const minSuccessRate =
    rawMinSuccessRate === null
      ? undefined
      : Number.parseFloat(rawMinSuccessRate);
  const strategy =
    rawStrategy === null || rawStrategy.trim().length === 0
      ? undefined
      : rawStrategy.trim().toLowerCase();
  if (
    typeof minSuccessRate !== "undefined" &&
    (!Number.isFinite(minSuccessRate) || Number.isNaN(minSuccessRate))
  ) {
    sendJson(response, 400, {
      error: "minSuccessRate must be a finite number",
      ok: false,
    });
    return;
  }
  if (
    typeof strategy !== "undefined" &&
    !["baseline", "middleware", "middleware+ralph-loop"].includes(strategy)
  ) {
    sendJson(response, 400, {
      error: "strategy must be baseline, middleware, or middleware+ralph-loop",
      ok: false,
    });
    return;
  }
  handleBenchmarkSummaryRequest(response, minSuccessRate, strategy, options);
}

function handleDeveloperOpsPackReadonly(
  response: ServerResponse,
  rawUrl: string | undefined,
  options: { includeBody?: boolean }
) {
  const laneConfig = parseStagePilotLane(rawUrl);
  if (laneConfig.error) {
    sendJson(response, 400, {
      error: laneConfig.error,
      ok: false,
    });
    return;
  }
  handleDeveloperOpsPackRequest(response, laneConfig.lane, options);
}

function handleWorkflowRunsReadonly(
  response: ServerResponse,
  rawUrl: string | undefined,
  options: { includeBody?: boolean }
) {
  const parsed = new URL(rawUrl ?? "/", "http://127.0.0.1");
  const laneConfig = parseStagePilotLane(rawUrl);
  const rawLimit = Number.parseInt(parsed.searchParams.get("limit") ?? "", 10);
  if (laneConfig.error) {
    sendJson(response, 400, {
      error: laneConfig.error,
      ok: false,
    });
    return;
  }
  handleWorkflowRunsRequest(
    response,
    laneConfig.lane,
    Number.isFinite(rawLimit) ? rawLimit : undefined,
    options
  );
}

function handleRuntimeScorecardRequest(
  response: ServerResponse,
  telemetry: StagePilotRuntimeTelemetry,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildRuntimeScorecardPayload(telemetry), options);
}

async function handleOperatorSessionReadonly(options: {
  request: StagePilotTrackedRequest;
  response: ServerResponse;
  includeBody?: boolean;
}) {
  const { includeBody = true, request, response } = options;
  const session = readStagePilotOperatorSession(request);
  const authResult = session
    ? await validateStagePilotOperatorAccess(request)
    : null;
  sendJson(
    response,
    200,
    {
      active: Boolean(session && authResult?.ok),
      cookieName: getStagePilotOperatorSessionCookieName(),
      ok: true,
      session,
      validation:
        authResult && session
          ? {
              authMode: authResult.authMode,
              ok: authResult.ok,
              reason: authResult.reason,
              roles: authResult.roles,
              subject: authResult.subject,
            }
          : null,
    },
    { includeBody }
  );
}

async function handleOperatorSessionCreate(options: {
  logger: Pick<Console, "error" | "info" | "warn">;
  request: StagePilotTrackedRequest;
  response: ServerResponse;
}) {
  const { logger, request, response } = options;
  if (!isStagePilotOperatorAuthEnabled()) {
    sendJson(response, 409, {
      error: "operator auth is not configured for session login",
      ok: false,
    });
    return;
  }

  const bootstrap = readOperatorSessionBootstrapBody(
    await readJsonBody(request)
  );
  if ("error" in bootstrap) {
    sendJson(response, 400, {
      error: bootstrap.error,
      ok: false,
    });
    return;
  }
  if (!bootstrap.credential) {
    sendJson(response, 400, {
      error: "missing credential",
      ok: false,
    });
    return;
  }

  const restoreHeaders = setStagePilotOperatorHeaders(request, bootstrap);
  const authResult = await validateStagePilotOperatorAccess(request);
  restoreHeaders();

  if (!authResult.ok) {
    sendJson(response, 403, {
      error:
        authResult.reason === "missing-role"
          ? "missing required operator role for session bootstrap"
          : "missing or invalid operator credential for session bootstrap",
      ok: false,
    });
    return;
  }

  const sessionCookie = createStagePilotOperatorSessionCookie({
    authMode: authResult.authMode === "oidc" ? "oidc" : "token",
    credential: bootstrap.credential,
    roles: authResult.roles,
    subject: authResult.subject,
  });
  response.setHeader("set-cookie", sessionCookie.cookie);
  logStagePilotEvent(logger, "info", "operator-session-created", {
    authMode: sessionCookie.session.authMode,
    requestId: request.requestId || null,
    roles: sessionCookie.session.roles,
    subject: sessionCookie.session.subject,
  });
  sendJson(response, 200, {
    active: true,
    cookieName: getStagePilotOperatorSessionCookieName(),
    ok: true,
    session: sessionCookie.session,
  });
}

function handleOperatorSessionDelete(options: {
  logger: Pick<Console, "error" | "info" | "warn">;
  request: StagePilotTrackedRequest;
  response: ServerResponse;
}) {
  const { logger, request, response } = options;
  response.setHeader("set-cookie", clearStagePilotOperatorSessionCookie());
  logStagePilotEvent(logger, "info", "operator-session-cleared", {
    requestId: request.requestId || null,
  });
  sendJson(response, 200, {
    active: false,
    cookieName: getStagePilotOperatorSessionCookieName(),
    ok: true,
  });
}

function handleDemoRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  sendHtml(response, 200, renderStagePilotDemoHtml(), options);
}

async function handlePlanRequest(options: {
  engine: StagePilotEngineLike;
  logger: Pick<Console, "error" | "info" | "warn">;
  request: IncomingMessage;
  response: ServerResponse;
}) {
  const { engine, logger, request, response } = options;
  try {
    const body = await readJsonBody(request);
    const intake = toIntakeInput(body);
    if (!intake) {
      sendJson(response, 400, {
        error:
          "invalid body. required: caseId, district, notes, risks(string[])",
        ok: false,
      });
      return;
    }

    const result = await engine.run(intake);
    sendJson(response, 200, {
      ok: true,
      result,
    });
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) {
      logger.error("[stagepilot-api] plan failed", error);
    } else {
      logger.warn("[stagepilot-api] plan rejected", httpError.message);
    }
    sendJson(response, httpError.statusCode, {
      error: httpError.message,
      ok: false,
    });
  }
}

async function handleBenchmarkRequest(options: {
  benchmarkRunner: BenchmarkRunner;
  logger: Pick<Console, "error" | "info" | "warn">;
  request: IncomingMessage;
  response: ServerResponse;
}) {
  const { benchmarkRunner, logger, request, response } = options;
  try {
    const body = await readJsonBody(request);
    const benchmarkOptions = extractBenchmarkOptions(body);
    const report = await benchmarkRunner(benchmarkOptions);
    sendJson(response, 200, {
      ok: true,
      report,
    });
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) {
      logger.error("[stagepilot-api] benchmark failed", error);
    } else {
      logger.warn("[stagepilot-api] benchmark rejected", httpError.message);
    }
    sendJson(response, httpError.statusCode, {
      error: httpError.message,
      ok: false,
    });
  }
}

async function handleInsightsRequest(options: {
  engine: StagePilotEngineLike;
  insightDeriver: InsightDeriver;
  logger: Pick<Console, "error" | "info" | "warn">;
  request: IncomingMessage;
  response: ServerResponse;
}) {
  const { logger, request, response } = options;
  try {
    const geminiTimeoutMs = readGeminiHttpTimeoutMs(
      process.env.GEMINI_HTTP_TIMEOUT_MS
    );
    const overrideApiKey =
      typeof request.headers["x-gemini-api-key"] === "string"
        ? request.headers["x-gemini-api-key"]
        : undefined;

    const engine = overrideApiKey
      ? createStagePilotEngine(
          overrideApiKey,
          process.env.GEMINI_MODEL,
          geminiTimeoutMs
        )
      : options.engine;

    const insightDeriver = overrideApiKey
      ? (result: StagePilotResult) =>
          deriveStagePilotInsights({
            apiKey: overrideApiKey,
            model: process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview",
            result,
            timeoutMs: geminiTimeoutMs,
          })
      : options.insightDeriver;

    const body = await readJsonBody(request);
    const intake = toIntakeInput(body);
    if (!intake) {
      sendJson(response, 400, {
        error:
          "invalid body. required: caseId, district, notes, risks(string[])",
        ok: false,
      });
      return;
    }

    const result = await engine.run(intake);
    const insights = await insightDeriver(result);
    sendJson(response, 200, {
      insights,
      ok: true,
      result,
    });
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) {
      logger.error("[stagepilot-api] insights failed", error);
    } else {
      logger.warn("[stagepilot-api] insights rejected", httpError.message);
    }
    sendJson(response, httpError.statusCode, {
      error: httpError.message,
      ok: false,
    });
  }
}

async function handleWhatIfRequest(options: {
  engine: StagePilotEngineLike;
  logger: Pick<Console, "error" | "info" | "warn">;
  request: IncomingMessage;
  response: ServerResponse;
  twinSimulator: TwinSimulator;
}) {
  const { engine, logger, request, response, twinSimulator } = options;
  try {
    const body = await readJsonBody(request);
    const intake = toIntakeInput(body);
    if (!intake) {
      sendJson(response, 400, {
        error:
          "invalid body. required: caseId, district, notes, risks(string[])",
        ok: false,
      });
      return;
    }

    const twinConfig = parseTwinConfig(body);
    if (twinConfig.error) {
      sendJson(response, 400, {
        error: twinConfig.error,
        ok: false,
      });
      return;
    }

    const result = await engine.run(intake);
    const twin = twinSimulator({
      profile: twinConfig.profile,
      result,
      scenario: twinConfig.scenario,
    });

    sendJson(response, 200, {
      ok: true,
      result,
      twin,
    });
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) {
      logger.error("[stagepilot-api] whatif failed", error);
    } else {
      logger.warn("[stagepilot-api] whatif rejected", httpError.message);
    }
    sendJson(response, httpError.statusCode, {
      error: httpError.message,
      ok: false,
    });
  }
}

async function handleNotifyRequest(options: {
  engine: StagePilotEngineLike;
  logger: Pick<Console, "error" | "info" | "warn">;
  openClawNotifier: StagePilotOpenClawNotifier;
  request: IncomingMessage;
  response: ServerResponse;
  twinSimulator: TwinSimulator;
}) {
  const { engine, logger, openClawNotifier, request, response, twinSimulator } =
    options;

  try {
    const body = await readJsonBody(request);
    const intake = toIntakeInput(body);
    if (!intake) {
      sendJson(response, 400, {
        error:
          "invalid body. required: caseId, district, notes, risks(string[])",
        ok: false,
      });
      return;
    }

    const twinConfig = parseTwinConfig(body);
    if (twinConfig.error) {
      sendJson(response, 400, {
        error: twinConfig.error,
        ok: false,
      });
      return;
    }

    const notifyConfig = parseNotifyConfig(body);
    if (notifyConfig.error) {
      sendJson(response, 400, {
        error: notifyConfig.error,
        ok: false,
      });
      return;
    }

    const result = await engine.run(intake);
    const twin =
      twinConfig.profile || twinConfig.scenario
        ? twinSimulator({
            profile: twinConfig.profile,
            result,
            scenario: twinConfig.scenario,
          })
        : undefined;
    const delivery = await openClawNotifier({
      dryRun: notifyConfig.options?.dryRun,
      message: notifyConfig.options?.message,
      result,
      target: notifyConfig.options?.target,
      twin,
    });

    sendJson(response, 200, {
      delivery,
      ok: true,
      result,
      twin,
    });
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) {
      logger.error("[stagepilot-api] notify failed", error);
    } else {
      logger.warn("[stagepilot-api] notify rejected", httpError.message);
    }
    sendJson(response, httpError.statusCode, {
      error: httpError.message,
      ok: false,
    });
  }
}

async function handleOpenClawInboxRequest(options: {
  engine: StagePilotEngineLike;
  insightDeriver: InsightDeriver;
  logger: Pick<Console, "error" | "info" | "warn">;
  openClawNotifier: StagePilotOpenClawNotifier;
  request: IncomingMessage;
  response: ServerResponse;
  twinSimulator: TwinSimulator;
}) {
  const {
    engine,
    insightDeriver,
    logger,
    openClawNotifier,
    request,
    response,
    twinSimulator,
  } = options;

  try {
    const body = await readJsonBody(request);
    const inboxConfig = parseInboxConfig(body);
    if (inboxConfig.error || !inboxConfig.options) {
      sendJson(response, 400, {
        error: inboxConfig.error ?? "invalid inbox request",
        ok: false,
      });
      return;
    }

    const notifyConfig = parseNotifyConfig(body);
    if (notifyConfig.error) {
      sendJson(response, 400, {
        error: notifyConfig.error,
        ok: false,
      });
      return;
    }

    const twinConfig = parseTwinConfig(body);
    if (twinConfig.error) {
      sendJson(response, 400, {
        error: twinConfig.error,
        ok: false,
      });
      return;
    }

    const intake = buildInboxIntake({
      body,
      promptText: inboxConfig.options.promptText,
    });
    const result = await engine.run(intake);

    let insights: StagePilotInsights | undefined;
    let twin: StagePilotTwinResult | undefined;

    if (inboxConfig.options.action === "insights") {
      insights = await insightDeriver(result);
    }

    if (inboxConfig.options.action === "whatif") {
      twin = twinSimulator({
        profile: twinConfig.profile,
        result,
        scenario: twinConfig.scenario,
      });
    }

    let delivery: Awaited<ReturnType<StagePilotOpenClawNotifier>> | undefined;
    if (inboxConfig.options.reply) {
      delivery = await openClawNotifier({
        dryRun: notifyConfig.options?.dryRun,
        message:
          notifyConfig.options?.message ??
          buildInboxReplyMessage({
            action: inboxConfig.options.action,
            insights,
            result,
            twin,
          }),
        result,
        target: notifyConfig.options?.target,
        twin,
      });
    }

    sendJson(response, 200, {
      action: inboxConfig.options.action,
      delivery,
      insights,
      ok: true,
      result,
      twin,
    });
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) {
      logger.error("[stagepilot-api] openclaw inbox failed", error);
    } else {
      logger.warn(
        "[stagepilot-api] openclaw inbox rejected",
        httpError.message
      );
    }
    sendJson(response, httpError.statusCode, {
      error: httpError.message,
      ok: false,
    });
  }
}

function handleReadonlyRequest(options: {
  method: string;
  pathname: string;
  rawUrl?: string;
  response: ServerResponse;
  telemetry: StagePilotRuntimeTelemetry;
}) {
  const { method, pathname, rawUrl, response, telemetry } = options;
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  const includeBody = method !== "HEAD";
  switch (pathname) {
    case "/demo":
      handleDemoRequest(response, { includeBody });
      return true;
    case "/health":
      handleHealthRequest(response, { includeBody });
      return true;
    case "/v1/meta":
      handleMetaRequest(response, { includeBody });
      return true;
    case "/v1/runtime-brief":
      handleRuntimeBriefRequest(response, { includeBody });
      return true;
    case "/v1/review-pack":
      handleReviewPackRequest(response, { includeBody });
      return true;
    case "/v1/runtime-scorecard":
      handleRuntimeScorecardRequest(response, telemetry, { includeBody });
      return true;
    case "/v1/benchmark-summary":
      handleBenchmarkSummaryReadonly(response, rawUrl, { includeBody });
      return true;
    case "/v1/developer-ops-pack":
      handleDeveloperOpsPackReadonly(response, rawUrl, { includeBody });
      return true;
    case "/v1/workflow-runs":
      handleWorkflowRunsReadonly(response, rawUrl, { includeBody });
      return true;
    case "/v1/schema/plan-report":
      handlePlanReportSchemaRequest(response, { includeBody });
      return true;
    default:
      if (pathname.startsWith("/v1/workflow-runs/")) {
        handleWorkflowRunDetailRequest(
          response,
          pathname.slice("/v1/workflow-runs/".length),
          {
            includeBody,
          }
        );
        return true;
      }
      return false;
  }
}

async function handlePostRequest(options: {
  benchmarkRunner: BenchmarkRunner;
  engine: StagePilotEngineLike;
  insightDeriver: InsightDeriver;
  logger: Pick<Console, "error" | "info" | "warn">;
  method: string;
  openClawNotifier: StagePilotOpenClawNotifier;
  pathname: string;
  request: StagePilotTrackedRequest;
  response: ServerResponse;
  twinSimulator: TwinSimulator;
}) {
  const {
    benchmarkRunner,
    engine,
    insightDeriver,
    logger,
    method,
    openClawNotifier,
    pathname,
    request,
    response,
    twinSimulator,
  } = options;

  if (method !== "POST") {
    return false;
  }

  switch (pathname) {
    case "/v1/auth/session":
      await handleOperatorSessionCreate({ logger, request, response });
      return true;
    case "/v1/plan":
      await handlePlanRequest({ engine, logger, request, response });
      return true;
    case "/v1/benchmark":
      await handleBenchmarkRequest({
        benchmarkRunner,
        logger,
        request,
        response,
      });
      return true;
    case "/v1/insights":
      await handleInsightsRequest({
        engine,
        insightDeriver,
        logger,
        request,
        response,
      });
      return true;
    case "/v1/whatif":
      await handleWhatIfRequest({
        engine,
        logger,
        request,
        response,
        twinSimulator,
      });
      return true;
    case "/v1/notify":
      await handleNotifyRequest({
        engine,
        logger,
        openClawNotifier,
        request,
        response,
        twinSimulator,
      });
      return true;
    case "/v1/openclaw/inbox":
      await handleOpenClawInboxRequest({
        engine,
        insightDeriver,
        logger,
        openClawNotifier,
        request,
        response,
        twinSimulator,
      });
      return true;
    default:
      return false;
  }
}

function handleDeleteRequest(options: {
  logger: Pick<Console, "error" | "info" | "warn">;
  method: string;
  pathname: string;
  request: StagePilotTrackedRequest;
  response: ServerResponse;
}) {
  const { logger, method, pathname, request, response } = options;
  if (method !== "DELETE") {
    return false;
  }
  if (pathname !== "/v1/auth/session") {
    return false;
  }
  handleOperatorSessionDelete({ logger, request, response });
  return true;
}

async function handleRequest(options: {
  benchmarkRunner: BenchmarkRunner;
  engine: StagePilotEngineLike;
  insightDeriver: InsightDeriver;
  logger: Pick<Console, "error" | "info" | "warn">;
  openClawNotifier: StagePilotOpenClawNotifier;
  request: StagePilotTrackedRequest;
  response: ServerResponse;
  telemetry: StagePilotRuntimeTelemetry;
  twinSimulator: TwinSimulator;
}) {
  const {
    benchmarkRunner,
    engine,
    insightDeriver,
    logger,
    openClawNotifier,
    request,
    response,
    telemetry,
    twinSimulator,
  } = options;
  const method = request.method ?? "GET";
  const { pathname } = parseRequestUrl(request.url);
  request.operatorSession = applyStagePilotOperatorSession(request);
  response.once("finish", () => {
    recordRuntimeTelemetry(telemetry, method, pathname, response.statusCode, {
      requestId: request.requestId,
    });
    logStagePilotEvent(
      logger,
      response.statusCode >= 400 ? "warn" : "info",
      "request-finished",
      {
        method,
        operatorAuthMode: request.operatorSession?.authMode || null,
        operatorRoles: request.operatorSession?.roles || [],
        path: pathname,
        requestId: request.requestId || null,
        sessionActive: Boolean(request.operatorSession),
        statusCode: response.statusCode,
      }
    );
  });

  request.requestId =
    typeof request.headers["x-request-id"] === "string" &&
    request.headers["x-request-id"].trim().length > 0
      ? request.headers["x-request-id"].trim()
      : nextStagePilotRequestId();
  response.setHeader("x-request-id", request.requestId);
  response.setHeader("cache-control", "no-store");

  if (
    (method === "GET" || method === "HEAD") &&
    pathname === "/v1/auth/session"
  ) {
    await handleOperatorSessionReadonly({
      includeBody: method !== "HEAD",
      request,
      response,
    });
    return;
  }

  if (
    handleReadonlyRequest({
      method,
      pathname,
      rawUrl: request.url,
      response,
      telemetry,
    })
  ) {
    return;
  }

  if (requiresStagePilotOperatorToken(method, pathname)) {
    const authResult = await validateStagePilotOperatorAccess(request);
    if (!authResult.ok) {
      sendJson(response, 403, {
        error:
          authResult.reason === "missing-role"
            ? "missing required operator role"
            : "missing or invalid operator credential",
        ok: false,
        path: pathname,
      });
      return;
    }
  }

  if (
    await handlePostRequest({
      benchmarkRunner,
      engine,
      insightDeriver,
      logger,
      method,
      openClawNotifier,
      pathname,
      request,
      response,
      twinSimulator,
    })
  ) {
    return;
  }

  if (
    handleDeleteRequest({
      logger,
      method,
      pathname,
      request,
      response,
    })
  ) {
    return;
  }

  sendJson(response, 404, {
    error: "not found",
    ok: false,
    path: pathname,
  });
}

export function createStagePilotApiServer(
  options: StagePilotApiServerOptions = {}
) {
  const geminiTimeoutMs = readGeminiHttpTimeoutMs(
    process.env.GEMINI_HTTP_TIMEOUT_MS
  );
  const engine: StagePilotEngineLike =
    options.engine ?? createStagePilotEngineFromEnv();
  const benchmarkRunner: BenchmarkRunner =
    options.benchmarkRunner ?? benchmarkStagePilotStrategies;
  const insightDeriver: InsightDeriver =
    options.insightDeriver ??
    ((result) =>
      deriveStagePilotInsights({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview",
        result,
        timeoutMs: geminiTimeoutMs,
      }));
  const openClawNotifier: StagePilotOpenClawNotifier =
    options.openClawNotifier ?? createStagePilotOpenClawNotifierFromEnv();
  const twinSimulator: TwinSimulator = simulateStagePilotTwin;
  const logger = options.logger ?? console;
  const telemetry = createRuntimeTelemetry();

  return createServer((request, response) => {
    const pending = handleRequest({
      benchmarkRunner,
      engine,
      insightDeriver,
      logger,
      openClawNotifier,
      request,
      response,
      telemetry,
      twinSimulator,
    });
    pending.catch((error) => {
      logger.error("[stagepilot-api] unhandled request error", error);
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: toErrorMessage(error),
          ok: false,
        });
      }
    });
  });
}
