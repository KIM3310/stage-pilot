import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { renderBenchLabDemoHtml } from "./benchlab-demo";

type Logger = Pick<Console, "error" | "info" | "warn">;

interface JsonObject {
  [key: string]: unknown;
}

type BenchLabJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

interface BenchLabJobRecord {
  command: string[];
  createdAt: string;
  endedAt: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  id: string;
  kill: ((signal?: NodeJS.Signals) => void) | null;
  mode: "benchmark" | "preflight";
  modelsFileName: string;
  modelsFilePath: string;
  pid: number | null;
  runtimeName: string;
  runtimeRoot: string;
  startedAt: string | null;
  status: BenchLabJobStatus;
  stderrPath: string;
  stdoutPath: string;
}

interface BenchLabJobRequest {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  stderrPath: string;
  stdoutPath: string;
}

interface BenchLabLaunchedJob {
  completion: Promise<number>;
  kill: (signal?: NodeJS.Signals) => void;
  pid: number | null;
}

type BenchLabJobLauncher = (request: BenchLabJobRequest) => BenchLabLaunchedJob;

export interface BenchLabApiServerOptions {
  benchmarkRoot?: string;
  jobLauncher?: BenchLabJobLauncher;
  logger?: Logger;
  pythonExecutable?: string;
  repoRoot?: string;
}

interface BenchLabConfigDescriptor {
  isRecommended: boolean;
  name: string;
  path: string;
}

interface BenchLabRuntimeSummary {
  casesPerCategory: number | null;
  categories: string[];
  counts: Record<string, number>;
  modelsFileName: string | null;
  name: string;
  preflightOnly: boolean | null;
  primaryOutcome: string;
  reportMarkdown: string | null;
  runtimeRoot: string;
  updatedAt: string | null;
}

interface BenchLabRuntimeModelSummary {
  baselineScore: number | null;
  casesPerCategory: number | null;
  categories: string[];
  deltaPp: number | null;
  executionPhase: string | null;
  modelName: string | null;
  name: string;
  outcome: BenchLabArtifactOutcome;
  progressCurrent: number | null;
  progressPercent: number | null;
  progressTotal: number | null;
  providerName: string | null;
  ralphScore: number | null;
  relativeDeltaPercent: number | null;
  reportRelativePath: string | null;
  runtimeName: string;
  runtimeRoot: string;
  status: "completed" | "pending" | "running";
  summaryRelativePath: string | null;
  updatedAt: string | null;
}

interface BenchLabForensicsBucketSummary {
  baselineCount: number;
  bucket: string;
  deltaCount: number;
  ralphCount: number;
  sampleIds: string[];
}

interface BenchLabForensicsModelSummary {
  baselineErrorItems: number;
  baselineErrorRatePercent: number;
  baselineTotalItems: number;
  buckets: BenchLabForensicsBucketSummary[];
  deltaErrorItems: number;
  dominantBucket: string | null;
  modelName: string | null;
  name: string;
  outcome: BenchLabArtifactOutcome;
  providerName: string | null;
  ralphErrorItems: number;
  ralphErrorRatePercent: number;
  ralphTotalItems: number;
  runtimeName: string;
}

interface BenchLabRuntimeRecordSummary {
  casesPerCategory: number | null;
  categories: string[];
  endedAtUtc: string | null;
  errorMessage: string | null;
  id: string;
  kind: string | null;
  label: string | null;
  modelName: string | null;
  outcome: string;
  overallBaseline: number | null;
  overallDeltaPp: number | null;
  overallRalph: number | null;
  overallRelativeDeltaPercent: number | null;
  providerName: string | null;
  ralphVariant: string | null;
  runtimeName: string;
  runtimeRoot: string;
  salvaged: boolean;
  startedAtUtc: string | null;
  status: string;
  updatedAt: string | null;
}

interface BenchLabRuntimeForensicsSummary {
  baselineErrorItems: number;
  baselineErrorRatePercent: number;
  baselineTotalItems: number;
  buckets: BenchLabForensicsBucketSummary[];
  modelRuns: BenchLabForensicsModelSummary[];
  modelsWithErrors: number;
  modelsWithImprovedErrors: number;
  modelsWithRegressedErrors: number;
  ralphErrorItems: number;
  ralphErrorRatePercent: number;
  ralphTotalItems: number;
  runtimeName: string;
  updatedAt: string | null;
}

interface BenchLabSuggestedModelEntry {
  id: string;
  kind: string | null;
  model_name: string;
  provider_name: string | null;
  ralph_variant: string;
}

interface BenchLabVariantLeaderboardEntry {
  avgDeltaPp: number;
  bestDeltaPp: number;
  id: string;
  improvedCount: number;
  lastSeenAt: string | null;
  modelKey: string;
  modelsCount: number;
  runsCount: number;
  successRatePercent: number;
  variant: string;
  worstDeltaPp: number;
}

interface BenchLabVariantRecommendation {
  bestCasesPerCategory: number | null;
  bestDeltaPp: number | null;
  bestVariant: string | null;
  dominantBucket: string | null;
  kind: string | null;
  modelName: string | null;
  nextVariantsToTry: string[];
  providerName: string | null;
  recommendedCasesPerCategory: number;
  stage: string;
  suggestedModelEntry: BenchLabSuggestedModelEntry | null;
  testedVariants: string[];
}

type BenchLabArtifactOutcome = "improved" | "flat" | "regressed" | "unknown";

interface BenchLabArtifactSummary {
  artifactRoot: string;
  baselineScore: number | null;
  casesPerCategory: number | null;
  categories: string[];
  chartRelativePath: string | null;
  claimName: string;
  deltaPp: number | null;
  errorForensicsRelativePath: string | null;
  experimentName: string;
  id: string;
  modelName: string | null;
  outcome: BenchLabArtifactOutcome;
  providerName: string | null;
  ralphScore: number | null;
  relativeDeltaPercent: number | null;
  reportRelativePath: string | null;
  summaryRelativePath: string;
  updatedAt: string | null;
}

interface BenchLabParsedForensicsSummary {
  baselineErrorItems: number;
  baselineErrorRatePercent: number;
  baselineTotalItems: number;
  buckets: BenchLabForensicsBucketSummary[];
  dominantBucket: string | null;
  hasErrorBuckets: boolean;
  ralphErrorItems: number;
  ralphErrorRatePercent: number;
  ralphTotalItems: number;
}

type BenchLabArtifactForensicsGapType =
  | "missing_forensics_file"
  | "no_error_buckets";

interface BenchLabArtifactForensicsClaimSummary {
  artifactId: string;
  baselineErrorItems: number;
  baselineErrorRatePercent: number;
  baselineTotalItems: number;
  buckets: BenchLabForensicsBucketSummary[];
  claimName: string;
  deltaErrorItems: number;
  deltaPp: number | null;
  dominantBucket: string | null;
  experimentName: string;
  hasErrorBuckets: boolean;
  hasForensicsFile: boolean;
  modelName: string | null;
  outcome: BenchLabArtifactOutcome;
  providerName: string | null;
  ralphErrorItems: number;
  ralphErrorRatePercent: number;
  ralphTotalItems: number;
  updatedAt: string | null;
}

interface BenchLabArtifactForensicsGapSummary {
  artifactId: string;
  claimName: string;
  experimentName: string;
  gap: BenchLabArtifactForensicsGapType;
  modelName: string | null;
  providerName: string | null;
  updatedAt: string | null;
}

interface BenchLabArtifactForensicsOverviewSummary {
  artifacts: number;
  artifactsWithErrorBuckets: number;
  artifactsWithForensicsFile: number;
  artifactsWithTrackedErrors: number;
  baselineErrorItems: number;
  baselineErrorRatePercent: number;
  baselineTotalItems: number;
  dominantBucket: string | null;
  flatArtifacts: number;
  flatErrorArtifacts: number;
  improvedArtifacts: number;
  improvedErrorArtifacts: number;
  ralphErrorItems: number;
  ralphErrorRatePercent: number;
  ralphTotalItems: number;
  regressedArtifacts: number;
  regressedErrorArtifacts: number;
}

const HTML_CONTENT_TYPE = "text/html; charset=utf-8";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const DEFAULT_BODY_LIMIT_BYTES = 1_048_576;
const DEFAULT_MATRIX_RUNNER_RELATIVE_PATH = join(
  "experiments",
  "prompt-bfcl-ralph-matrix",
  "run_prompt_bfcl_ralph_matrix.py"
);
const DEFAULT_MODELS_FILE_NAME = "models.ollama.local.json";
const DEFAULT_RUNTIME_PREFIX = "runtime-service";
const KNOWN_RALPH_VARIANTS = [
  "default",
  "minimal",
  "coverage",
  "schema-lock",
  "parallel-safe",
  "call-count",
  "compact",
  "strict",
];

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonObject
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", JSON_CONTENT_TYPE);
  response.end(`${JSON.stringify(payload)}\n`);
}

