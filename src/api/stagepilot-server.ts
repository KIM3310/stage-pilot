import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
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
  PROMETHEUS_CONTENT_TYPE,
  serializeMetrics,
} from "./prometheus-metrics";
import {
  appendStagePilotRuntimeEvent,
  buildStagePilotRuntimeStoreSummary,
  buildStagePilotWorkflowReplay,
  buildStagePilotWorkflowRunDetail,
  buildStagePilotWorkflowRunList,
} from "./runtime-store";
import { renderStagePilotDemoHtml } from "./stagepilot-demo";
import {
  buildStagePilotBenchmarkSummary,
  buildStagePilotDeveloperOpsPack,
  buildStagePilotFailureTaxonomy,
  buildStagePilotPerfEvidencePack,
  buildStagePilotPlanReportSchema,
  buildStagePilotProtocolMatrix,
  buildStagePilotProviderBenchmarkScorecard,
  buildStagePilotRegressionGatePack,
  buildStagePilotReviewResourcePack,
  buildStagePilotRouteDescriptors,
  buildStagePilotRuntimeBrief,
  buildStagePilotRuntimeScorecard,
  buildStagePilotSummaryPack,
  buildStagePilotTraceObservabilityPack,
  STAGEPILOT_LIVE_REVIEW_SCHEMA,
  type StagePilotRouteDescriptor,
} from "./stagepilot-service-meta";

const LINE_SPLIT_REGEX = /\r?\n/;

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
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_PUBLIC_DEFAULT_DAILY_BUDGET_USD = 4;
const OPENAI_PUBLIC_DEFAULT_MONTHLY_BUDGET_USD = 120;
const OPENAI_PUBLIC_DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_PUBLIC_DEFAULT_RPM = 6;
const OPENAI_PUBLIC_TIMEOUT_MS = 20_000;
const STAGEPILOT_REVIEW_ONLY_MODE_ENV_KEY = "STAGEPILOT_REVIEW_ONLY_MODE";

type StagePilotDeploymentMode =
  | "artifact-refresh-only"
  | "public-capped-live"
  | "review-only-live";

interface StagePilotLiveScenario {
  concern: string;
  estimatedCostUsd: number;
  failureMode: string;
  id: string;
  nextReviewPath: string;
  prompt: string;
  title: string;
  toolRegistry: string[];
}

interface StagePilotOpenAiConfig {
  apiKey: string;
  dailyBudgetUsd: number;
  killSwitch: boolean;
  modelPublic: string;
  modelRefresh: string;
  moderationEnabled: boolean;
  monthlyBudgetUsd: number;
  publicRpm: number;
}

const STAGEPILOT_LIVE_SCENARIOS: Record<string, StagePilotLiveScenario> = {
  "parser-drift-recovery": {
    id: "parser-drift-recovery",
    title: "Parser drift recovery",
    concern: "Tool-call output drifts out of schema under provider variation.",
    failureMode: "schema-drift",
    nextReviewPath: "/v1/failure-taxonomy",
    toolRegistry: ["lookup_household", "check_eligibility", "assign_referral"],
    estimatedCostUsd: 0.01,
    prompt:
      "A tool-calling runtime receives malformed structured output for check_eligibility after a provider-side format drift. Review whether bounded retry plus schema repair is enough, what should stay manual, and what evaluation evidence should be shown.",
  },
  "bounded-handoff-release": {
    id: "bounded-handoff-release",
    title: "Bounded handoff release",
    concern:
      "Runtime reliability is strong, but downstream delivery still needs explicit human confirmation.",
    failureMode: "handoff-boundary",
    nextReviewPath: "/v1/summary-pack",
    toolRegistry: ["build_plan_report", "score_risk", "notify_operator"],
    estimatedCostUsd: 0.012,
    prompt:
      "An evaluator wants to know if a high-confidence routing result should auto-notify downstream delivery. Explain the handoff boundary, the human approval point, and the runtime proof that should be checked before promotion.",
  },
};

const stagePilotLiveRateBuckets = new Map<
  string,
  { count: number; resetAt: number }
>();
let lastStagePilotLiveRunAt: string | null = null;

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

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "y" ||
    raw === "on"
  ) {
    return true;
  }
  if (
    raw === "0" ||
    raw === "false" ||
    raw === "no" ||
    raw === "n" ||
    raw === "off"
  ) {
    return false;
  }
  return fallback;
}

function readUsdEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(String(process.env[name] || ""));
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.round(parsed * 100) / 100);
}

function readStagePilotOpenAiConfig(): StagePilotOpenAiConfig {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  return {
    apiKey,
    modelPublic:
      String(process.env.OPENAI_MODEL_PUBLIC || "").trim() ||
      OPENAI_PUBLIC_DEFAULT_MODEL,
    modelRefresh:
      String(process.env.OPENAI_MODEL_REFRESH || "").trim() || "gpt-5.2",
    dailyBudgetUsd: readUsdEnv(
      "OPENAI_PUBLIC_DAILY_BUDGET_USD",
      OPENAI_PUBLIC_DEFAULT_DAILY_BUDGET_USD
    ),
    monthlyBudgetUsd: readUsdEnv(
      "OPENAI_PUBLIC_MONTHLY_BUDGET_USD",
      OPENAI_PUBLIC_DEFAULT_MONTHLY_BUDGET_USD
    ),
    publicRpm: readInteger(
      Number.parseInt(String(process.env.OPENAI_PUBLIC_RPM || ""), 10),
      {
        fallback: OPENAI_PUBLIC_DEFAULT_RPM,
        min: 1,
        max: 120,
      }
    ),
    killSwitch: readBooleanEnv("OPENAI_KILL_SWITCH", false),
    moderationEnabled: readBooleanEnv("OPENAI_MODERATION_ENABLED", true),
  };
}

function getStagePilotDeploymentMode(
  config: StagePilotOpenAiConfig
): StagePilotDeploymentMode {
  if (
    config.apiKey &&
    !config.killSwitch &&
    config.dailyBudgetUsd > 0 &&
    config.monthlyBudgetUsd > 0
  ) {
    return "public-capped-live";
  }
  return "review-only-live";
}

function isStagePilotReviewOnlyMode(): boolean {
  return readBooleanEnv(STAGEPILOT_REVIEW_ONLY_MODE_ENV_KEY, false);
}

function getStagePilotLiveRequestKey(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  let value: string | undefined;
  if (Array.isArray(forwarded)) {
    value = forwarded[0];
  } else if (typeof forwarded === "string") {
    value = forwarded.split(",")[0];
  } else {
    value = request.socket.remoteAddress;
  }
  return String(value || "anonymous").trim() || "anonymous";
}

function mapStagePilotTraceHotspot(item: Record<string, unknown>) {
  return {
    attentionCount:
      typeof item.attentionCount === "number" ? item.attentionCount : 0,
    providerFamily:
      typeof item.providerFamily === "string" ? item.providerFamily : "unknown",
    risk: typeof item.risk === "string" ? item.risk : "unknown",
  };
}

function mapStagePilotTraceRecord(item: Record<string, unknown>) {
  return {
    durationMs: typeof item.durationMs === "number" ? item.durationMs : null,
    failureClass:
      typeof item.failureClass === "string" ? item.failureClass : "unknown",
    operatorHandoff:
      typeof item.operatorHandoff === "string"
        ? item.operatorHandoff
        : "review required",
    protocolFamily:
      typeof item.protocolFamily === "string" ? item.protocolFamily : "unknown",
    providerFamily:
      typeof item.providerFamily === "string" ? item.providerFamily : "unknown",
    regressionGate:
      typeof item.regressionGate === "string" ? item.regressionGate : "watch",
    dashboardSurface:
      typeof item.dashboardSurface === "string"
        ? item.dashboardSurface
        : "/v1/summary-pack",
    scenario:
      typeof item.scenario === "string"
        ? item.scenario
        : "unspecified scenario",
    traceId: typeof item.traceId === "string" ? item.traceId : randomUUID(),
  };
}

function mapStagePilotRegressionGate(item: Record<string, unknown>) {
  return {
    decision: typeof item.decision === "string" ? item.decision : "watch",
    focus: typeof item.focus === "string" ? item.focus : "unknown",
    gate: typeof item.gate === "string" ? item.gate : "unknown",
    owner: typeof item.owner === "string" ? item.owner : "runtime",
    signal:
      typeof item.signal === "string" ? item.signal : "No signal recorded.",
  };
}