function sendHtml(
  response: ServerResponse,
  statusCode: number,
  html: string
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", HTML_CONTENT_TYPE);
  response.end(html);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
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
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > maxBytes) {
      throw new HttpError(413, "request body too large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseRequestUrl(rawUrl: string | undefined): URL {
  return new URL(rawUrl ?? "/", "http://127.0.0.1");
}

function nowIso(): string {
  return new Date().toISOString();
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function sanitizeRuntimeName(value: string | null): string {
  const candidate = value ?? `${DEFAULT_RUNTIME_PREFIX}-${Date.now()}`;
  const sanitized = candidate
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!sanitized) {
    return `${DEFAULT_RUNTIME_PREFIX}-${Date.now()}`;
  }
  if (!sanitized.startsWith("runtime")) {
    return `runtime-${sanitized}`;
  }
  return sanitized;
}

function safeResolveWithin(parent: string, child: string): string {
  const parentResolved = resolve(parent);
  const candidate = resolve(parentResolved, child);
  if (
    candidate !== parentResolved &&
    !candidate.startsWith(`${parentResolved}${sep}`)
  ) {
    throw new HttpError(400, "path escapes benchmark workspace");
  }
  return candidate;
}

function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

function readTextTail(path: string, maxBytes: number): string | null {
  const text = readTextIfExists(path);
  if (text === null) {
    return null;
  }
  if (text.length <= maxBytes) {
    return text;
  }
  return text.slice(-maxBytes);
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toRepoRelativePath(repoRoot: string, path: string): string {
  return relative(repoRoot, path).split(sep).join("/");
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function computeRelativeDeltaPercent(
  baseline: number | null,
  deltaPp: number | null
): number | null {
  if (baseline === null || deltaPp === null || baseline === 0) {
    return null;
  }
  return Number((((deltaPp / baseline) * 100) as number).toFixed(4));
}

function determineArtifactOutcome(
  deltaPp: number | null
): BenchLabArtifactOutcome {
  if (deltaPp === null) {
    return "unknown";
  }
  if (deltaPp > 0) {
    return "improved";
  }
  if (deltaPp < 0) {
    return "regressed";
  }
  return "flat";
}

function parseBenchmarkReportField(
  markdown: string | null,
  fieldName: string
): string | null {
  if (!markdown) {
    return null;
  }
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`^- ${escaped}: \`([^\\n]+)\`$`, "m")
  );
  if (!match) {
    return null;
  }
  return match[1]?.trim() || null;
}

function readArtifactSummary(
  repoRoot: string,
  experimentName: string,
  artifactRoot: string
): BenchLabArtifactSummary | null {
  const summaryPath = join(artifactRoot, "summary.json");
  const reportPath = join(artifactRoot, "benchmark_report.md");
  const errorForensicsPath = join(artifactRoot, "error_forensics.json");
  const summary = readJsonIfExists(summaryPath);
  if (!summary) {
    return null;
  }

  const metrics =
    summary.metrics_percent_point &&
    typeof summary.metrics_percent_point === "object"
      ? (summary.metrics_percent_point as Record<string, unknown>)
      : null;
  const overall =
    metrics?.["Overall Acc"] && typeof metrics["Overall Acc"] === "object"
      ? (metrics["Overall Acc"] as Record<string, unknown>)
      : null;
  const baselineScore = toFiniteNumber(overall?.baseline);
  const ralphScore = toFiniteNumber(overall?.ralph);
  const deltaPp = toFiniteNumber(overall?.delta);
  const reportMarkdown = readTextIfExists(reportPath);
  const chartFile = readdirSync(artifactRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".svg")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))[0];

  let updatedAt: string | null = null;
  try {
    updatedAt = statSync(summaryPath).mtime.toISOString();
  } catch {
    updatedAt = null;
  }

  return {
    id: `${experimentName}::${relative(join(repoRoot, "experiments", experimentName, "artifacts"), artifactRoot)}`,
    experimentName,
    claimName: relative(
      join(repoRoot, "experiments", experimentName, "artifacts"),
      artifactRoot
    ),
    artifactRoot,
    providerName: parseBenchmarkReportField(reportMarkdown, "Provider"),
    modelName: parseBenchmarkReportField(reportMarkdown, "Model"),
    categories: Array.isArray(summary.categories)
      ? summary.categories.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    casesPerCategory:
      typeof summary.cases_per_category === "number"
        ? summary.cases_per_category
        : null,
    baselineScore,
    ralphScore,
    deltaPp,
    relativeDeltaPercent: computeRelativeDeltaPercent(baselineScore, deltaPp),
    outcome: determineArtifactOutcome(deltaPp),
    updatedAt,
    summaryRelativePath: toRepoRelativePath(repoRoot, summaryPath),
    reportRelativePath: existsSync(reportPath)
      ? toRepoRelativePath(repoRoot, reportPath)
      : null,
    chartRelativePath:
      typeof chartFile === "string"
        ? toRepoRelativePath(repoRoot, join(artifactRoot, chartFile))
        : null,
    errorForensicsRelativePath: existsSync(errorForensicsPath)
      ? toRepoRelativePath(repoRoot, errorForensicsPath)
      : null,
  };
}

function listArtifactSummaries(repoRoot: string): BenchLabArtifactSummary[] {
  const experimentsRoot = join(repoRoot, "experiments");
  if (!existsSync(experimentsRoot)) {
    return [];
  }

  const artifacts: BenchLabArtifactSummary[] = [];
  for (const experimentEntry of readdirSync(experimentsRoot, {
    withFileTypes: true,
  })) {
    if (!experimentEntry.isDirectory()) {
      continue;
    }
    const artifactParent = join(
      experimentsRoot,
      experimentEntry.name,
      "artifacts"
    );
    if (!existsSync(artifactParent)) {
      continue;
    }
    for (const artifactEntry of readdirSync(artifactParent, {
      withFileTypes: true,
    })) {
      if (!artifactEntry.isDirectory()) {
        continue;
      }
      const artifactRoot = join(artifactParent, artifactEntry.name);
      const parsed = readArtifactSummary(
        repoRoot,
        experimentEntry.name,
        artifactRoot
      );
      if (parsed) {
        artifacts.push(parsed);
      }
    }
  }

  return artifacts.sort(compareArtifactSummaries);
}

function compareArtifactSummaries(
  left: BenchLabArtifactSummary,
  right: BenchLabArtifactSummary
): number {
  const outcomeRank: Record<BenchLabArtifactOutcome, number> = {
    improved: 0,
    flat: 1,
    regressed: 2,
    unknown: 3,
  };
  const leftRank = outcomeRank[left.outcome];
  const rightRank = outcomeRank[right.outcome];
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  const leftDelta = left.deltaPp ?? Number.NEGATIVE_INFINITY;
  const rightDelta = right.deltaPp ?? Number.NEGATIVE_INFINITY;
  if (leftDelta !== rightDelta) {
    return rightDelta - leftDelta;
  }
  const leftTs = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightTs = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  return rightTs - leftTs;
}

function listBestArtifactSummaries(
  repoRoot: string
): BenchLabArtifactSummary[] {
  const bestByModel = new Map<string, BenchLabArtifactSummary>();
  for (const artifact of listArtifactSummaries(repoRoot)) {
    const modelKey = `${artifact.providerName ?? "unknown"}::${artifact.modelName ?? artifact.claimName}`;
    const current = bestByModel.get(modelKey);
    if (!current || compareArtifactSummaries(artifact, current) < 0) {
      bestByModel.set(modelKey, artifact);
    }
  }
  return [...bestByModel.values()].sort(compareArtifactSummaries);
}

function readArtifactDetail(
  repoRoot: string,
  artifact: BenchLabArtifactSummary
): JsonObject {
  const summaryPath = join(repoRoot, artifact.summaryRelativePath);
  const reportPath = artifact.reportRelativePath
    ? join(repoRoot, artifact.reportRelativePath)
    : null;
  const chartPath = artifact.chartRelativePath
    ? join(repoRoot, artifact.chartRelativePath)
    : null;

  return {
    artifact,
    errorForensicsJson: artifact.errorForensicsRelativePath
      ? readJsonIfExists(join(repoRoot, artifact.errorForensicsRelativePath))
      : null,
    summary: readJsonIfExists(summaryPath),
    reportMarkdown: reportPath ? readTextIfExists(reportPath) : null,
    chartSvg: chartPath ? readTextIfExists(chartPath) : null,
  };
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "model";
}

function readRuntimeRecordSummaries(
  repoRoot: string,
  runtimeName: string,
  runtimeRoot: string
): BenchLabRuntimeRecordSummary[] {
  const summary = readJsonIfExists(join(runtimeRoot, "matrix_summary.json"));
  if (!(summary && Array.isArray(summary.records))) {
    return [];
  }

  const categories = Array.isArray(summary.categories)
    ? summary.categories.filter(
        (item): item is string => typeof item === "string"
      )
    : [];
  const casesPerCategory =
    typeof summary.cases_per_category === "number"
      ? summary.cases_per_category
      : null;

  return summary.records.flatMap((rawRecord) => {
    if (!rawRecord || typeof rawRecord !== "object") {
      return [];
    }
    const record = rawRecord as Record<string, unknown>;
    const recordId = toOptionalString(record.id);
    if (!recordId) {
      return [];
    }

    const recordRuntimeRoot =
      typeof record.runtime_root === "string"
        ? join(repoRoot, record.runtime_root)
        : join(runtimeRoot, "runs", slugify(recordId));

    let updatedAt: string | null = null;
    try {
      updatedAt = statSync(recordRuntimeRoot).mtime.toISOString();
    } catch {
      updatedAt = null;
    }

    return [
      {
        casesPerCategory,
        categories,
        endedAtUtc: toOptionalString(record.ended_at_utc),
        errorMessage: toOptionalString(record.error_message),
        id: recordId,
        kind: toOptionalString(record.kind),
        label: toOptionalString(record.label),
        modelName: toOptionalString(record.model_name),
        outcome: toOptionalString(record.outcome) ?? "unknown",
        overallBaseline: toFiniteNumber(record.overall_baseline),
        overallDeltaPp: toFiniteNumber(record.overall_delta_pp),
        overallRalph: toFiniteNumber(record.overall_ralph),
        overallRelativeDeltaPercent: toFiniteNumber(
          record.overall_relative_delta_percent
        ),
        providerName: toOptionalString(record.provider_name),
        ralphVariant: toOptionalString(record.ralph_variant) ?? "default",
        runtimeName,
        runtimeRoot: recordRuntimeRoot,
        salvaged: record.salvaged === true,
        startedAtUtc: toOptionalString(record.started_at_utc),
        status: toOptionalString(record.status) ?? "unknown",
        updatedAt,
      } satisfies BenchLabRuntimeRecordSummary,
    ];
  });
}

function readAllRuntimeRecordSummaries(
  repoRoot: string,
  matrixRoot: string
): BenchLabRuntimeRecordSummary[] {
  return listRuntimeRoots(matrixRoot).flatMap((runtimeRoot) => {
    const runtimeName =
      relative(resolve(runtimeRoot, ".."), runtimeRoot) || runtimeRoot;
    return readRuntimeRecordSummaries(repoRoot, runtimeName, runtimeRoot);
  });
}

function classifyForensicsBucket(reason: string | null): string {
  const normalized = (reason ?? "").trim().toLowerCase();
  if (!normalized) {
    return "other";
  }
  if (normalized.includes("timeout")) {
    return "timeout";
  }
  if (
    normalized.includes("missing") ||
    normalized.includes("required") ||
    normalized.includes("coverage")
  ) {
    return "missing_args";
  }
  if (
    normalized.includes("schema") ||
    normalized.includes("type") ||
    normalized.includes("enum") ||
    normalized.includes("json") ||
    normalized.includes("parse") ||
    normalized.includes("validation")
  ) {
    return "schema_mismatch";
  }
  if (
    normalized.includes("tool") ||
    normalized.includes("function") ||
    normalized.includes("registry") ||
    normalized.includes("halluc")
  ) {
    return "tool_selection";
  }
  if (
    normalized.includes("parallel") ||
    normalized.includes("call-count") ||
    normalized.includes("planning") ||
    normalized.includes("dropped")
  ) {
    return "planning";
  }
  if (
    normalized.includes("auth") ||
    normalized.includes("permission") ||
    normalized.includes("quota") ||
    normalized.includes("rate limit") ||
    normalized.includes("api key")
  ) {
    return "provider_error";
  }
  if (normalized.includes("inference") || normalized.includes("model")) {
    return "inference_error";
  }
  return "other";
}

function compareBucketSummaries(
  left: BenchLabForensicsBucketSummary,
  right: BenchLabForensicsBucketSummary
): number {
  const leftMagnitude = Math.abs(left.deltaCount);
  const rightMagnitude = Math.abs(right.deltaCount);
  if (leftMagnitude !== rightMagnitude) {
    return rightMagnitude - leftMagnitude;
  }
  const leftTotal = left.baselineCount + left.ralphCount;
  const rightTotal = right.baselineCount + right.ralphCount;
  if (leftTotal !== rightTotal) {
    return rightTotal - leftTotal;
  }
  return left.bucket.localeCompare(right.bucket);
}

function compareRuntimeRecordsByQuality(
  left: BenchLabRuntimeRecordSummary,
  right: BenchLabRuntimeRecordSummary
): number {
  const leftDelta = left.overallDeltaPp ?? Number.NEGATIVE_INFINITY;
  const rightDelta = right.overallDeltaPp ?? Number.NEGATIVE_INFINITY;
  if (leftDelta !== rightDelta) {
    return rightDelta - leftDelta;
  }
  const leftCases = left.casesPerCategory ?? 0;
  const rightCases = right.casesPerCategory ?? 0;
  if (leftCases !== rightCases) {
    return rightCases - leftCases;
  }
  const leftUpdated = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightUpdated = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  return rightUpdated - leftUpdated;
}

function buildEmptyForensicsModelSummary(
  runtimeName: string,
  modelRunName: string,
  modelName: string | null,
  providerName: string | null,
  outcome: BenchLabArtifactOutcome
): BenchLabForensicsModelSummary {
  const parsed = buildEmptyParsedForensicsSummary();
  return {
    baselineErrorItems: parsed.baselineErrorItems,
    baselineErrorRatePercent: parsed.baselineErrorRatePercent,
    baselineTotalItems: parsed.baselineTotalItems,
    buckets: parsed.buckets,
    deltaErrorItems: parsed.ralphErrorItems - parsed.baselineErrorItems,
    dominantBucket: parsed.dominantBucket,
    modelName,
    name: modelRunName,
    outcome,
    providerName,
    ralphErrorItems: parsed.ralphErrorItems,
    ralphErrorRatePercent: parsed.ralphErrorRatePercent,
    ralphTotalItems: parsed.ralphTotalItems,
    runtimeName,
  };
}

function calculateErrorRate(errorItems: number, totalItems: number): number {
  if (totalItems <= 0) {
    return 0;
  }
  return Number(((errorItems / totalItems) * 100).toFixed(2));
}

function buildEmptyParsedForensicsSummary(): BenchLabParsedForensicsSummary {
  return {
    baselineErrorItems: 0,
    baselineErrorRatePercent: 0,
    baselineTotalItems: 0,
    buckets: [],
    dominantBucket: null,
    hasErrorBuckets: false,
    ralphErrorItems: 0,
    ralphErrorRatePercent: 0,
    ralphTotalItems: 0,
  };
}

function getForensicsRegistrySide(
  registryName: string
): "baseline" | "ralph" | null {
  const normalized = registryName.toLowerCase();
  if (normalized.includes("baseline")) {
    return "baseline";
  }
  if (normalized.includes("ralph")) {
    return "ralph";
  }
  return null;
}

function getRawForensicsReasonText(rawReason: unknown): string | null {
  if (typeof rawReason === "string") {
    return rawReason;
  }
  if (!rawReason || typeof rawReason !== "object") {
    return null;
  }
  const reasonObject = rawReason as Record<string, unknown>;
  return (
    toOptionalString(reasonObject.reason) ?? toOptionalString(reasonObject.type)
  );
}

function getForensicsReasonCount(rawReason: unknown): number {
  if (!rawReason || typeof rawReason !== "object") {
    return 1;
  }
  const reasonObject = rawReason as Record<string, unknown>;
  return toFiniteNumber(reasonObject.count) ?? 1;
}

function getForensicsReasonSampleIds(rawReason: unknown): string[] {
  if (!rawReason || typeof rawReason !== "object") {
    return [];
  }
  const reasonObject = rawReason as Record<string, unknown>;
  return Array.isArray(reasonObject.sample_ids)
    ? reasonObject.sample_ids.filter(
        (item): item is string => typeof item === "string"
      )
    : [];
}

function mutateForensicsTotals(
  side: "baseline" | "ralph",
  errorItems: number,
  totalItems: number,
  totals: {
    baselineErrorItems: number;
    baselineTotalItems: number;
    ralphErrorItems: number;
    ralphTotalItems: number;
  }
): void {
  if (side === "baseline") {
    totals.baselineErrorItems += errorItems;
    totals.baselineTotalItems += totalItems;
    return;
  }
  totals.ralphErrorItems += errorItems;
  totals.ralphTotalItems += totalItems;
}

function updateForensicsBucketMap(
  bucketMap: Map<
    string,
    { baselineCount: number; ralphCount: number; sampleIds: Set<string> }
  >,
  side: "baseline" | "ralph",
  bucket: string,
  count: number,
  sampleIds: string[]
): void {
  const existing = bucketMap.get(bucket) ?? {
    baselineCount: 0,
    ralphCount: 0,
    sampleIds: new Set<string>(),
  };
  if (side === "baseline") {
    existing.baselineCount += count;
  } else {
    existing.ralphCount += count;
  }
  for (const sampleId of sampleIds) {
    if (existing.sampleIds.size >= 5) {
      break;
    }
    existing.sampleIds.add(sampleId);
  }
  bucketMap.set(bucket, existing);
}

function finalizeForensicsBuckets(
  bucketMap: Map<
    string,
    { baselineCount: number; ralphCount: number; sampleIds: Set<string> }
  >
): BenchLabForensicsBucketSummary[] {
  return [...bucketMap.entries()]
    .map(([bucket, counts]) => ({
      baselineCount: counts.baselineCount,
      bucket,
      deltaCount: counts.ralphCount - counts.baselineCount,
      ralphCount: counts.ralphCount,
      sampleIds: [...counts.sampleIds].sort(),
    }))
    .sort(compareBucketSummaries);
}

function readRegistryForensics(
  bucketMap: Map<
    string,
    { baselineCount: number; ralphCount: number; sampleIds: Set<string> }
  >,
  registryName: string,
  registry: Record<string, unknown>,
  totals: {
    baselineErrorItems: number;
    baselineTotalItems: number;
    ralphErrorItems: number;
    ralphTotalItems: number;
  }
): void {
  const side = getForensicsRegistrySide(registryName);
  if (!side) {
    return;
  }

  const errorItems = toFiniteNumber(registry.error_items) ?? 0;
  const totalItems = toFiniteNumber(registry.total_items) ?? 0;
  mutateForensicsTotals(side, errorItems, totalItems, totals);

  const reasons = Array.isArray(registry.error_reasons)
    ? registry.error_reasons
    : [];
  let countedReasons = 0;
  for (const rawReason of reasons) {
    const count = getForensicsReasonCount(rawReason);
    countedReasons += count;
    updateForensicsBucketMap(
      bucketMap,
      side,
      classifyForensicsBucket(getRawForensicsReasonText(rawReason)),
      count,
      getForensicsReasonSampleIds(rawReason)
    );
  }

  const unmatchedCount = Math.max(errorItems - countedReasons, 0);
  if (unmatchedCount > 0) {
    updateForensicsBucketMap(bucketMap, side, "other", unmatchedCount, []);
  }
}

function parseForensicsPayload(
  payload: Record<string, unknown> | null
): BenchLabParsedForensicsSummary {
  if (
    !payload ||
    typeof payload.registries !== "object" ||
    payload.registries === null
  ) {
    return buildEmptyParsedForensicsSummary();
  }

  const bucketMap = new Map<
    string,
    { baselineCount: number; ralphCount: number; sampleIds: Set<string> }
  >();
  const totals = {
    baselineErrorItems: 0,
    baselineTotalItems: 0,
    ralphErrorItems: 0,
    ralphTotalItems: 0,
  };

  for (const [registryName, rawRegistry] of Object.entries(
    payload.registries
  )) {
    if (!rawRegistry || typeof rawRegistry !== "object") {
      continue;
    }
    readRegistryForensics(
      bucketMap,
      registryName,
      rawRegistry as Record<string, unknown>,
      totals
    );
  }

  const buckets = finalizeForensicsBuckets(bucketMap);
  return {
    baselineErrorItems: totals.baselineErrorItems,
    baselineErrorRatePercent: calculateErrorRate(
      totals.baselineErrorItems,
      totals.baselineTotalItems
    ),
    baselineTotalItems: totals.baselineTotalItems,
    buckets,
    dominantBucket: buckets[0]?.bucket ?? null,
    hasErrorBuckets: buckets.length > 0,
    ralphErrorItems: totals.ralphErrorItems,
    ralphErrorRatePercent: calculateErrorRate(
      totals.ralphErrorItems,
      totals.ralphTotalItems
    ),
    ralphTotalItems: totals.ralphTotalItems,
  };
}

function compareArtifactForensicsClaims(
  left: BenchLabArtifactForensicsClaimSummary,
  right: BenchLabArtifactForensicsClaimSummary
): number {
  if (left.hasErrorBuckets !== right.hasErrorBuckets) {
    return left.hasErrorBuckets ? -1 : 1;
  }
  if (left.deltaErrorItems !== right.deltaErrorItems) {
    return left.deltaErrorItems - right.deltaErrorItems;
  }
  const leftDelta = left.deltaPp ?? Number.NEGATIVE_INFINITY;
  const rightDelta = right.deltaPp ?? Number.NEGATIVE_INFINITY;
  if (leftDelta !== rightDelta) {
    return rightDelta - leftDelta;
  }
  const leftUpdated = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightUpdated = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  return rightUpdated - leftUpdated;
}