function enforceStagePilotLiveRateLimit(
  request: IncomingMessage,
  rpm: number
): void {
  const key = getStagePilotLiveRequestKey(request);
  const now = Date.now();
  const bucket = stagePilotLiveRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    stagePilotLiveRateBuckets.set(key, {
      count: 1,
      resetAt: now + 60_000,
    });
    return;
  }
  if (bucket.count >= rpm) {
    throw new HttpError(429, "public live evaluation rate limit exceeded");
  }
  bucket.count += 1;
}

async function callOpenAiModeration(options: {
  apiKey: string;
  input: string;
}): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    OPENAI_PUBLIC_TIMEOUT_MS
  );
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/moderations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        input: options.input,
        model: "omni-moderation-latest",
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim();
      throw new HttpError(
        502,
        `moderation request failed${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
    }
    const payload = (await response.json().catch(() => ({}))) as {
      results?: Array<{ flagged?: boolean }>;
    };
    if (payload.results?.[0]?.flagged) {
      throw new HttpError(
        400,
        "scenario content failed moderation and was not sent to the public live model"
      );
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "moderation request timed out");
    }
    throw new HttpError(502, toErrorMessage(error));
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAiStructuredJson(options: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    OPENAI_PUBLIC_TIMEOUT_MS
  );
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim();
      throw new HttpError(
        502,
        `OpenAI request failed${detail ? `: ${detail.slice(0, 240)}` : ""}`
      );
    }
    const payload = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = String(payload.choices?.[0]?.message?.content || "").trim();
    if (!content) {
      throw new HttpError(
        502,
        "OpenAI response did not include message content"
      );
    }
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new HttpError(502, "OpenAI response did not return valid JSON");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "OpenAI request timed out");
    }
    throw new HttpError(502, toErrorMessage(error));
  } finally {
    clearTimeout(timeoutId);
  }
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
  const openAi = readStagePilotOpenAiConfig();
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
    dailyBudgetUsd: openAi.dailyBudgetUsd,
    deploymentMode: getStagePilotDeploymentMode(openAi),
    geminiHasApiKey,
    geminiTimeoutMs,
    killSwitch: openAi.killSwitch,
    lastLiveRunAt: lastStagePilotLiveRunAt,
    liveModel: openAi.modelPublic,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    moderationEnabled: openAi.moderationEnabled,
    monthlyBudgetUsd: openAi.monthlyBudgetUsd,
    openClawConfigured,
    openClawHasWebhookUrl: Boolean(
      toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)
    ),
    publicLiveApi: Boolean(openAi.apiKey) && !openAi.killSwitch,
    service,
  });

  let nextAction: string;
  if (runtimeBrief.publicLiveApi) {
    nextAction =
      "Run POST /v1/live-review-run with a fixed scenarioId to validate the bounded evaluation lane.";
  } else if (missingIntegrations.length === 0) {
    nextAction =
      "Run POST /v1/plan or POST /v1/benchmark to validate live flows.";
  } else {
    nextAction = `Configure ${missingIntegrations[0]} to unlock live planning diagnostics.`;
  }

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
      liveReviewRun: true,
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
    openai: {
      dailyBudgetUsd: openAi.dailyBudgetUsd,
      deploymentMode: runtimeBrief.deploymentMode,
      killSwitch: openAi.killSwitch,
      lastLiveRunAt: lastStagePilotLiveRunAt,
      liveModel: openAi.modelPublic,
      moderationEnabled: openAi.moderationEnabled,
      monthlyBudgetUsd: openAi.monthlyBudgetUsd,
      publicLiveApi: runtimeBrief.publicLiveApi,
      refreshModel: openAi.modelRefresh,
      rpm: openAi.publicRpm,
    },
    ok: true,
    diagnostics: {
      integrationReady: missingIntegrations.length === 0,
      missingIntegrations,
      nextAction,
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
  const openAi = readStagePilotOpenAiConfig();
  const meta = buildMetaPayload();
  const service =
    typeof meta.service === "string" ? meta.service : "stagepilot-api";
  return buildStagePilotRuntimeBrief({
    bodyTimeoutMs: readBodyTimeoutMs(
      process.env.STAGEPILOT_REQUEST_BODY_TIMEOUT_MS
    ),
    dailyBudgetUsd: openAi.dailyBudgetUsd,
    deploymentMode: getStagePilotDeploymentMode(openAi),
    geminiHasApiKey:
      typeof process.env.GEMINI_API_KEY === "string" &&
      process.env.GEMINI_API_KEY.trim().length > 0,
    geminiTimeoutMs: readGeminiHttpTimeoutMs(
      process.env.GEMINI_HTTP_TIMEOUT_MS
    ),
    killSwitch: openAi.killSwitch,
    lastLiveRunAt: lastStagePilotLiveRunAt,
    liveModel: openAi.modelPublic,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    moderationEnabled: openAi.moderationEnabled,
    monthlyBudgetUsd: openAi.monthlyBudgetUsd,
    openClawConfigured:
      Boolean(toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)) ||
      Boolean(toNonEmptyString(process.env.OPENCLAW_CMD)),
    openClawHasWebhookUrl: Boolean(
      toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)
    ),
    publicLiveApi: Boolean(openAi.apiKey) && !openAi.killSwitch,
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

function readStagePilotPerfEvidenceArtifact() {
  const fallback = {
    baseUrl: "http://127.0.0.1:8788",
    environment: "local-review-harness",
    generatedAt: null,
    observed: {
      avgDurationMs: null,
      checksPassRatePct: null,
      httpReqFailedRatePct: null,
      maxDurationMs: null,
      p95DurationMs: null,
      requestCount: null,
      routeMix: [] as Array<{ path: string; sharePct: number }>,
    },
    scenario: {
      executor: "shared-iterations",
      iterations: null,
      maxDuration: "60s",
      vus: null,
    },
    thresholds: {
      httpReqDurationP95: "p(95)<3000",
      httpReqFailed: "rate<0.05",
    },
    tool: "k6",
  };

  try {
    const payload = JSON.parse(
      readFileSync(
        new URL(
          "../../docs/benchmarks/stagepilot-runtime-load-latest.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as {
      baseUrl?: unknown;
      environment?: unknown;
      generatedAt?: unknown;
      observed?: Record<string, unknown>;
      scenario?: Record<string, unknown>;
      thresholds?: Record<string, unknown>;
      tool?: unknown;
    };

    return {
      baseUrl:
        typeof payload.baseUrl === "string"
          ? payload.baseUrl
          : fallback.baseUrl,
      environment:
        typeof payload.environment === "string"
          ? payload.environment
          : fallback.environment,
      generatedAt:
        typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      observed: {
        avgDurationMs:
          typeof payload.observed?.avgDurationMs === "number"
            ? payload.observed.avgDurationMs
            : null,
        checksPassRatePct:
          typeof payload.observed?.checksPassRatePct === "number"
            ? payload.observed.checksPassRatePct
            : null,
        httpReqFailedRatePct:
          typeof payload.observed?.httpReqFailedRatePct === "number"
            ? payload.observed.httpReqFailedRatePct
            : null,
        maxDurationMs:
          typeof payload.observed?.maxDurationMs === "number"
            ? payload.observed.maxDurationMs
            : null,
        p95DurationMs:
          typeof payload.observed?.p95DurationMs === "number"
            ? payload.observed.p95DurationMs
            : null,
        requestCount:
          typeof payload.observed?.requestCount === "number"
            ? payload.observed.requestCount
            : null,
        routeMix: Array.isArray(payload.observed?.routeMix)
          ? payload.observed.routeMix
              .map((item) => {
                const record =
                  item && typeof item === "object"
                    ? (item as Record<string, unknown>)
                    : null;
                return {
                  path: typeof record?.path === "string" ? record.path : "",
                  sharePct:
                    typeof record?.sharePct === "number" ? record.sharePct : -1,
                };
              })
              .filter((item) => item.path.length > 0 && item.sharePct >= 0)
          : fallback.observed.routeMix,
      },
      scenario: {
        executor:
          typeof payload.scenario?.executor === "string"
            ? payload.scenario.executor
            : fallback.scenario.executor,
        iterations:
          typeof payload.scenario?.iterations === "number"
            ? payload.scenario.iterations
            : null,
        maxDuration:
          typeof payload.scenario?.maxDuration === "string"
            ? payload.scenario.maxDuration
            : fallback.scenario.maxDuration,
        vus:
          typeof payload.scenario?.vus === "number"
            ? payload.scenario.vus
            : null,
      },
      thresholds: {
        httpReqDurationP95:
          typeof payload.thresholds?.httpReqDurationP95 === "string"
            ? payload.thresholds.httpReqDurationP95
            : fallback.thresholds.httpReqDurationP95,
        httpReqFailed:
          typeof payload.thresholds?.httpReqFailed === "string"
            ? payload.thresholds.httpReqFailed
            : fallback.thresholds.httpReqFailed,
      },
      tool: typeof payload.tool === "string" ? payload.tool : fallback.tool,
    };
  } catch {
    return fallback;
  }
}

function readStagePilotTraceObservabilityArtifact() {
  const fallback = {
    generatedAt: null,
    hotspots: [] as Array<{
      attentionCount: number;
      providerFamily: string;
      risk: string;
    }>,
    regressionGate: {
      failCount: null,
      gate: "unknown",
      passCount: null,
      rule: "No checked-in trace artifact found.",
      watchCount: null,
    },
    evaluationTier: "bounded-review-demo",
    tool: "checked-in frontier trace bundle",
    traces: [] as Array<{
      durationMs: number | null;
      failureClass: string;
      operatorHandoff: string;
      protocolFamily: string;
      providerFamily: string;
      regressionGate: string;
      dashboardSurface: string;
      scenario: string;
      traceId: string;
    }>,
  };

  try {
    const payload = JSON.parse(
      readFileSync(
        new URL(
          "../../docs/benchmarks/stagepilot-trace-observability-latest.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as {
      generatedAt?: unknown;
      hotspots?: Record<string, unknown>[];
      regressionGate?: Record<string, unknown>;
      evaluationTier?: unknown;
      tool?: unknown;
      traces?: Record<string, unknown>[];
    };

    return {
      generatedAt:
        typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      hotspots: Array.isArray(payload.hotspots)
        ? payload.hotspots.map(mapStagePilotTraceHotspot)
        : fallback.hotspots,
      regressionGate: {
        failCount:
          typeof payload.regressionGate?.failCount === "number"
            ? payload.regressionGate.failCount
            : null,
        gate:
          typeof payload.regressionGate?.gate === "string"
            ? payload.regressionGate.gate
            : fallback.regressionGate.gate,
        passCount:
          typeof payload.regressionGate?.passCount === "number"
            ? payload.regressionGate.passCount
            : null,
        rule:
          typeof payload.regressionGate?.rule === "string"
            ? payload.regressionGate.rule
            : fallback.regressionGate.rule,
        watchCount:
          typeof payload.regressionGate?.watchCount === "number"
            ? payload.regressionGate.watchCount
            : null,
      },
      evaluationTier:
        typeof payload.evaluationTier === "string"
          ? payload.evaluationTier
          : fallback.evaluationTier,
      tool: typeof payload.tool === "string" ? payload.tool : fallback.tool,
      traces: Array.isArray(payload.traces)
        ? payload.traces.map(mapStagePilotTraceRecord)
        : fallback.traces,
    };
  } catch {
    return fallback;
  }
}

function readStagePilotRegressionGateArtifact() {
  const fallback = {
    generatedAt: null,
    gates: [] as {
      decision: string;
      focus: string;
      gate: string;
      owner: string;
      signal: string;
    }[],
    releaseRecommendation: {
      nextStep: "No checked-in regression gate artifact found.",
      posture: "unknown",
      summary: "No regression gate posture available.",
    },
    scoreSummary: {
      failCount: null,
      passCount: null,
      watchCount: null,
    },
    tool: "checked-in regression gate board",
  };

  try {
    const payload = JSON.parse(
      readFileSync(
        new URL(
          "../../docs/benchmarks/stagepilot-regression-gate-latest.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as {
      generatedAt?: unknown;
      gates?: Record<string, unknown>[];
      releaseRecommendation?: Record<string, unknown>;
      scoreSummary?: Record<string, unknown>;
      tool?: unknown;
    };

    return {
      generatedAt:
        typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      gates: Array.isArray(payload.gates)
        ? payload.gates.map(mapStagePilotRegressionGate)
        : fallback.gates,
      releaseRecommendation: {
        nextStep:
          typeof payload.releaseRecommendation?.nextStep === "string"
            ? payload.releaseRecommendation.nextStep
            : fallback.releaseRecommendation.nextStep,
        posture:
          typeof payload.releaseRecommendation?.posture === "string"
            ? payload.releaseRecommendation.posture
            : fallback.releaseRecommendation.posture,
        summary:
          typeof payload.releaseRecommendation?.summary === "string"
            ? payload.releaseRecommendation.summary
            : fallback.releaseRecommendation.summary,
      },
      scoreSummary: {
        failCount:
          typeof payload.scoreSummary?.failCount === "number"
            ? payload.scoreSummary.failCount
            : null,
        passCount:
          typeof payload.scoreSummary?.passCount === "number"
            ? payload.scoreSummary.passCount
            : null,
        watchCount:
          typeof payload.scoreSummary?.watchCount === "number"
            ? payload.scoreSummary.watchCount
            : null,
      },
      tool: typeof payload.tool === "string" ? payload.tool : fallback.tool,
    };
  } catch {
    return fallback;
  }
}

function buildSummaryPackPayload(): JsonObject {
  const runtimeBrief = buildRuntimeBriefPayload() as ReturnType<
    typeof buildStagePilotRuntimeBrief
  >;

  return buildStagePilotSummaryPack({
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

function buildReviewResourcePackPayload(): JsonObject {
  const payload = buildStagePilotReviewResourcePack({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
  });
  const externalDir = resolve(
    process.cwd(),
    "data",
    "external",
    "incident_prompt_pack"
  );
  const incidentSummaryPath = resolve(externalDir, "Incident_response.txt");
  const supportCsvPath = resolve(externalDir, "customer_support_tickets.csv");
  return {
    ...payload,
    externalData: {
      present: existsSync(externalDir),
      files: {
        incidentSummary: {
          path: "data/external/incident_prompt_pack/Incident_response.txt",
          present: existsSync(incidentSummaryPath),
          sizeBytes: existsSync(incidentSummaryPath)
            ? statSync(incidentSummaryPath).size
            : 0,
          preview: previewTextLines(incidentSummaryPath, 3),
        },
        supportTickets: {
          path: "data/external/incident_prompt_pack/customer_support_tickets.csv",
          present: existsSync(supportCsvPath),
          sizeBytes: existsSync(supportCsvPath)
            ? statSync(supportCsvPath).size
            : 0,
          rowCount: countCsvRows(supportCsvPath),
          preview: previewCsvRows(supportCsvPath, 2),
        },
      },
    },
  };
}

function countCsvRows(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0;
  }
  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return 0;
  }
  return Math.max(0, raw.split(LINE_SPLIT_REGEX).length - 1);
}

function previewCsvRows(
  filePath: string,
  limit: number
): Record<string, string>[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const [header, ...rows] = readFileSync(filePath, "utf8")
    .split(LINE_SPLIT_REGEX)
    .filter((line) => line.trim().length > 0);
  if (!header) {
    return [];
  }
  const columns = header.split(",");
  return rows.slice(0, limit).map((row) => {
    const values = row.split(",");
    return Object.fromEntries(
      columns.map((column, index) => [column, values[index] ?? ""])
    );
  });
}

function previewTextLines(filePath: string, limit: number): string[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split(LINE_SPLIT_REGEX)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, limit);
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

function buildProtocolMatrixPayload(): JsonObject {
  return buildStagePilotProtocolMatrix({
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
  });
}

function buildProviderBenchmarkScorecardPayload(): JsonObject {
  return buildStagePilotProviderBenchmarkScorecard({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
  });
}

function buildPerfEvidencePackPayload(): JsonObject {
  return buildStagePilotPerfEvidencePack({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    perfArtifact: readStagePilotPerfEvidenceArtifact(),
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
  });
}

function buildTraceObservabilityPackPayload(): JsonObject {
  return buildStagePilotTraceObservabilityPack({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
    traceArtifact: readStagePilotTraceObservabilityArtifact(),
  });
}

function buildRegressionGatePackPayload(): JsonObject {
  return buildStagePilotRegressionGatePack({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    regressionArtifact: readStagePilotRegressionGateArtifact(),
    service: process.env.SERVICE_NAME_API ?? "stagepilot-api",
  });
}

function buildFailureTaxonomyPayload(
  telemetry: StagePilotRuntimeTelemetry
): JsonObject {
  return buildStagePilotFailureTaxonomy({
    benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
    geminiHasApiKey:
      typeof process.env.GEMINI_API_KEY === "string" &&
      process.env.GEMINI_API_KEY.trim().length > 0,
    openClawConfigured:
      Boolean(toNonEmptyString(process.env.OPENCLAW_WEBHOOK_URL)) ||
      Boolean(toNonEmptyString(process.env.OPENCLAW_CMD)),
    runtimeTelemetry: {
      errorCount: telemetry.errorCount,
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

function handlePrometheusMetricsRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  const body = serializeMetrics();
  response.writeHead(200, {
    "Content-Type": PROMETHEUS_CONTENT_TYPE,
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  if (options?.includeBody !== false) {
    response.end(body);
  } else {
    response.end();
  }
}

function handleRuntimeBriefRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  sendJson(response, 200, buildRuntimeBriefPayload(), options);
}

function readStagePilotLiveScenario(body: unknown): StagePilotLiveScenario {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const scenarioId = String(record.scenarioId || "")
    .trim()
    .toLowerCase();
  const scenario = STAGEPILOT_LIVE_SCENARIOS[scenarioId];
  if (!scenario) {
    throw new HttpError(
      400,
      "scenarioId must be one of parser-drift-recovery or bounded-handoff-release"
    );
  }
  return scenario;
}

async function handleLiveReviewRunRequest(options: {
  logger: Pick<Console, "error" | "info" | "warn">;
  request: StagePilotTrackedRequest;
  response: ServerResponse;
}) {
  const { logger, request, response } = options;
  const openAi = readStagePilotOpenAiConfig();
  if (
    !openAi.apiKey ||
    openAi.killSwitch ||
    openAi.dailyBudgetUsd <= 0 ||
    openAi.monthlyBudgetUsd <= 0
  ) {
    sendJson(response, 503, {
      error:
        "public OpenAI live review is unavailable; configure OPENAI_API_KEY and keep budgets above zero.",
      ok: false,
      schema: STAGEPILOT_LIVE_REVIEW_SCHEMA,
    });
    return;
  }

  try {
    enforceStagePilotLiveRateLimit(request, openAi.publicRpm);
    const scenario = readStagePilotLiveScenario(
      await readJsonBody(request, DEFAULT_BODY_LIMIT_BYTES)
    );
    if (openAi.moderationEnabled) {
      await callOpenAiModeration({
        apiKey: openAi.apiKey,
        input: scenario.prompt,
      });
    }
    const runtimeBrief = buildRuntimeBriefPayload();
    const result = await callOpenAiStructuredJson({
      apiKey: openAi.apiKey,
      model: openAi.modelPublic,
      systemPrompt:
        "You are evaluating a public bounded tool-calling runtime. Return compact JSON only with keys summary, selectedStrategy, boundedRecovery, watchouts, handoffDecision, evaluationEvidence.",
      userPrompt: JSON.stringify(
        {
          benchmarkSnapshot: readStagePilotBenchmarkSnapshot(),
          links: (runtimeBrief as { links?: unknown }).links,
          scenario,
        },
        null,
        2
      ),
    });
    lastStagePilotLiveRunAt = new Date().toISOString();
    sendJson(response, 200, {
      ok: true,
      schema: STAGEPILOT_LIVE_REVIEW_SCHEMA,
      mode: getStagePilotDeploymentMode(openAi),
      model: openAi.modelPublic,
      scenarioId: scenario.id,
      moderated: true,
      capped: true,
      traceId: request.requestId,
      estimatedCostUsd: scenario.estimatedCostUsd,
      nextReviewPath: scenario.nextReviewPath,
      result: {
        title: scenario.title,
        concern: scenario.concern,
        failureMode: scenario.failureMode,
        toolRegistry: scenario.toolRegistry,
        ...result,
      },
    });
  } catch (error) {
    const httpError = toHttpError(error);
    logStagePilotEvent(
      logger,
      httpError.statusCode >= 500 ? "error" : "warn",
      "live-review-run-failed",
      {
        error: httpError.message,
        requestId: request.requestId ?? null,
        statusCode: httpError.statusCode,
      }
    );
    sendJson(response, httpError.statusCode, {
      error: httpError.message,
      ok: false,
      schema: STAGEPILOT_LIVE_REVIEW_SCHEMA,
    });
  }
}

function handlePlanReportSchemaRequest(
  response: ServerResponse,
  options?: { includeBody?: boolean }
) {
  sendJson(response, 200, buildPlanReportSchemaPayload(), options);
}

function handleSummaryPackRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildSummaryPackPayload(), options);
}

function handleReviewResourcePackRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildReviewResourcePackPayload(), options);
}

function handleFailureTaxonomyRequest(
  response: ServerResponse,
  telemetry: StagePilotRuntimeTelemetry,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildFailureTaxonomyPayload(telemetry), options);
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

function handleProtocolMatrixRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildProtocolMatrixPayload(), options);
}

function handleProviderBenchmarkScorecardRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildProviderBenchmarkScorecardPayload(), options);
}

function handlePerfEvidencePackRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildPerfEvidencePackPayload(), options);
}

function handleTraceObservabilityPackRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildTraceObservabilityPackPayload(), options);
}

function handleRegressionGatePackRequest(
  response: ServerResponse,
  options?: {
    includeBody?: boolean;
  }
) {
  sendJson(response, 200, buildRegressionGatePackPayload(), options);
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

function handleWorkflowReplayReadonly(
  response: ServerResponse,
  rawUrl: string | undefined,
  options: { includeBody?: boolean }
) {
  const parsed = new URL(rawUrl ?? "/", "http://127.0.0.1");
  const rawLane = parsed.searchParams.get("lane");
  const rawLimit = parsed.searchParams.get("limit");
  const lane =
    rawLane === "merge-request" ||
    rawLane === "pipeline-recovery" ||
    rawLane === "release-governor"
      ? rawLane
      : undefined;
  const limit =
    rawLimit == null || rawLimit.trim().length === 0
      ? undefined
      : Number.parseInt(rawLimit, 10);
  sendJson(
    response,
    200,
    buildStagePilotWorkflowReplay({
      lane,
      limit,
    }),
    options
  );
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
    case "/v1/summary-pack":
      handleSummaryPackRequest(response, { includeBody });
      return true;
    case "/v1/review-resource-pack":
      handleReviewResourcePackRequest(response, { includeBody });
      return true;
    case "/v1/runtime-scorecard":
      handleRuntimeScorecardRequest(response, telemetry, { includeBody });
      return true;
    case "/v1/failure-taxonomy":
      handleFailureTaxonomyRequest(response, telemetry, { includeBody });
      return true;
    case "/v1/protocol-matrix":
      handleProtocolMatrixRequest(response, { includeBody });
      return true;
    case "/v1/provider-benchmark-scorecard":
      handleProviderBenchmarkScorecardRequest(response, { includeBody });
      return true;
    case "/v1/perf-evidence-pack":
      handlePerfEvidencePackRequest(response, { includeBody });
      return true;
    case "/v1/trace-observability-pack":
      handleTraceObservabilityPackRequest(response, { includeBody });
      return true;
    case "/v1/regression-gate-pack":
      handleRegressionGatePackRequest(response, { includeBody });
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
    case "/v1/workflow-run-replay":
      handleWorkflowReplayReadonly(response, rawUrl, { includeBody });
      return true;
    case "/v1/schema/plan-report":
      handlePlanReportSchemaRequest(response, { includeBody });
      return true;
    case "/v1/metrics":
      handlePrometheusMetricsRequest(response, { includeBody });
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

  if (isStagePilotReviewOnlyMode() && pathname !== "/v1/live-review-run") {
    sendJson(response, 403, {
      error:
        "review-only mode keeps public mutation routes disabled; use POST /v1/live-review-run instead.",
      ok: false,
      path: pathname,
    });
    return true;
  }

  switch (pathname) {
    case "/v1/live-review-run":
      await handleLiveReviewRunRequest({ logger, request, response });
      return true;
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