function readArtifactForensicsClaimSummary(
  repoRoot: string,
  artifact: BenchLabArtifactSummary
): BenchLabArtifactForensicsClaimSummary {
  const parsed = parseForensicsPayload(
    artifact.errorForensicsRelativePath
      ? readJsonIfExists(join(repoRoot, artifact.errorForensicsRelativePath))
      : null
  );
  return {
    artifactId: artifact.id,
    baselineErrorItems: parsed.baselineErrorItems,
    baselineErrorRatePercent: parsed.baselineErrorRatePercent,
    baselineTotalItems: parsed.baselineTotalItems,
    buckets: parsed.buckets,
    claimName: artifact.claimName,
    deltaErrorItems: parsed.ralphErrorItems - parsed.baselineErrorItems,
    deltaPp: artifact.deltaPp,
    dominantBucket: parsed.dominantBucket,
    experimentName: artifact.experimentName,
    hasErrorBuckets: parsed.hasErrorBuckets,
    hasForensicsFile: artifact.errorForensicsRelativePath !== null,
    modelName: artifact.modelName,
    outcome: artifact.outcome,
    providerName: artifact.providerName,
    ralphErrorItems: parsed.ralphErrorItems,
    ralphErrorRatePercent: parsed.ralphErrorRatePercent,
    ralphTotalItems: parsed.ralphTotalItems,
    updatedAt: artifact.updatedAt,
  };
}

function listArtifactForensicsOverview(repoRoot: string): {
  buckets: BenchLabForensicsBucketSummary[];
  claims: BenchLabArtifactForensicsClaimSummary[];
  gaps: BenchLabArtifactForensicsGapSummary[];
  summary: BenchLabArtifactForensicsOverviewSummary;
} {
  const claims = listArtifactSummaries(repoRoot)
    .map((artifact) => readArtifactForensicsClaimSummary(repoRoot, artifact))
    .sort(compareArtifactForensicsClaims);
  const bucketMap = new Map<
    string,
    { baselineCount: number; ralphCount: number; sampleIds: Set<string> }
  >();
  const gaps: BenchLabArtifactForensicsGapSummary[] = [];

  for (const claim of claims) {
    for (const bucket of claim.buckets) {
      const existing = bucketMap.get(bucket.bucket) ?? {
        baselineCount: 0,
        ralphCount: 0,
        sampleIds: new Set<string>(),
      };
      existing.baselineCount += bucket.baselineCount;
      existing.ralphCount += bucket.ralphCount;
      for (const sampleId of bucket.sampleIds) {
        if (existing.sampleIds.size >= 5) {
          break;
        }
        existing.sampleIds.add(sampleId);
      }
      bucketMap.set(bucket.bucket, existing);
    }

    if (!claim.hasForensicsFile) {
      gaps.push({
        artifactId: claim.artifactId,
        claimName: claim.claimName,
        experimentName: claim.experimentName,
        gap: "missing_forensics_file",
        modelName: claim.modelName,
        providerName: claim.providerName,
        updatedAt: claim.updatedAt,
      });
      continue;
    }

    if (!claim.hasErrorBuckets) {
      gaps.push({
        artifactId: claim.artifactId,
        claimName: claim.claimName,
        experimentName: claim.experimentName,
        gap: "no_error_buckets",
        modelName: claim.modelName,
        providerName: claim.providerName,
        updatedAt: claim.updatedAt,
      });
    }
  }

  const buckets = finalizeForensicsBuckets(bucketMap);
  const summary = claims.reduce<BenchLabArtifactForensicsOverviewSummary>(
    (accumulator, claim) => {
      accumulator.artifacts += 1;
      accumulator.baselineErrorItems += claim.baselineErrorItems;
      accumulator.baselineTotalItems += claim.baselineTotalItems;
      accumulator.ralphErrorItems += claim.ralphErrorItems;
      accumulator.ralphTotalItems += claim.ralphTotalItems;
      if (claim.hasForensicsFile) {
        accumulator.artifactsWithForensicsFile += 1;
      }
      if (claim.hasErrorBuckets) {
        accumulator.artifactsWithErrorBuckets += 1;
      }
      if (claim.baselineErrorItems > 0 || claim.ralphErrorItems > 0) {
        accumulator.artifactsWithTrackedErrors += 1;
      }
      if (claim.outcome === "improved") {
        accumulator.improvedArtifacts += 1;
      } else if (claim.outcome === "regressed") {
        accumulator.regressedArtifacts += 1;
      } else if (claim.outcome === "flat") {
        accumulator.flatArtifacts += 1;
      }
      if (claim.baselineErrorItems > claim.ralphErrorItems) {
        accumulator.improvedErrorArtifacts += 1;
      } else if (claim.baselineErrorItems < claim.ralphErrorItems) {
        accumulator.regressedErrorArtifacts += 1;
      } else {
        accumulator.flatErrorArtifacts += 1;
      }
      return accumulator;
    },
    {
      artifacts: 0,
      artifactsWithErrorBuckets: 0,
      artifactsWithForensicsFile: 0,
      artifactsWithTrackedErrors: 0,
      baselineErrorItems: 0,
      baselineErrorRatePercent: 0,
      baselineTotalItems: 0,
      dominantBucket: null,
      flatArtifacts: 0,
      flatErrorArtifacts: 0,
      improvedArtifacts: 0,
      improvedErrorArtifacts: 0,
      ralphErrorItems: 0,
      ralphErrorRatePercent: 0,
      ralphTotalItems: 0,
      regressedArtifacts: 0,
      regressedErrorArtifacts: 0,
    }
  );
  summary.baselineErrorRatePercent = calculateErrorRate(
    summary.baselineErrorItems,
    summary.baselineTotalItems
  );
  summary.ralphErrorRatePercent = calculateErrorRate(
    summary.ralphErrorItems,
    summary.ralphTotalItems
  );
  summary.dominantBucket = buckets[0]?.bucket ?? null;

  return {
    buckets,
    claims,
    gaps,
    summary,
  };
}

function readModelRunForensicsSummary(
  runtimeName: string,
  modelRunName: string,
  modelName: string | null,
  providerName: string | null,
  outcome: BenchLabArtifactOutcome,
  errorForensicsPath: string
): BenchLabForensicsModelSummary {
  const payload = readJsonIfExists(errorForensicsPath);
  const parsed = parseForensicsPayload(payload);
  if (!payload) {
    return buildEmptyForensicsModelSummary(
      runtimeName,
      modelRunName,
      modelName,
      providerName,
      outcome
    );
  }

  return {
    baselineErrorItems: parsed.baselineErrorItems,
    baselineErrorRatePercent: parsed.baselineErrorRatePercent,
    baselineTotalItems: parsed.baselineTotalItems,
    buckets: parsed.buckets,
    deltaErrorItems: parsed.ralphErrorItems - parsed.baselineErrorItems,
    dominantBucket: parsed.dominantBucket,
    modelName,
    name: modelRunName,
    outcome,
    providerName,
    ralphErrorItems: parsed.ralphErrorItems,
    ralphErrorRatePercent: parsed.ralphErrorRatePercent,
    ralphTotalItems: parsed.ralphTotalItems,
    runtimeName,
  };
}

function readRuntimeForensicsSummary(
  runtimeName: string,
  runtimeRoot: string,
  records: BenchLabRuntimeRecordSummary[]
): BenchLabRuntimeForensicsSummary {
  const bucketMap = new Map<
    string,
    { baselineCount: number; ralphCount: number; sampleIds: Set<string> }
  >();
  const modelRuns = records
    .map((record) =>
      readModelRunForensicsSummary(
        runtimeName,
        slugify(record.id),
        record.modelName,
        record.providerName,
        determineArtifactOutcome(record.overallDeltaPp),
        join(runtimeRoot, "runs", slugify(record.id), "error_forensics.json")
      )
    )
    .sort((left, right) => {
      const leftMagnitude = Math.abs(left.deltaErrorItems);
      const rightMagnitude = Math.abs(right.deltaErrorItems);
      if (leftMagnitude !== rightMagnitude) {
        return rightMagnitude - leftMagnitude;
      }
      return left.name.localeCompare(right.name);
    });

  const totals = {
    baselineErrorItems: 0,
    baselineTotalItems: 0,
    modelsWithErrors: 0,
    modelsWithImprovedErrors: 0,
    modelsWithRegressedErrors: 0,
    ralphErrorItems: 0,
    ralphTotalItems: 0,
  };

  for (const modelRun of modelRuns) {
    totals.baselineErrorItems += modelRun.baselineErrorItems;
    totals.baselineTotalItems += modelRun.baselineTotalItems;
    totals.ralphErrorItems += modelRun.ralphErrorItems;
    totals.ralphTotalItems += modelRun.ralphTotalItems;
    if (modelRun.baselineErrorItems > 0 || modelRun.ralphErrorItems > 0) {
      totals.modelsWithErrors += 1;
    }
    if (modelRun.deltaErrorItems < 0) {
      totals.modelsWithImprovedErrors += 1;
    } else if (modelRun.deltaErrorItems > 0) {
      totals.modelsWithRegressedErrors += 1;
    }

    for (const bucket of modelRun.buckets) {
      updateForensicsBucketMap(
        bucketMap,
        "baseline",
        bucket.bucket,
        bucket.baselineCount,
        bucket.sampleIds
      );
      updateForensicsBucketMap(
        bucketMap,
        "ralph",
        bucket.bucket,
        bucket.ralphCount,
        bucket.sampleIds
      );
    }
  }

  const buckets = finalizeForensicsBuckets(bucketMap);

  let updatedAt: string | null = null;
  try {
    updatedAt = statSync(runtimeRoot).mtime.toISOString();
  } catch {
    updatedAt = null;
  }

  return {
    baselineErrorItems: totals.baselineErrorItems,
    baselineErrorRatePercent: calculateErrorRate(
      totals.baselineErrorItems,
      totals.baselineTotalItems
    ),
    baselineTotalItems: totals.baselineTotalItems,
    buckets,
    modelRuns,
    modelsWithErrors: totals.modelsWithErrors,
    modelsWithImprovedErrors: totals.modelsWithImprovedErrors,
    modelsWithRegressedErrors: totals.modelsWithRegressedErrors,
    ralphErrorItems: totals.ralphErrorItems,
    ralphErrorRatePercent: calculateErrorRate(
      totals.ralphErrorItems,
      totals.ralphTotalItems
    ),
    ralphTotalItems: totals.ralphTotalItems,
    runtimeName,
    updatedAt,
  };
}

function buildRuntimeCompare(
  repoRoot: string,
  matrixRoot: string,
  leftRuntimeName: string,
  rightRuntimeName: string
): JsonObject {
  const leftRuntimeRoot = safeResolveWithin(matrixRoot, leftRuntimeName);
  const rightRuntimeRoot = safeResolveWithin(matrixRoot, rightRuntimeName);
  if (!existsSync(leftRuntimeRoot)) {
    throw new HttpError(404, `runtime not found: ${leftRuntimeName}`);
  }
  if (!existsSync(rightRuntimeRoot)) {
    throw new HttpError(404, `runtime not found: ${rightRuntimeName}`);
  }

  const leftRun = readRuntimeSummary(leftRuntimeRoot);
  const rightRun = readRuntimeSummary(rightRuntimeRoot);
  const leftRecords = readRuntimeRecordSummaries(
    repoRoot,
    leftRuntimeName,
    leftRuntimeRoot
  );
  const rightRecords = readRuntimeRecordSummaries(
    repoRoot,
    rightRuntimeName,
    rightRuntimeRoot
  );

  const matchedRows: JsonObject[] = [];
  const matchedLeftIds = new Set<string>();
  const matchedRightIds = new Set<string>();
  const rightById = new Map(rightRecords.map((record) => [record.id, record]));

  for (const leftRecord of leftRecords) {
    const rightRecord = rightById.get(leftRecord.id);
    if (!rightRecord) {
      continue;
    }
    matchedLeftIds.add(leftRecord.id);
    matchedRightIds.add(rightRecord.id);
    matchedRows.push(buildRuntimeCompareRow(leftRecord, rightRecord));
  }

  const remainingLeft = leftRecords.filter(
    (record) => !matchedLeftIds.has(record.id)
  );
  const remainingRight = rightRecords.filter(
    (record) => !matchedRightIds.has(record.id)
  );

  const leftByModelKey = new Map<string, BenchLabRuntimeRecordSummary[]>();
  const rightByModelKey = new Map<string, BenchLabRuntimeRecordSummary[]>();
  for (const record of remainingLeft) {
    const key = buildRuntimeRecordModelKey(record);
    leftByModelKey.set(key, [...(leftByModelKey.get(key) ?? []), record]);
  }
  for (const record of remainingRight) {
    const key = buildRuntimeRecordModelKey(record);
    rightByModelKey.set(key, [...(rightByModelKey.get(key) ?? []), record]);
  }

  for (const [key, leftGroup] of leftByModelKey.entries()) {
    const rightGroup = rightByModelKey.get(key);
    if (!(leftGroup?.length === 1 && rightGroup?.length === 1)) {
      continue;
    }
    const [leftRecord] = leftGroup;
    const [rightRecord] = rightGroup;
    matchedLeftIds.add(leftRecord.id);
    matchedRightIds.add(rightRecord.id);
    matchedRows.push(buildRuntimeCompareRow(leftRecord, rightRecord));
  }

  const leftOnly = leftRecords
    .filter((record) => !matchedLeftIds.has(record.id))
    .sort(compareRuntimeRecordsByQuality)
    .map(summarizeRuntimeCompareSide);
  const rightOnly = rightRecords
    .filter((record) => !matchedRightIds.has(record.id))
    .sort(compareRuntimeRecordsByQuality)
    .map(summarizeRuntimeCompareSide);

  const sortedRows = matchedRows.sort((left, right) => {
    const leftShift = Math.abs((left.deltaPpShift as number | null) ?? 0);
    const rightShift = Math.abs((right.deltaPpShift as number | null) ?? 0);
    if (leftShift !== rightShift) {
      return rightShift - leftShift;
    }
    return String(left.modelName ?? left.key).localeCompare(
      String(right.modelName ?? right.key)
    );
  });

  const rightBetter = sortedRows.filter(
    (row) => row.verdict === "right-better"
  ).length;
  const leftBetter = sortedRows.filter(
    (row) => row.verdict === "left-better"
  ).length;
  const same = sortedRows.length - rightBetter - leftBetter;

  return {
    leftRun,
    rightRun,
    rows: sortedRows,
    summary: {
      leftBetter,
      leftOnly: leftOnly.length,
      rightBetter,
      rightOnly: rightOnly.length,
      same,
      shared: sortedRows.length,
    },
    leftOnly,
    rightOnly,
  };
}

function buildRuntimeCompareRow(
  left: BenchLabRuntimeRecordSummary,
  right: BenchLabRuntimeRecordSummary
): JsonObject {
  const leftDelta = left.overallDeltaPp;
  const rightDelta = right.overallDeltaPp;
  const deltaPpShift =
    leftDelta !== null && rightDelta !== null
      ? Number((rightDelta - leftDelta).toFixed(4))
      : null;
  let verdict = "same";
  if (deltaPpShift !== null) {
    if (deltaPpShift > 0) {
      verdict = "right-better";
    } else if (deltaPpShift < 0) {
      verdict = "left-better";
    }
  }

  return {
    deltaPpShift,
    key: buildRuntimeRecordModelKey(left),
    left: summarizeRuntimeCompareSide(left),
    modelName: left.modelName ?? right.modelName,
    providerName: left.providerName ?? right.providerName,
    right: summarizeRuntimeCompareSide(right),
    verdict,
  };
}

function summarizeRuntimeCompareSide(
  record: BenchLabRuntimeRecordSummary
): JsonObject {
  return {
    casesPerCategory: record.casesPerCategory,
    deltaPp: record.overallDeltaPp,
    id: record.id,
    outcome: record.outcome,
    ralphVariant: record.ralphVariant,
    status: record.status,
  };
}

function buildRuntimeRecordModelKey(
  record: BenchLabRuntimeRecordSummary
): string {
  if (record.providerName && record.modelName) {
    return `${record.providerName}::${record.modelName}`;
  }
  if (record.modelName) {
    return record.modelName;
  }
  return record.id;
}

function listVariantLeaderboards(
  repoRoot: string,
  matrixRoot: string
): JsonObject {
  const records = readAllRuntimeRecordSummaries(repoRoot, matrixRoot).filter(
    (record) => record.status === "completed"
  );

  const variantGroups = new Map<
    string,
    {
      avgTotal: number;
      bestDelta: number;
      improvedCount: number;
      lastSeenAt: string | null;
      modelKeySet: Set<string>;
      runsCount: number;
      variant: string;
      worstDelta: number;
    }
  >();
  const modelGroups = new Map<
    string,
    {
      forensicsBuckets: Map<string, number>;
      kind: string | null;
      modelName: string | null;
      providerName: string | null;
      records: BenchLabRuntimeRecordSummary[];
    }
  >();

  for (const record of records) {
    const variant = record.ralphVariant ?? "default";
    const modelKey = buildRuntimeRecordModelKey(record);
    const variantKey = `${modelKey}::${variant}`;
    const group = variantGroups.get(variantKey) ?? {
      avgTotal: 0,
      bestDelta: Number.NEGATIVE_INFINITY,
      improvedCount: 0,
      lastSeenAt: null,
      modelKeySet: new Set<string>(),
      runsCount: 0,
      variant,
      worstDelta: Number.POSITIVE_INFINITY,
    };
    const delta = record.overallDeltaPp ?? 0;
    group.avgTotal += delta;
    group.bestDelta = Math.max(group.bestDelta, delta);
    group.improvedCount += delta > 0 ? 1 : 0;
    group.lastSeenAt =
      !group.lastSeenAt ||
      (record.updatedAt && record.updatedAt > group.lastSeenAt)
        ? record.updatedAt
        : group.lastSeenAt;
    group.modelKeySet.add(modelKey);
    group.runsCount += 1;
    group.worstDelta = Math.min(group.worstDelta, delta);
    variantGroups.set(variantKey, group);

    const modelGroup = modelGroups.get(modelKey) ?? {
      forensicsBuckets: new Map<string, number>(),
      kind: record.kind,
      modelName: record.modelName,
      providerName: record.providerName,
      records: [],
    };
    modelGroup.records.push(record);
    const forensics = readModelRunForensicsSummary(
      record.runtimeName,
      slugify(record.id),
      record.modelName,
      record.providerName,
      determineArtifactOutcome(record.overallDeltaPp),
      join(record.runtimeRoot, "error_forensics.json")
    );
    for (const bucket of forensics.buckets) {
      modelGroup.forensicsBuckets.set(
        bucket.bucket,
        (modelGroup.forensicsBuckets.get(bucket.bucket) ?? 0) +
          bucket.baselineCount +
          bucket.ralphCount
      );
    }
    modelGroups.set(modelKey, modelGroup);
  }

  const variants: BenchLabVariantLeaderboardEntry[] = [
    ...variantGroups.entries(),
  ]
    .map(([key, group]) => ({
      avgDeltaPp: Number((group.avgTotal / group.runsCount).toFixed(4)),
      bestDeltaPp: Number(group.bestDelta.toFixed(4)),
      id: key,
      improvedCount: group.improvedCount,
      lastSeenAt: group.lastSeenAt,
      modelKey: [...group.modelKeySet][0] ?? key,
      modelsCount: group.modelKeySet.size,
      runsCount: group.runsCount,
      successRatePercent: Number(
        ((group.improvedCount / group.runsCount) * 100).toFixed(2)
      ),
      variant: group.variant,
      worstDeltaPp: Number(group.worstDelta.toFixed(4)),
    }))
    .sort((left, right) => {
      if (left.avgDeltaPp !== right.avgDeltaPp) {
        return right.avgDeltaPp - left.avgDeltaPp;
      }
      return right.runsCount - left.runsCount;
    });

  const recommendations: BenchLabVariantRecommendation[] = [
    ...modelGroups.values(),
  ]
    .map((group) => buildVariantRecommendation(group))
    .sort((left, right) => {
      const stageRank: Record<string, number> = {
        promising: 0,
        exploring: 1,
        stalled: 2,
        validated: 3,
      };
      const leftRank = stageRank[left.stage] ?? 99;
      const rightRank = stageRank[right.stage] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return (
        (right.bestDeltaPp ?? Number.NEGATIVE_INFINITY) -
        (left.bestDeltaPp ?? Number.NEGATIVE_INFINITY)
      );
    });

  return {
    recommendations,
    summary: {
      models: recommendations.length,
      variants: variants.length,
    },
    variants,
  };
}

function buildVariantRecommendation(group: {
  forensicsBuckets: Map<string, number>;
  kind: string | null;
  modelName: string | null;
  providerName: string | null;
  records: BenchLabRuntimeRecordSummary[];
}): BenchLabVariantRecommendation {
  const records = [...group.records].sort(compareRuntimeRecordsByQuality);
  const bestRecord = records[0] ?? null;
  const testedVariants = [
    ...new Set(records.map((record) => record.ralphVariant ?? "default")),
  ];
  const bestDeltaPp = bestRecord?.overallDeltaPp ?? null;
  const bestCasesPerCategory = bestRecord?.casesPerCategory ?? null;
  const dominantBucket =
    [...group.forensicsBuckets.entries()].sort(
      (left, right) => right[1] - left[1]
    )[0]?.[0] ?? null;
  const nextVariantsToTry = suggestVariantsToTry(
    testedVariants,
    bestDeltaPp,
    bestCasesPerCategory,
    dominantBucket
  );
  const stage = determineVariantStage(
    bestDeltaPp,
    bestCasesPerCategory,
    testedVariants.length
  );
  const recommendedCasesPerCategory = getRecommendedCasesForStage(stage);
  const suggestedModelEntry = buildSuggestedModelEntry(
    group.kind,
    group.modelName,
    group.providerName,
    nextVariantsToTry[0] ?? null
  );

  return {
    bestCasesPerCategory,
    bestDeltaPp,
    bestVariant: bestRecord?.ralphVariant ?? null,
    dominantBucket,
    kind: group.kind,
    modelName: group.modelName,
    nextVariantsToTry,
    providerName: group.providerName,
    recommendedCasesPerCategory,
    stage,
    suggestedModelEntry,
    testedVariants,
  };
}

function buildSuggestedModelEntry(
  kind: string | null,
  modelName: string | null,
  providerName: string | null,
  variant: string | null
): BenchLabSuggestedModelEntry | null {
  if (!(modelName && variant)) {
    return null;
  }
  return {
    id: `${slugify(providerName ?? "model")}-${slugify(modelName)}-${variant}`,
    kind,
    model_name: modelName,
    provider_name: providerName,
    ralph_variant: variant,
  };
}

function determineVariantStage(
  bestDeltaPp: number | null,
  bestCasesPerCategory: number | null,
  testedVariantsCount: number
): string {
  if (
    bestDeltaPp !== null &&
    bestDeltaPp > 0 &&
    (bestCasesPerCategory ?? 0) >= 10
  ) {
    return "validated";
  }
  if (bestDeltaPp !== null && bestDeltaPp > 0) {
    return "promising";
  }
  if (testedVariantsCount >= 3) {
    return "stalled";
  }
  return "exploring";
}

function getRecommendedCasesForStage(stage: string): number {
  if (stage === "validated") {
    return 20;
  }
  if (stage === "promising") {
    return 10;
  }
  return 5;
}

function suggestVariantsToTry(
  testedVariants: string[],
  bestDeltaPp: number | null,
  bestCasesPerCategory: number | null,
  dominantBucket: string | null
): string[] {
  if (
    bestDeltaPp !== null &&
    bestDeltaPp > 0 &&
    (bestCasesPerCategory ?? 0) >= 10
  ) {
    return [];
  }

  const priority = getVariantPriorityForBucket(dominantBucket);

  return [...priority, ...KNOWN_RALPH_VARIANTS]
    .filter((variant, index, items) => items.indexOf(variant) === index)
    .filter((variant) => !testedVariants.includes(variant))
    .slice(0, 4);
}

function getVariantPriorityForBucket(dominantBucket: string | null): string[] {
  const bucketPriorities: Record<string, string[]> = {
    inference_error: ["schema-lock", "minimal", "coverage"],
    missing_args: ["coverage", "schema-lock", "strict"],
    planning: ["parallel-safe", "call-count", "coverage"],
    provider_error: ["minimal"],
    schema_mismatch: ["schema-lock", "strict", "coverage"],
    timeout: ["minimal", "compact", "default"],
    tool_selection: ["schema-lock", "strict", "minimal"],
  };
  return (
    (dominantBucket ? bucketPriorities[dominantBucket] : null) ?? [
      "schema-lock",
      "minimal",
      "coverage",
      "parallel-safe",
    ]
  );
}

function defaultJobLauncher(request: BenchLabJobRequest): BenchLabLaunchedJob {
  mkdirSync(dirname(request.stdoutPath), { recursive: true });
  mkdirSync(dirname(request.stderrPath), { recursive: true });
  const stdoutStream = createWriteStream(request.stdoutPath, { flags: "w" });
  const stderrStream = createWriteStream(request.stderrPath, { flags: "w" });
  const child = spawn(request.command, request.args, {
    cwd: request.cwd,
    env: request.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);

  const completion = new Promise<number>((resolvePromise, rejectPromise) => {
    child.once("error", (error) => {
      stdoutStream.end();
      stderrStream.end();
      rejectPromise(error);
    });
    child.once("close", (code) => {
      stdoutStream.end();
      stderrStream.end();
      resolvePromise(code ?? 1);
    });
  });

  return {
    pid: child.pid ?? null,
    kill: (signal = "SIGTERM") => {
      child.kill(signal);
    },
    completion,
  };
}

function serializeJob(job: BenchLabJobRecord): JsonObject {
  return {
    id: job.id,
    mode: job.mode,
    modelsFileName: job.modelsFileName,
    modelsFilePath: job.modelsFilePath,
    runtimeName: job.runtimeName,
    runtimeRoot: job.runtimeRoot,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    exitCode: job.exitCode,
    pid: job.pid,
    command: job.command,
    errorMessage: job.errorMessage,
    stdoutRelativePath: relative(job.runtimeRoot, job.stdoutPath),
    stderrRelativePath: relative(job.runtimeRoot, job.stderrPath),
  };
}

function readJobLogs(
  job: BenchLabJobRecord,
  stream: "stdout" | "stderr" | "both",
  maxBytes: number
): JsonObject {
  const includeStdout = stream === "stdout" || stream === "both";
  const includeStderr = stream === "stderr" || stream === "both";
  return {
    jobId: job.id,
    runtimeName: job.runtimeName,
    stdout: includeStdout
      ? {
          relativePath: relative(job.runtimeRoot, job.stdoutPath),
          text: readTextTail(job.stdoutPath, maxBytes),
        }
      : null,
    stderr: includeStderr
      ? {
          relativePath: relative(job.runtimeRoot, job.stderrPath),
          text: readTextTail(job.stderrPath, maxBytes),
        }
      : null,
  };
}

function attachJobCompletion(options: {
  job: BenchLabJobRecord;
  completion: Promise<number>;
  logger: Logger;
  stderrPath: string;
}): void {
  const { completion, job, logger, stderrPath } = options;
  completion
    .then((exitCode) => {
      job.exitCode = exitCode;
      job.endedAt = nowIso();
      if (job.status === "cancelled") {
        return;
      }
      job.status = exitCode === 0 ? "completed" : "failed";
      if (exitCode !== 0) {
        job.errorMessage =
          readTextIfExists(stderrPath)?.trim() || `exit code ${exitCode}`;
      }
    })
    .catch((error) => {
      job.endedAt = nowIso();
      job.exitCode = 1;
      job.status = "failed";
      job.errorMessage = toErrorMessage(error);
      logger.error("[benchlab] job failed", error);
    })
    .finally(() => {
      job.kill = null;
    });
}

function determinePrimaryOutcome(counts: Record<string, number>): string {
  if ((counts.failed ?? 0) > 0) {
    return "failed";
  }
  if ((counts.improved ?? 0) > 0) {
    return "improved";
  }
  if ((counts.regressed ?? 0) > 0) {
    return "regressed";
  }
  if ((counts.flat ?? 0) > 0) {
    return "flat";
  }
  if ((counts.preflight_ok ?? 0) > 0) {
    return "preflight_ok";
  }
  if ((counts.completed ?? 0) > 0) {
    return "completed";
  }
  return "unknown";
}

function readRuntimeSummary(runtimeRoot: string): BenchLabRuntimeSummary {
  const name = relative(resolve(runtimeRoot, ".."), runtimeRoot) || runtimeRoot;
  const summaryPath = join(runtimeRoot, "matrix_summary.json");
  const reportPath = join(runtimeRoot, "matrix_report.md");
  const summary = readJsonIfExists(summaryPath);
  const reportMarkdown = readTextIfExists(reportPath);
  const summaryCounts =
    summary && typeof summary.counts === "object" && summary.counts !== null
      ? (summary.counts as Record<string, number>)
      : {};

  let updatedAt: string | null = null;
  try {
    const sourcePath = existsSync(summaryPath) ? summaryPath : runtimeRoot;
    updatedAt = statSync(sourcePath).mtime.toISOString();
  } catch {
    updatedAt = null;
  }

  return {
    name,
    runtimeRoot,
    updatedAt,
    counts: summaryCounts,
    primaryOutcome: determinePrimaryOutcome(summaryCounts),
    categories: Array.isArray(summary?.categories)
      ? summary.categories.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    casesPerCategory:
      typeof summary?.cases_per_category === "number"
        ? summary.cases_per_category
        : null,
    preflightOnly:
      typeof summary?.preflight_only === "boolean"
        ? summary.preflight_only
        : null,
    modelsFileName:
      typeof summary?.models_file === "string"
        ? (summary.models_file.split(sep).pop() ?? summary.models_file)
        : null,
    reportMarkdown,
  };
}

function listRuntimeRoots(matrixRoot: string): string[] {
  if (!existsSync(matrixRoot)) {
    return [];
  }
  return readdirSync(matrixRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runtime"))
    .map((entry) => join(matrixRoot, entry.name));
}

function readRuntimeModelSummary(
  repoRoot: string,
  runtimeName: string,
  runtimeRoot: string,
  modelRunRoot: string
): BenchLabRuntimeModelSummary {
  const summaryPath = join(modelRunRoot, "summary.json");
  const reportPath = join(modelRunRoot, "benchmark_report.md");
  const stdoutPath = join(modelRunRoot, "stdout.log");
  const stderrPath = join(modelRunRoot, "stderr.log");
  const summary = readJsonIfExists(summaryPath);
  const reportMarkdown = readTextIfExists(reportPath);
  const stdoutText = readTextTail(stdoutPath, 20_000);
  const stderrText = readTextTail(stderrPath, 20_000);

  const metrics =
    summary?.metrics_percent_point &&
    typeof summary.metrics_percent_point === "object"
      ? (summary.metrics_percent_point as Record<string, unknown>)
      : null;
  const overall =
    metrics?.["Overall Acc"] && typeof metrics["Overall Acc"] === "object"
      ? (metrics["Overall Acc"] as Record<string, unknown>)
      : null;
  const baselineScore = toFiniteNumber(overall?.baseline);
  const ralphScore = toFiniteNumber(overall?.ralph);
  const deltaPp = toFiniteNumber(overall?.delta);

  let updatedAt: string | null = null;
  try {
    updatedAt = statSync(summaryPath).mtime.toISOString();
  } catch {
    try {
      updatedAt = statSync(modelRunRoot).mtime.toISOString();
    } catch {
      updatedAt = null;
    }
  }

  const progress = readRuntimeModelProgress(stdoutText, stderrText);
  const isRunning = progress.current !== null || progress.phase !== null;
  let status: BenchLabRuntimeModelSummary["status"] = "pending";
  if (summary) {
    status = "completed";
  } else if (isRunning) {
    status = "running";
  }

  return {
    baselineScore,
    casesPerCategory:
      typeof summary?.cases_per_category === "number"
        ? summary.cases_per_category
        : null,
    categories: Array.isArray(summary?.categories)
      ? summary.categories.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    deltaPp,
    executionPhase: progress.phase,
    modelName: parseBenchmarkReportField(reportMarkdown, "Model"),
    name: relative(join(runtimeRoot, "runs"), modelRunRoot),
    outcome: determineArtifactOutcome(deltaPp),
    providerName: parseBenchmarkReportField(reportMarkdown, "Provider"),
    progressCurrent: progress.current,
    progressPercent: progress.percent,
    progressTotal: progress.total,
    ralphScore,
    relativeDeltaPercent: computeRelativeDeltaPercent(baselineScore, deltaPp),
    reportRelativePath: existsSync(reportPath)
      ? toRepoRelativePath(repoRoot, reportPath)
      : null,
    runtimeName,
    runtimeRoot,
    status,
    summaryRelativePath: existsSync(summaryPath)
      ? toRepoRelativePath(repoRoot, summaryPath)
      : null,
    updatedAt,
  };
}

function readRuntimeModelProgress(
  stdoutText: string | null,
  stderrText: string | null
): {
  current: number | null;
  percent: number | null;
  phase: string | null;
  total: number | null;
} {
  const combined = `${stdoutText ?? ""}\n${stderrText ?? ""}`;
  const progressMatches = [
    ...combined.matchAll(
      /Generating results for (.+):\s+(\d+)%.*?(\d+)\/(\d+)/g
    ),
  ];
  const latestProgress = progressMatches.at(-1);
  if (latestProgress) {
    return {
      phase: latestProgress[1]?.trim() || null,
      percent: Number.parseInt(latestProgress[2] ?? "", 10) || null,
      current: Number.parseInt(latestProgress[3] ?? "", 10) || null,
      total: Number.parseInt(latestProgress[4] ?? "", 10) || null,
    };
  }

  const phaseMatches = [
    ...combined.matchAll(/Generating results for \[(.+)\]/g),
  ];
  const latestPhase = phaseMatches.at(-1);
  return {
    current: null,
    percent: null,
    phase: latestPhase?.[1]?.trim() || null,
    total: null,
  };
}

function listRuntimeModelSummaries(
  repoRoot: string,
  runtimeName: string,
  runtimeRoot: string
): BenchLabRuntimeModelSummary[] {
  const runsRoot = join(runtimeRoot, "runs");
  if (!existsSync(runsRoot)) {
    return [];
  }

  const outcomeRank: Record<BenchLabArtifactOutcome, number> = {
    improved: 0,
    flat: 1,
    regressed: 2,
    unknown: 3,
  };
  const statusRank: Record<BenchLabRuntimeModelSummary["status"], number> = {
    running: 0,
    pending: 1,
    completed: 2,
  };

  return readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      readRuntimeModelSummary(
        repoRoot,
        runtimeName,
        runtimeRoot,
        join(runsRoot, entry.name)
      )
    )
    .sort((left, right) => {
      const leftStatusRank = statusRank[left.status];
      const rightStatusRank = statusRank[right.status];
      if (leftStatusRank !== rightStatusRank) {
        return leftStatusRank - rightStatusRank;
      }
      const leftRank = outcomeRank[left.outcome];
      const rightRank = outcomeRank[right.outcome];
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      const leftDelta = left.deltaPp ?? Number.NEGATIVE_INFINITY;
      const rightDelta = right.deltaPp ?? Number.NEGATIVE_INFINITY;
      if (leftDelta !== rightDelta) {
        return rightDelta - leftDelta;
      }
      const leftTs = left.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightTs = right.updatedAt ? Date.parse(right.updatedAt) : 0;
      return rightTs - leftTs;
    });
}

function readRuntimeModelDetail(
  repoRoot: string,
  runtimeName: string,
  runtimeRoot: string,
  modelRunName: string
): JsonObject {
  const modelRunRoot = safeResolveWithin(
    join(runtimeRoot, "runs"),
    modelRunName
  );
  if (!existsSync(modelRunRoot)) {
    throw new HttpError(
      404,
      `model run not found: ${runtimeName}/${modelRunName}`
    );
  }

  const summary = readRuntimeModelSummary(
    repoRoot,
    runtimeName,
    runtimeRoot,
    modelRunRoot
  );
  return {
    forensics: readModelRunForensicsSummary(
      runtimeName,
      modelRunName,
      summary.modelName,
      summary.providerName,
      summary.outcome,
      join(modelRunRoot, "error_forensics.json")
    ),
    modelRun: summary,
    reportMarkdown: readTextIfExists(join(modelRunRoot, "benchmark_report.md")),
    summaryJson: readJsonIfExists(join(modelRunRoot, "summary.json")),
    stdout: readTextTail(join(modelRunRoot, "stdout.log"), 20_000),
    stderr: readTextTail(join(modelRunRoot, "stderr.log"), 20_000),
  };
}

function listRuntimeSummaries(matrixRoot: string): BenchLabRuntimeSummary[] {
  return listRuntimeRoots(matrixRoot)
    .map((runtimeRoot) => readRuntimeSummary(runtimeRoot))
    .sort((left, right) => {
      const leftTs = left.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightTs = right.updatedAt ? Date.parse(right.updatedAt) : 0;
      return rightTs - leftTs;
    });
}

function listConfigFiles(matrixRoot: string): BenchLabConfigDescriptor[] {
  if (!existsSync(matrixRoot)) {
    return [];
  }
  return readdirSync(matrixRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        extname(entry.name) === ".json" &&
        entry.name.startsWith("models")
    )
    .map((entry) => ({
      name: entry.name,
      path: join(matrixRoot, entry.name),
      isRecommended: entry.name === DEFAULT_MODELS_FILE_NAME,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseJobRequestBody(body: unknown): {
  mode: "benchmark" | "preflight";
  modelsFileName: string;
  runtimeName: string;
  modelIds: string[];
  categories: string[];
  casesPerCategory: number;
  numThreads: number;
  maxStepLimit: number;
} {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "body must be a JSON object");
  }

  const rawMode = toOptionalString((body as JsonObject).mode) ?? "benchmark";
  if (rawMode !== "benchmark" && rawMode !== "preflight") {
    throw new HttpError(400, "mode must be benchmark or preflight");
  }

  const modelsFileName =
    toOptionalString((body as JsonObject).modelsFile) ??
    DEFAULT_MODELS_FILE_NAME;

  return {
    mode: rawMode,
    modelsFileName,
    runtimeName: sanitizeRuntimeName(
      toOptionalString((body as JsonObject).runtimeName)
    ),
    modelIds: toOptionalStringArray((body as JsonObject).modelIds),
    categories: toOptionalStringArray((body as JsonObject).categories),
    casesPerCategory: toPositiveInt(
      (body as JsonObject).casesPerCategory,
      rawMode === "preflight" ? 3 : 5
    ),
    numThreads: toPositiveInt((body as JsonObject).numThreads, 1),
    maxStepLimit: toPositiveInt((body as JsonObject).maxStepLimit, 20),
  };
}

function resolvePythonExecutable(
  benchmarkRoot: string,
  explicitValue: string | undefined
): string {
  if (toOptionalString(explicitValue)) {
    return String(explicitValue);
  }
  const venvPython = join(benchmarkRoot, ".venv311", "bin", "python");
  if (existsSync(venvPython)) {
    return venvPython;
  }
  return "python3";
}

export function createBenchLabApiServer(
  options: BenchLabApiServerOptions = {}
) {
  const logger = options.logger ?? console;
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const benchmarkRoot = resolve(
    options.benchmarkRoot ??
      process.env.BFCL_ROOT ??
      "/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard"
  );
  const matrixRoot = join(repoRoot, "experiments", "prompt-bfcl-ralph-matrix");
  const matrixRunnerPath = join(repoRoot, DEFAULT_MATRIX_RUNNER_RELATIVE_PATH);
  const pythonExecutable = resolvePythonExecutable(
    benchmarkRoot,
    options.pythonExecutable ?? process.env.BENCHLAB_PYTHON_EXECUTABLE
  );
  const launchJob = options.jobLauncher ?? defaultJobLauncher;
  const jobs = new Map<string, BenchLabJobRecord>();

  function resolveConfigFile(name: string): BenchLabConfigDescriptor {
    const configs = listConfigFiles(matrixRoot);
    const match = configs.find((config) => config.name === name);
    if (!match) {
      throw new HttpError(404, `config not found: ${name}`);
    }
    return match;
  }

  function createJob(body: unknown): BenchLabJobRecord {
    const parsed = parseJobRequestBody(body);
    const config = resolveConfigFile(parsed.modelsFileName);
    const runtimeRoot = safeResolveWithin(matrixRoot, parsed.runtimeName);
    if (existsSync(runtimeRoot)) {
      throw new HttpError(409, `runtime already exists: ${parsed.runtimeName}`);
    }

    mkdirSync(runtimeRoot, { recursive: true });
    const command = [
      pythonExecutable,
      matrixRunnerPath,
      "--models-file",
      config.path,
      "--bfcl-root",
      benchmarkRoot,
      "--runtime-root",
      runtimeRoot,
      "--cases-per-category",
      String(parsed.casesPerCategory),
      "--num-threads",
      String(parsed.numThreads),
      "--max-step-limit",
      String(parsed.maxStepLimit),
    ];
    if (parsed.mode === "preflight") {
      command.push("--preflight-only");
    }
    if (parsed.modelIds.length > 0) {
      command.push("--model-ids", parsed.modelIds.join(","));
    }
    if (parsed.categories.length > 0) {
      command.push("--categories", parsed.categories.join(","));
    }

    const stdoutPath = join(runtimeRoot, "service-job.stdout.log");
    const stderrPath = join(runtimeRoot, "service-job.stderr.log");

    const launched = launchJob({
      command: command[0],
      args: command.slice(1),
      cwd: repoRoot,
      env: process.env,
      stdoutPath,
      stderrPath,
    });

    const job: BenchLabJobRecord = {
      id: `job-${randomUUID().slice(0, 8)}`,
      mode: parsed.mode,
      modelsFileName: config.name,
      modelsFilePath: config.path,
      runtimeName: parsed.runtimeName,
      runtimeRoot,
      status: "running",
      createdAt: nowIso(),
      startedAt: nowIso(),
      endedAt: null,
      exitCode: null,
      pid: launched.pid,
      command,
      errorMessage: null,
      stdoutPath,
      stderrPath,
      kill: launched.kill,
    };
    jobs.set(job.id, job);

    attachJobCompletion({
      job,
      completion: launched.completion,
      logger,
      stderrPath,
    });

    writeFileSync(
      join(runtimeRoot, "service-job.meta.json"),
      JSON.stringify(
        {
          jobId: job.id,
          mode: job.mode,
          createdAt: job.createdAt,
          modelsFileName: job.modelsFileName,
          command: job.command,
        },
        null,
        2
      )
    );

    return job;
  }

  function cancelJob(jobId: string): BenchLabJobRecord {
    const job = jobs.get(jobId);
    if (!job) {
      throw new HttpError(404, `job not found: ${jobId}`);
    }
    if (job.status !== "running" || job.kill === null) {
      throw new HttpError(409, `job is not running: ${jobId}`);
    }
    job.kill("SIGTERM");
    job.status = "cancelled";
    job.endedAt = nowIso();
    job.errorMessage = "cancelled by operator";
    return job;
  }

  function handleRootRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      (pathname !== "/" && pathname !== "/benchlab")
    ) {
      return false;
    }
    sendHtml(response, 200, renderBenchLabDemoHtml());
    return true;
  }

  function handleHealthRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (request.method !== "GET" || pathname !== "/health") {
      return false;
    }
    sendJson(response, 200, {
      ok: true,
      benchmarkRoot,
      matrixRoot,
      pythonExecutable,
      repoRoot,
    });
    return true;
  }

  function handleConfigsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (request.method !== "GET" || pathname !== "/v1/benchlab/configs") {
      return false;
    }
    sendJson(response, 200, {
      configs: listConfigFiles(matrixRoot).map((config) => ({
        isRecommended: config.isRecommended,
        name: config.name,
        relativePath: relative(repoRoot, config.path),
      })),
    });
    return true;
  }

  function handleJobsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (request.method !== "GET" || pathname !== "/v1/benchlab/jobs") {
      return false;
    }
    const serialized = [...jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(serializeJob);
    sendJson(response, 200, { jobs: serialized });
    return true;
  }

  function handleJobLogsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
    requestUrl: URL
  ): boolean {
    if (
      request.method !== "GET" ||
      !pathname.startsWith("/v1/benchlab/jobs/") ||
      !pathname.endsWith("/logs")
    ) {
      return false;
    }

    const jobId = decodeURIComponent(
      pathname.slice("/v1/benchlab/jobs/".length, -"/logs".length)
    );
    const job = jobs.get(jobId);
    if (!job) {
      throw new HttpError(404, `job not found: ${jobId}`);
    }

    const rawStream = requestUrl.searchParams.get("stream");
    const stream =
      rawStream === "stdout" || rawStream === "stderr" ? rawStream : "both";
    const rawMaxBytes = Number.parseInt(
      requestUrl.searchParams.get("maxBytes") ?? "",
      10
    );
    const maxBytes =
      Number.isFinite(rawMaxBytes) && rawMaxBytes > 0
        ? Math.min(rawMaxBytes, 200_000)
        : 20_000;

    sendJson(response, 200, {
      logs: readJobLogs(job, stream, maxBytes),
    });
    return true;
  }

  function handleJobDetailRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      !pathname.startsWith("/v1/benchlab/jobs/") ||
      pathname.endsWith("/logs")
    ) {
      return false;
    }

    const jobId = decodeURIComponent(
      pathname.slice("/v1/benchlab/jobs/".length)
    );
    const job = jobs.get(jobId);
    if (!job) {
      throw new HttpError(404, `job not found: ${jobId}`);
    }

    sendJson(response, 200, { job: serializeJob(job) });
    return true;
  }

  function handleCancelJobRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "POST" ||
      !pathname.startsWith("/v1/benchlab/jobs/") ||
      !pathname.endsWith("/cancel")
    ) {
      return false;
    }

    const jobId = decodeURIComponent(
      pathname.slice("/v1/benchlab/jobs/".length, -"/cancel".length)
    );
    const job = cancelJob(jobId);
    sendJson(response, 200, { job: serializeJob(job) });
    return true;
  }

  async function handleCreateJobRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): Promise<boolean> {
    if (request.method !== "POST" || pathname !== "/v1/benchlab/jobs") {
      return false;
    }
    const body = await readJsonBody(request);
    const job = createJob(body);
    sendJson(response, 202, { job: serializeJob(job) });
    return true;
  }

  function handleRunsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (request.method !== "GET" || pathname !== "/v1/benchlab/runs") {
      return false;
    }
    sendJson(response, 200, {
      runs: listRuntimeSummaries(matrixRoot),
    });
    return true;
  }

  function handleArtifactsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (request.method !== "GET" || pathname !== "/v1/benchlab/artifacts") {
      return false;
    }
    sendJson(response, 200, {
      artifacts: listArtifactSummaries(repoRoot),
    });
    return true;
  }

  function handleBestArtifactsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      pathname !== "/v1/benchlab/artifacts/best"
    ) {
      return false;
    }
    sendJson(response, 200, {
      artifacts: listBestArtifactSummaries(repoRoot),
    });
    return true;
  }

  function handleArtifactForensicsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      pathname !== "/v1/benchlab/artifacts/forensics"
    ) {
      return false;
    }
    sendJson(response, 200, listArtifactForensicsOverview(repoRoot));
    return true;
  }

  function handleArtifactDetailRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      !pathname.startsWith("/v1/benchlab/artifacts/")
    ) {
      return false;
    }

    const artifactId = decodeURIComponent(
      pathname.slice("/v1/benchlab/artifacts/".length)
    );
    const artifact = listArtifactSummaries(repoRoot).find(
      (entry) => entry.id === artifactId
    );
    if (!artifact) {
      throw new HttpError(404, `artifact not found: ${artifactId}`);
    }

    sendJson(response, 200, readArtifactDetail(repoRoot, artifact));
    return true;
  }

  function handleRunDetailRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      !pathname.startsWith("/v1/benchlab/runs/")
    ) {
      return false;
    }

    const runName = decodeURIComponent(
      pathname.slice("/v1/benchlab/runs/".length)
    );
    const runtimeRoot = safeResolveWithin(matrixRoot, runName);
    if (!existsSync(runtimeRoot)) {
      throw new HttpError(404, `runtime not found: ${runName}`);
    }

    sendJson(response, 200, {
      run: readRuntimeSummary(runtimeRoot),
    });
    return true;
  }

  function handleRunModelsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      !pathname.startsWith("/v1/benchlab/runs/") ||
      !pathname.endsWith("/models")
    ) {
      return false;
    }

    const runName = decodeURIComponent(
      pathname.slice("/v1/benchlab/runs/".length, -"/models".length)
    );
    const runtimeRoot = safeResolveWithin(matrixRoot, runName);
    if (!existsSync(runtimeRoot)) {
      throw new HttpError(404, `runtime not found: ${runName}`);
    }

    sendJson(response, 200, {
      modelRuns: listRuntimeModelSummaries(repoRoot, runName, runtimeRoot),
    });
    return true;
  }

  function handleRunForensicsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      !pathname.startsWith("/v1/benchlab/runs/") ||
      !pathname.endsWith("/forensics")
    ) {
      return false;
    }

    const runName = decodeURIComponent(
      pathname.slice("/v1/benchlab/runs/".length, -"/forensics".length)
    );
    const runtimeRoot = safeResolveWithin(matrixRoot, runName);
    if (!existsSync(runtimeRoot)) {
      throw new HttpError(404, `runtime not found: ${runName}`);
    }

    sendJson(response, 200, {
      forensics: readRuntimeForensicsSummary(
        runName,
        runtimeRoot,
        readRuntimeRecordSummaries(repoRoot, runName, runtimeRoot)
      ),
    });
    return true;
  }

  function handleRunModelDetailRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      !pathname.startsWith("/v1/benchlab/runs/") ||
      pathname.endsWith("/models") ||
      !pathname.includes("/models/")
    ) {
      return false;
    }

    const relativePath = pathname.slice("/v1/benchlab/runs/".length);
    const separatorIndex = relativePath.indexOf("/models/");
    if (separatorIndex < 0) {
      return false;
    }
    const runName = decodeURIComponent(relativePath.slice(0, separatorIndex));
    const modelRunName = decodeURIComponent(
      relativePath.slice(separatorIndex + "/models/".length)
    );
    const runtimeRoot = safeResolveWithin(matrixRoot, runName);
    if (!existsSync(runtimeRoot)) {
      throw new HttpError(404, `runtime not found: ${runName}`);
    }

    sendJson(
      response,
      200,
      readRuntimeModelDetail(repoRoot, runName, runtimeRoot, modelRunName)
    );
    return true;
  }

  function handleRuntimeCompareRoute(
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL
  ): boolean {
    if (
      request.method !== "GET" ||
      requestUrl.pathname !== "/v1/benchlab/compare"
    ) {
      return false;
    }

    const leftRuntime = toOptionalString(requestUrl.searchParams.get("left"));
    const rightRuntime = toOptionalString(requestUrl.searchParams.get("right"));
    if (!(leftRuntime && rightRuntime)) {
      throw new HttpError(400, "left and right query params are required");
    }

    sendJson(
      response,
      200,
      buildRuntimeCompare(repoRoot, matrixRoot, leftRuntime, rightRuntime)
    );
    return true;
  }

  function handleVariantLeaderboardsRoute(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ): boolean {
    if (
      request.method !== "GET" ||
      pathname !== "/v1/benchlab/leaderboards/variants"
    ) {
      return false;
    }

    sendJson(response, 200, listVariantLeaderboards(repoRoot, matrixRoot));
    return true;
  }

  type BenchLabRouteHandler = (
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL
  ) => boolean | Promise<boolean>;

  const routeHandlers: BenchLabRouteHandler[] = [
    (request, response, requestUrl) =>
      handleRootRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleHealthRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleConfigsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleJobsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleJobLogsRoute(request, response, requestUrl.pathname, requestUrl),
    (request, response, requestUrl) =>
      handleJobDetailRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleCancelJobRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleCreateJobRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleArtifactsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleBestArtifactsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleArtifactForensicsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleArtifactDetailRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleRuntimeCompareRoute(request, response, requestUrl),
    (request, response, requestUrl) =>
      handleVariantLeaderboardsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleRunModelsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleRunForensicsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleRunModelDetailRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleRunsRoute(request, response, requestUrl.pathname),
    (request, response, requestUrl) =>
      handleRunDetailRoute(request, response, requestUrl.pathname),
  ];

  return createServer(async (request, response) => {
    const requestUrl = parseRequestUrl(request.url);
    try {
      for (const handler of routeHandlers) {
        if (await handler(request, response, requestUrl)) {
          return;
        }
      }

      sendJson(response, 404, { error: "route not found" });
    } catch (error) {
      const httpError = toHttpError(error);
      logger.error("[benchlab] request failed", httpError.message);
      sendJson(response, httpError.statusCode, {
        error: httpError.message,
      });
    }
  });
}
