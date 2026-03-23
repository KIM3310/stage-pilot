export interface StagePilotRouteDescriptor {
  method: "GET" | "POST";
  path: string;
  purpose: string;
}

export const STAGEPILOT_READINESS_CONTRACT = "stagepilot-runtime-brief-v1";
export const STAGEPILOT_PLAN_REPORT_SCHEMA = "stagepilot-plan-report-v1";
export const STAGEPILOT_SUMMARY_PACK_ID = "stagepilot-summary-pack-v1";
export const STAGEPILOT_BENCHMARK_SUMMARY_SCHEMA =
  "stagepilot-benchmark-summary-v1";
export const STAGEPILOT_RUNTIME_SCORECARD_SCHEMA =
  "stagepilot-runtime-scorecard-v1";
export const STAGEPILOT_DEVELOPER_OPS_PACK_SCHEMA =
  "stagepilot-developer-ops-pack-v1";
export const STAGEPILOT_FAILURE_TAXONOMY_SCHEMA =
  "stagepilot-failure-taxonomy-v1";
export const STAGEPILOT_PROTOCOL_MATRIX_SCHEMA =
  "stagepilot-protocol-matrix-v1";
export const STAGEPILOT_PROVIDER_BENCHMARK_SCORECARD_SCHEMA =
  "stagepilot-provider-benchmark-scorecard-v1";
export const STAGEPILOT_PERF_EVIDENCE_PACK_SCHEMA =
  "stagepilot-perf-evidence-pack-v1";
export const STAGEPILOT_TRACE_OBSERVABILITY_PACK_SCHEMA =
  "stagepilot-trace-observability-pack-v1";
export const STAGEPILOT_REGRESSION_GATE_PACK_SCHEMA =
  "stagepilot-regression-gate-pack-v1";
export const STAGEPILOT_REVIEW_RESOURCE_PACK_SCHEMA =
  "stagepilot-review-resource-pack-v1";
export const STAGEPILOT_LIVE_REVIEW_SCHEMA = "stagepilot-live-review-run-v1";
const CSV_ROW_SPLIT_REGEX = /\r?\n/;

function buildStagePilotOperationalPosture(options: {
  benchmarkReadyForPromotion?: boolean;
  geminiHasApiKey: boolean;
  openClawConfigured: boolean;
}) {
  const blockers: string[] = [];
  if (!options.geminiHasApiKey) {
    blockers.push("gemini_api_key");
  }
  if (!options.openClawConfigured) {
    blockers.push("openclaw_delivery");
  }
  if (options.benchmarkReadyForPromotion === false) {
    blockers.push("benchmark_floor");
  }

  const liveReady = blockers.length === 0;
  return {
    blockers,
    mode: liveReady ? "live-ready" : "bounded-demo",
    summary: liveReady
      ? "Live integrations and benchmark floor support real evaluation runs."
      : `Keep this as a bounded bounded demo until ${blockers[0]} is cleared.`,
  };
}

function buildStagePilotProofAssets() {
  return [
    {
      label: "Validation data guide",
      path: "docs/validation-guide.md",
      kind: "doc",
    },
    {
      label: "Summary pack diagram",
      path: "docs/summary-pack.svg",
      kind: "diagram",
    },
    {
      label: "Latest benchmark snapshot",
      path: "docs/benchmarks/stagepilot-latest.json",
      kind: "report",
    },
    {
      label: "Runtime perf evidence",
      path: "docs/benchmarks/stagepilot-runtime-load-latest.json",
      kind: "report",
    },
    {
      label: "Trace observability evidence",
      path: "docs/benchmarks/stagepilot-trace-observability-latest.json",
      kind: "report",
    },
    {
      label: "Regression gate evidence",
      path: "docs/benchmarks/stagepilot-regression-gate-latest.json",
      kind: "report",
    },
    {
      label: "k6 load harness",
      path: "scripts/k6-runtime-scorecard.js",
      kind: "script",
    },
    {
      label: "Operator runbook",
      path: "docs/STAGEPILOT.md",
      kind: "doc",
    },
    {
      label: "BenchLab gains note",
      path: "docs/benchlab/TOOL_CALLING_GAINS.md",
      kind: "doc",
    },
    {
      label: "Review resource pack",
      path: "/v1/review-resource-pack",
      kind: "route",
    },
  ];
}

interface StagePilotBenchmarkSnapshot {
  caseCount: number;
  generatedAt: string | null;
  improvements: {
    loopVsBaseline: number | null;
    loopVsMiddleware: number | null;
    middlewareVsBaseline: number | null;
  };
  strategies: {
    baseline: number | null;
    middleware: number | null;
    ralphLoop: number | null;
  };
}

interface StagePilotPerfEvidenceArtifact {
  baseUrl: string;
  environment: string;
  generatedAt: string | null;
  observed: {
    avgDurationMs: number | null;
    checksPassRatePct: number | null;
    httpReqFailedRatePct: number | null;
    maxDurationMs: number | null;
    p95DurationMs: number | null;
    requestCount: number | null;
    routeMix: Array<{
      path: string;
      sharePct: number;
    }>;
  };
  scenario: {
    executor: string;
    iterations: number | null;
    maxDuration: string;
    vus: number | null;
  };
  thresholds: {
    httpReqDurationP95: string;
    httpReqFailed: string;
  };
  tool: string;
}

interface StagePilotTraceObservabilityArtifact {
  evaluationTier: string;
  generatedAt: string | null;
  hotspots: Array<{
    attentionCount: number;
    providerFamily: string;
    risk: string;
  }>;
  regressionGate: {
    failCount: number | null;
    gate: string;
    passCount: number | null;
    rule: string;
    watchCount: number | null;
  };
  tool: string;
  traces: Array<{
    durationMs: number | null;
    failureClass: string;
    operatorHandoff: string;
    protocolFamily: string;
    providerFamily: string;
    regressionGate: string;
    dashboardSurface: string;
    scenario: string;
    traceId: string;
  }>;
}

interface StagePilotRegressionGateArtifact {
  gates: Array<{
    decision: string;
    focus: string;
    gate: string;
    owner: string;
    signal: string;
  }>;
  generatedAt: string | null;
  releaseRecommendation: {
    nextStep: string;
    posture: string;
    summary: string;
  };
  scoreSummary: {
    failCount: number | null;
    passCount: number | null;
    watchCount: number | null;
  };
  tool: string;
}

function buildStrategyRows(snapshot: StagePilotBenchmarkSnapshot) {
  return [
    {
      strategy: "baseline",
      successRate: snapshot.strategies.baseline,
    },
    {
      strategy: "middleware",
      successRate: snapshot.strategies.middleware,
    },
    {
      strategy: "middleware+ralph-loop",
      successRate: snapshot.strategies.ralphLoop,
    },
  ].filter((item) => typeof item.successRate === "number");
}

export function buildStagePilotRouteDescriptors(): StagePilotRouteDescriptor[] {
  return [
    {
      method: "GET",
      path: "/demo",
      purpose: "Interactive StagePilot judge console",
    },
    {
      method: "GET",
      path: "/health",
      purpose: "Lightweight service health probe",
    },
    {
      method: "GET",
      path: "/v1/meta",
      purpose: "Runtime defaults, routes, and integration readiness",
    },
    {
      method: "GET",
      path: "/v1/runtime-brief",
      purpose: "Operator readiness brief and runtime posture",
    },
    {
      method: "GET",
      path: "/v1/summary-pack",
      purpose: "Benchmark-backed validation data pack",
    },
    {
      method: "GET",
      path: "/v1/review-resource-pack",
      purpose:
        "Checked-in review scenarios, operator checks, and benchmark playbooks",
    },
    {
      method: "GET",
      path: "/v1/runtime-scorecard",
      purpose:
        "Operational scorecard for live traffic, route pressure, and benchmark-backed readiness",
    },
    {
      method: "GET",
      path: "/v1/failure-taxonomy",
      purpose:
        "Failure classes for parser drift, retry exhaustion, delivery gaps, and escalation risk",
    },
    {
      method: "GET",
      path: "/v1/protocol-matrix",
      purpose:
        "Cross-protocol coverage surface for XML, Hermes, Qwen, and YAML tool-call contracts",
    },
    {
      method: "GET",
      path: "/v1/provider-benchmark-scorecard",
      purpose:
        "Provider-facing scorecard for contract confidence, latency/cost posture, and strongest protocol surfaces",
    },
    {
      method: "GET",
      path: "/v1/perf-evidence-pack",
      purpose:
        "Checked-in load and latency evidence surface for runtime pressure, guardrails, and operator-facing scale posture",
    },
    {
      method: "GET",
      path: "/v1/trace-observability-pack",
      purpose:
        "Checked-in trace bundle for frontier failure replay, regression gates, and operator-facing escalation posture",
    },
    {
      method: "GET",
      path: "/v1/regression-gate-pack",
      purpose:
        "Checked-in gate board for frontier promotion posture, visible release decisions, and eval discipline",
    },
    {
      method: "GET",
      path: "/v1/benchmark-summary",
      purpose:
        "Summary of benchmark lift, weakest strategy, and promotion posture",
    },
    {
      method: "GET",
      path: "/v1/developer-ops-pack",
      purpose:
        "Developer workflow pack for MR triage, pipeline recovery, and guarded release handoff",
    },
    {
      method: "GET",
      path: "/v1/schema/plan-report",
      purpose: "Plan report contract for operators and downstream tools",
    },
    {
      method: "POST",
      path: "/v1/live-review-run",
      purpose: "Run the bounded public OpenAI evaluation scenario",
    },
    {
      method: "POST",
      path: "/v1/plan",
      purpose: "Run StagePilot planning and routing",
    },
    {
      method: "POST",
      path: "/v1/benchmark",
      purpose: "Run benchmark harness over sample cases",
    },
    {
      method: "POST",
      path: "/v1/insights",
      purpose: "Derive Gemini-backed narrative insights",
    },
    {
      method: "POST",
      path: "/v1/whatif",
      purpose: "Simulate staffing and demand deltas",
    },
    {
      method: "POST",
      path: "/v1/notify",
      purpose: "Deliver StagePilot result through OpenClaw channel",
    },
    {
      method: "POST",
      path: "/v1/openclaw/inbox",
      purpose: "Accept inbox-style commands and optional replies",
    },
    {
      method: "GET",
      path: "/v1/metrics",
      purpose:
        "Prometheus-compatible metrics endpoint for benchmark counts, parse rates, and latency histograms",
    },
  ];
}

export function buildStagePilotPlanReportSchema() {
  return {
    schema: STAGEPILOT_PLAN_REPORT_SCHEMA,
    requiredSections: ["eligibility", "safety", "plan", "judge"],
    evidenceFields: [
      "intake.caseId",
      "eligibility.referrals",
      "safety.slaMinutes",
      "plan.actions",
      "judge.score",
    ],
    operatorRules: [
      "Do not trust a fresh environment until Gemini and OpenClaw readiness are explicit.",
      "Keep planning, insights, and what-if outputs traceable to the same intake envelope.",
      "Treat notify delivery as a separate operator action even when plan synthesis succeeded.",
    ],
  };
}

export function buildStagePilotRuntimeBrief(options: {
  bodyTimeoutMs: number;
  dailyBudgetUsd: number;
  deploymentMode:
    | "artifact-refresh-only"
    | "public-capped-live"
    | "review-only-live";
  geminiHasApiKey: boolean;
  geminiTimeoutMs: number;
  killSwitch: boolean;
  lastLiveRunAt: string | null;
  liveModel: string;
  model: string;
  moderationEnabled: boolean;
  monthlyBudgetUsd: number;
  openClawConfigured: boolean;
  openClawHasWebhookUrl: boolean;
  publicLiveApi: boolean;
  service: string;
}) {
  const operationalPosture = buildStagePilotOperationalPosture({
    geminiHasApiKey: options.geminiHasApiKey,
    openClawConfigured: options.openClawConfigured,
  });
  const missingIntegrations = operationalPosture.blockers.filter(
    (blocker) => blocker === "gemini_api_key" || blocker === "openclaw_delivery"
  );
  let nextAction: string;
  if (options.publicLiveApi) {
    nextAction =
      "Run POST /v1/live-review-run with a fixed scenarioId to validate the bounded public evaluation lane.";
  } else if (missingIntegrations.length === 0) {
    nextAction =
      "Run POST /v1/plan or POST /v1/benchmark to validate live flows.";
  } else {
    nextAction = `Configure ${missingIntegrations[0]} to unlock live planning diagnostics.`;
  }

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    readinessContract: STAGEPILOT_READINESS_CONTRACT,
    deploymentMode: options.deploymentMode,
    publicLiveApi: options.publicLiveApi,
    liveModel: options.liveModel,
    dailyBudgetUsd: options.dailyBudgetUsd,
    monthlyBudgetUsd: options.monthlyBudgetUsd,
    killSwitch: options.killSwitch,
    moderationEnabled: options.moderationEnabled,
    lastLiveRunAt: options.lastLiveRunAt,
    headline:
      "Case-routing orchestration surface with explicit Gemini/OpenClaw readiness and report contracts.",
    reportContract: buildStagePilotPlanReportSchema(),
    integrations: {
      gemini: {
        hasApiKey: options.geminiHasApiKey,
        timeoutMs: options.geminiTimeoutMs,
        model: options.model,
      },
      openClaw: {
        configured: options.openClawConfigured,
        hasWebhookUrl: options.openClawHasWebhookUrl,
      },
    },
    requestLimits: {
      bodyTimeoutMs: options.bodyTimeoutMs,
    },
    reviewFlow: [
      "Check health and runtime brief before trusting live plan synthesis.",
      "Run /v1/live-review-run with a fixed scenarioId to inspect the bounded public evaluation lane.",
      "Run /v1/plan first, then enrich with /v1/insights and /v1/whatif.",
      "Treat /v1/notify as the final operator confirmation step.",
    ],
    watchouts: [
      "Missing Gemini credentials degrade narrative enrichment and live planning validation.",
      "Missing OpenClaw delivery keeps orchestration local even if planning succeeds.",
    ],
    routeCount: buildStagePilotRouteDescriptors().length,
    routes: buildStagePilotRouteDescriptors(),
    diagnostics: {
      integrationReady: missingIntegrations.length === 0,
      missingIntegrations,
      operationalPosture,
      nextAction,
    },
    links: {
      health: "/health",
      meta: "/v1/meta",
      runtimeBrief: "/v1/runtime-brief",
      reviewResourcePack: "/v1/review-resource-pack",
      summaryPack: "/v1/summary-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
      perfEvidencePack: "/v1/perf-evidence-pack",
      traceObservabilityPack: "/v1/trace-observability-pack",
      regressionGatePack: "/v1/regression-gate-pack",
      liveReviewRun: "/v1/live-review-run",
      failureTaxonomy: "/v1/failure-taxonomy",
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      benchmarkSummary: "/v1/benchmark-summary",
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      workflowReplay: "/v1/workflow-run-replay",
      planSchema: "/v1/schema/plan-report",
    },
  };
}

export function buildStagePilotReviewResourcePack(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  service: string;
}) {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const externalDir = path.join(
    process.cwd(),
    "data",
    "external",
    "incident_prompt_pack"
  );
  const incidentSummaryPath = path.join(externalDir, "Incident_response.txt");
  const supportCsvPath = path.join(externalDir, "customer_support_tickets.csv");
  const resourceScenarios = [
    {
      scenarioId: "parser-drift-recovery",
      focus:
        "Show why malformed tool envelopes need bounded retry plus explicit failure review.",
      nextSurface: "/v1/failure-taxonomy",
    },
    {
      scenarioId: "bounded-handoff-release",
      focus:
        "Keep notify delivery behind human confirmation even when plan synthesis succeeds.",
      nextSurface: "/v1/developer-ops-pack",
    },
    {
      scenarioId: "provider-family-review",
      focus:
        "Explain provider posture through protocol coverage, contract confidence, and benchmark lift.",
      nextSurface: "/v1/provider-benchmark-scorecard",
    },
    {
      scenarioId: "regression-gate-watch",
      focus:
        "Keep promotion decisions tied to trace evidence and explicit gate posture.",
      nextSurface: "/v1/regression-gate-pack",
    },
  ] as const;

  const operatorChecks = [
    {
      checkId: "confirm-runtime-brief",
      surface: "/v1/runtime-brief",
      whyItMatters:
        "Reviewers should confirm live readiness and request boundaries before any orchestration claim.",
    },
    {
      checkId: "open-resource-pack",
      surface: "/v1/review-resource-pack",
      whyItMatters:
        "Built-in scenarios and checks keep the repo reviewable without external keys.",
    },
    {
      checkId: "verify-benchmark-proof",
      surface: "/v1/summary-pack",
      whyItMatters:
        "Benchmark lift and handoff posture should stay visible in one surface.",
    },
    {
      checkId: "check-regression-gates",
      surface: "/v1/regression-gate-pack",
      whyItMatters:
        "Promotion posture needs explicit watch and rollback signals before release help.",
    },
  ] as const;

  const validationCases = [
    {
      caseId: "runtime-brief-contract",
      goal: "Runtime readiness and report contract should stay aligned before live review runs.",
      proofSurface: "/v1/runtime-brief",
    },
    {
      caseId: "provider-scorecard-path",
      goal: "Provider-family tradeoffs should stay grounded in protocol coverage and benchmark evidence.",
      proofSurface: "/v1/provider-benchmark-scorecard",
    },
    {
      caseId: "trace-and-gate-link",
      goal: "Trace observability and regression-gate posture should stay consistent across reviewed routes.",
      proofSurface: "/v1/trace-observability-pack",
    },
    {
      caseId: "summary-pack-boundary",
      goal: "Summary-pack claims should remain bounded by checked-in docs and runtime proof routes.",
      proofSurface: "/v1/summary-pack",
    },
  ] as const;

  const playbooks = [
    {
      playbookId: "runtime-first-review",
      entrySurface: "/v1/runtime-brief",
      handoffSurface: "/v1/summary-pack",
      focus:
        "Use when a reviewer needs the shortest trustworthy path from readiness to proof.",
    },
    {
      playbookId: "provider-tradeoff-review",
      entrySurface: "/v1/provider-benchmark-scorecard",
      handoffSurface: "/v1/protocol-matrix",
      focus:
        "Use when benchmark and protocol posture need to be explained together.",
    },
    {
      playbookId: "release-governor-review",
      entrySurface: "/v1/regression-gate-pack",
      handoffSurface: "/v1/developer-ops-pack",
      focus:
        "Use when the story is about promotion, rollback, and human-controlled delivery.",
    },
  ] as const;

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_REVIEW_RESOURCE_PACK_SCHEMA,
    headline:
      "Checked-in review resource pack that keeps StagePilot's strongest no-key walkthrough explicit.",
    summary: {
      scenarioCount: resourceScenarios.length,
      operatorCheckCount: operatorChecks.length,
      validationCaseCount: validationCases.length,
      playbookCount: playbooks.length,
      benchmarkCaseCount: options.benchmarkSnapshot.caseCount,
    },
    externalData: {
      present: fs.existsSync(externalDir),
      files: {
        incidentSummary: {
          path: "data/external/incident_prompt_pack/Incident_response.txt",
          present: fs.existsSync(incidentSummaryPath),
          sizeBytes: fs.existsSync(incidentSummaryPath)
            ? fs.statSync(incidentSummaryPath).size
            : 0,
        },
        supportTickets: {
          path: "data/external/incident_prompt_pack/customer_support_tickets.csv",
          present: fs.existsSync(supportCsvPath),
          sizeBytes: fs.existsSync(supportCsvPath)
            ? fs.statSync(supportCsvPath).size
            : 0,
          rowCount: countCsvRows(fs, supportCsvPath),
        },
      },
    },
    resourceScenarios,
    operatorChecks,
    validationCases,
    playbooks,
    reviewerFastPath: [
      "/v1/runtime-brief",
      "/v1/review-resource-pack",
      "/v1/provider-benchmark-scorecard",
      "/v1/trace-observability-pack",
      "/v1/regression-gate-pack",
      "/v1/summary-pack",
      "/v1/schema/plan-report",
    ],
    links: {
      runtimeBrief: "/v1/runtime-brief",
      reviewResourcePack: "/v1/review-resource-pack",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      traceObservabilityPack: "/v1/trace-observability-pack",
      regressionGatePack: "/v1/regression-gate-pack",
      summaryPack: "/v1/summary-pack",
      planSchema: "/v1/schema/plan-report",
    },
  };
}

function countCsvRows(fs: typeof import("node:fs"), filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return 0;
  }
  return Math.max(0, raw.split(CSV_ROW_SPLIT_REGEX).length - 1);
}

export function buildStagePilotBenchmarkSummary(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  minSuccessRate?: number | null;
  service: string;
  strategy?: string | null;
}) {
  const minSuccessRate =
    typeof options.minSuccessRate === "number" &&
    Number.isFinite(options.minSuccessRate)
      ? Math.max(0, Math.min(100, options.minSuccessRate))
      : null;
  const strategyFilter =
    typeof options.strategy === "string" && options.strategy.trim().length > 0
      ? options.strategy.trim().toLowerCase()
      : null;
  const strategies = buildStrategyRows(options.benchmarkSnapshot);
  const filteredStrategies = strategies.filter((item) => {
    if (minSuccessRate !== null && (item.successRate ?? 0) < minSuccessRate) {
      return false;
    }
    if (strategyFilter !== null && item.strategy !== strategyFilter) {
      return false;
    }
    return true;
  });
  const ranked = [...strategies].sort(
    (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
  );
  const topStrategy = ranked[0] ?? null;
  const weakestStrategy = ranked.at(-1) ?? null;

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_BENCHMARK_SUMMARY_SCHEMA,
    filters: {
      minSuccessRate,
      strategy: strategyFilter,
    },
    benchmark: {
      caseCount: options.benchmarkSnapshot.caseCount,
      generatedAt: options.benchmarkSnapshot.generatedAt,
      improvements: options.benchmarkSnapshot.improvements,
      topStrategy,
      weakestStrategy,
      readyCount: filteredStrategies.filter(
        (item) => weakestStrategy?.strategy !== item.strategy
      ).length,
      attentionCount: filteredStrategies.filter(
        (item) => weakestStrategy?.strategy === item.strategy
      ).length,
      strategies: filteredStrategies.map((item) => ({
        ...item,
        deltaFromTop:
          typeof topStrategy?.successRate === "number" &&
          typeof item.successRate === "number"
            ? Math.round((topStrategy.successRate - item.successRate) * 100) /
              100
            : null,
        status:
          weakestStrategy?.strategy === item.strategy ? "attention" : "ready",
      })),
    },
    operatorNotes: [
      "Review benchmark lift before claiming parser or loop recovery gains.",
      "Weakest strategy stays visible so regressions are not hidden by average lift.",
      "Use the summary as a promotion screen, then confirm with /v1/benchmark when changing runtime code.",
    ],
    links: {
      summaryPack: "/v1/summary-pack",
      benchmark: "/v1/benchmark",
      benchmarkSummary: "/v1/benchmark-summary",
      perfEvidencePack: "/v1/perf-evidence-pack",
      failureTaxonomy: "/v1/failure-taxonomy",
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      workflowReplay: "/v1/workflow-run-replay",
      runtimeBrief: "/v1/runtime-brief",
      runtimeScorecard: "/v1/runtime-scorecard",
    },
  };
}

export function buildStagePilotDeveloperOpsPack(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  lane?: string | null;
  service: string;
}) {
  const lane =
    typeof options.lane === "string" && options.lane.trim().length > 0
      ? options.lane.trim().toLowerCase()
      : "merge-request";
  const strategyRows = buildStrategyRows(options.benchmarkSnapshot).sort(
    (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
  );
  const topStrategy = strategyRows[0] ?? null;
  const laneMap = {
    "merge-request": {
      headline:
        "Use parser reliability and contract checks to keep merge-request review deterministic.",
      operatorFlow: [
        "Collect MR notes, changed-file summary, and evaluation instructions.",
        "Run plan generation through the same schema-safe parser surface used in benchmarked routing.",
        "Keep the final final decision separate from the agent recommendation.",
      ],
      guardrails: [
        "Do not auto-merge on tool output alone.",
        "Keep report contract stable before exposing results to operators.",
      ],
    },
    "pipeline-recovery": {
      headline:
        "Treat failing CI or automation as a triage lane with bounded recovery instead of free-form agent improvisation.",
      operatorFlow: [
        "Capture failing step context and relevant logs.",
        "Use benchmark-backed tool-call parsing before producing remediation actions.",
        "Escalate to a human release owner when confidence or tool output is weak.",
      ],
      guardrails: [
        "Do not rerun or mutate live infrastructure without team approval.",
        "Persist weakest strategy evidence so regressions stay visible.",
      ],
    },
    "release-governor": {
      headline:
        "Keep release automation reviewable by pairing runtime posture, benchmark proof, and explicit handoff gates.",
      operatorFlow: [
        "Start with runtime brief and scorecard before allowing release help.",
        "Check benchmark and developer-ops pack to understand the strongest and weakest automation lanes.",
        "Require human confirmation for final delivery or release communication.",
      ],
      guardrails: [
        "OpenClaw or downstream delivery is a final confirmed action, not implicit success.",
        "Review benchmark deltas before promoting any new agent strategy.",
      ],
    },
  } as const;
  const selectedLane =
    laneMap[lane as keyof typeof laneMap] ?? laneMap["merge-request"];

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_DEVELOPER_OPS_PACK_SCHEMA,
    lane:
      lane === "pipeline-recovery" || lane === "release-governor"
        ? lane
        : "merge-request",
    headline:
      "Developer ops pack that turns benchmarked tool-calling reliability into reviewable MR, pipeline, and release workflows.",
    lanes: Object.keys(laneMap),
    selectedLane,
    benchmark: {
      caseCount: options.benchmarkSnapshot.caseCount,
      generatedAt: options.benchmarkSnapshot.generatedAt,
      topStrategy,
      strategies: strategyRows,
    },
    proofRoutes: [
      "/v1/runtime-brief",
      "/v1/runtime-scorecard",
      "/v1/failure-taxonomy",
      "/v1/developer-ops-pack",
      "/v1/workflow-runs",
      "/v1/benchmark-summary",
      "/v1/summary-pack",
      "/v1/schema/plan-report",
    ],
    operatorNotes: [
      "Use the developer ops pack to explain where agent help stops and human release review begins.",
      "Benchmark lift matters because developer automation breaks first on malformed tool or workflow output.",
      "Keep the weakest strategy visible during demo and submission walkthroughs.",
    ],
    links: {
      runtimeBrief: "/v1/runtime-brief",
      runtimeScorecard: "/v1/runtime-scorecard",
      perfEvidencePack: "/v1/perf-evidence-pack",
      failureTaxonomy: "/v1/failure-taxonomy",
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      workflowReplay: "/v1/workflow-run-replay",
      benchmarkSummary: "/v1/benchmark-summary",
      summaryPack: "/v1/summary-pack",
      planSchema: "/v1/schema/plan-report",
    },
  };
}

export function buildStagePilotProtocolMatrix(options: { service: string }) {
  const protocols = [
    {
      id: "morph-xml",
      label: "Morph XML",
      providerSignals: [
        "XML-heavy frontier or Anthropic-style tool wrappers",
        "Nested tool payloads with explicit close-tag repair pressure",
      ],
      coverage: ["parse-generated-text", "stream", "pipeline"],
      failureHotspots: [
        "chunk-boundary tag drift",
        "self-closing edge cases",
        "repair-vs-strict boundary decisions",
      ],
      proofSurface: "src/__tests__/protocols/morph-xml-protocol",
      readiness: "ready",
    },
    {
      id: "hermes",
      label: "Hermes",
      providerSignals: [
        "Function-call wrappers from OpenAI-compatible runtimes",
        "Middleware-first contract normalization",
      ],
      coverage: ["formatters", "stream-compat", "middleware"],
      failureHotspots: [
        "tool-choice coercion",
        "wrapper fallback mismatch",
        "provider option drift",
      ],
      proofSurface: "src/__tests__/protocols/hermes-protocol",
      readiness: "ready",
    },
    {
      id: "qwen3coder",
      label: "Qwen3Coder",
      providerSignals: [
        "Local or OSS coding-model tool calls",
        "Wrapperless calls and literal tag collisions",
      ],
      coverage: ["core-parsing", "recovery", "format-roundtrip"],
      failureHotspots: [
        "implicit call wrappers",
        "literal closing-tag leakage",
        "boundary heuristics under streaming deltas",
      ],
      proofSurface: "src/__tests__/protocols/qwen3coder-protocol",
      readiness: "ready",
    },
    {
      id: "yaml-xml",
      label: "YAML XML hybrid",
      providerSignals: [
        "Structured agent outputs that mix YAML sections with XML-like tool envelopes",
        "Streaming-first contract proof for mixed formatting",
      ],
      coverage: ["stream", "multiline", "error-policy"],
      failureHotspots: [
        "multiline indentation drift",
        "text-boundary truncation",
        "error policy mismatch while streaming",
      ],
      proofSurface: "src/__tests__/protocols/yaml-xml-protocol",
      readiness: "ready",
    },
  ] as const;

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_PROTOCOL_MATRIX_SCHEMA,
    headline:
      "Cross-protocol matrix that makes StagePilot's parser and streaming coverage explicit before any provider-agnostic reliability claim.",
    summary: {
      protocolCount: protocols.length,
      readyCount: protocols.filter((item) => item.readiness === "ready").length,
      coverageAreas: [
        "parse-generated-text",
        "stream",
        "pipeline",
        "middleware",
      ],
      biggestWhy:
        "Provider-agnostic tool reliability only matters if protocol families and their failure hotspots are visible together.",
    },
    protocols,
    reviewPath: [
      "Start with /v1/protocol-matrix to see which protocol families are explicitly covered.",
      "Move to /v1/provider-benchmark-scorecard to see how those protocol families map to provider-facing latency, cost, and contract confidence posture.",
      "Then inspect /v1/failure-taxonomy to connect protocol drift to runtime risk and handoff posture.",
      "Finish on /v1/benchmark-summary and /v1/summary-pack so benchmark lift stays grounded in concrete protocol surfaces.",
    ],
    links: {
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      failureTaxonomy: "/v1/failure-taxonomy",
      benchmarkSummary: "/v1/benchmark-summary",
      developerOpsPack: "/v1/developer-ops-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
      summaryPack: "/v1/summary-pack",
    },
  };
}

export function buildStagePilotProviderBenchmarkScorecard(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  service: string;
}) {
  const baselineRate = options.benchmarkSnapshot.strategies.baseline ?? 0;
  const middlewareRate = options.benchmarkSnapshot.strategies.middleware ?? 0;
  const loopRate = options.benchmarkSnapshot.strategies.ralphLoop ?? 0;
  const parserLift =
    options.benchmarkSnapshot.improvements.middlewareVsBaseline ?? 0;
  const recoveryLift =
    options.benchmarkSnapshot.improvements.loopVsMiddleware ?? 0;
  const topStrategy =
    buildStrategyRows(options.benchmarkSnapshot).sort(
      (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
    )[0] ?? null;

  const providers = [
    {
      provider: "openai-compatible",
      posture: "review-ready",
      contractConfidencePct: Math.round(middlewareRate),
      latencyBandMs: "350-900",
      costBand: "high",
      dominantProtocols: [
        "Hermes",
        "tool wrappers",
        "middleware normalization",
      ],
      biggestRisk: "tool-choice coercion and wrapper drift",
      whyItMatters:
        "Shows how StagePilot hardens common function-call wrappers before downstream workflow automation.",
      proofRoutes: [
        "/v1/protocol-matrix",
        "/v1/benchmark-summary",
        "/v1/summary-pack",
      ],
    },
    {
      provider: "anthropic-xml-style",
      posture: loopRate >= 85 ? "review-ready" : "attention",
      contractConfidencePct: Math.round(
        Math.min(100, baselineRate + parserLift + recoveryLift)
      ),
      latencyBandMs: "700-1800",
      costBand: "high",
      dominantProtocols: ["Morph XML", "stream repair", "close-tag recovery"],
      biggestRisk: "chunk-boundary drift and repair-vs-strict parser decisions",
      whyItMatters:
        "Makes XML-heavy frontier runtimes legible by tying parser repair to a bounded retry posture.",
      proofRoutes: [
        "/v1/protocol-matrix",
        "/v1/failure-taxonomy",
        "/v1/runtime-scorecard",
      ],
    },
    {
      provider: "gemini-hybrid",
      posture: middlewareRate >= 80 ? "review-ready" : "attention",
      contractConfidencePct: Math.round((middlewareRate + loopRate) / 2),
      latencyBandMs: "500-1400",
      costBand: "medium-high",
      dominantProtocols: [
        "YAML/XML hybrid",
        "multiline streaming",
        "report contracts",
      ],
      biggestRisk: "multiline indentation drift under mixed structured output",
      whyItMatters:
        "Pairs live synthesis pressure with contract-safe output instead of relying on prompt-only compliance.",
      proofRoutes: [
        "/v1/runtime-brief",
        "/v1/provider-benchmark-scorecard",
        "/v1/benchmark-summary",
      ],
    },
    {
      provider: "local-oss",
      posture: baselineRate >= 65 ? "review-ready" : "attention",
      contractConfidencePct: Math.round(loopRate),
      latencyBandMs: "120-450",
      costBand: "low",
      dominantProtocols: [
        "Qwen3Coder",
        "wrapperless tool calls",
        "format roundtrip",
      ],
      biggestRisk: "literal tag leakage and weak wrapper assumptions",
      whyItMatters:
        "Shows that low-cost local inference still gets bounded recovery instead of being dismissed as a toy path.",
      proofRoutes: [
        "/v1/protocol-matrix",
        "/v1/developer-ops-pack",
        "/v1/workflow-run-replay",
      ],
    },
  ];

  const attentionCount = providers.filter(
    (item) => item.posture === "attention"
  ).length;

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_PROVIDER_BENCHMARK_SCORECARD_SCHEMA,
    headline:
      "Provider benchmark scorecard that turns protocol coverage into explicit contract-confidence, latency, and cost posture for frontier reviews.",
    summary: {
      providerCount: providers.length,
      reviewReadyCount: providers.length - attentionCount,
      attentionCount,
      benchmarkCaseCount: options.benchmarkSnapshot.caseCount,
      topStrategy,
      parserLiftPct: parserLift,
      recoveryLiftPct: recoveryLift,
    },
    providers,
    reviewPath: [
      "Start with /v1/provider-benchmark-scorecard to explain which provider families StagePilot can currently discuss without hand-waving.",
      "Open /v1/protocol-matrix to validate the contract families behind each provider posture.",
      "Use /v1/trace-observability-pack to connect provider posture to replayable traces and regression gates before claiming frontier-runtime depth.",
      "Use /v1/benchmark-summary and /v1/runtime-scorecard together before claiming production-like runtime reliability.",
    ],
    operatorNotes: [
      "Latency and cost bands are provider-family posture signals, not a claim of live production telemetry for every vendor.",
      "Contract confidence only stays credible when the protocol matrix and benchmark summary still agree.",
      "Use the scorecard to explain tradeoffs, then point to failure taxonomy before promising automation at the boundary.",
    ],
    links: {
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      protocolMatrix: "/v1/protocol-matrix",
      perfEvidencePack: "/v1/perf-evidence-pack",
      traceObservabilityPack: "/v1/trace-observability-pack",
      regressionGatePack: "/v1/regression-gate-pack",
      benchmarkSummary: "/v1/benchmark-summary",
      failureTaxonomy: "/v1/failure-taxonomy",
      runtimeScorecard: "/v1/runtime-scorecard",
      summaryPack: "/v1/summary-pack",
    },
  };
}

export function buildStagePilotPerfEvidencePack(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  perfArtifact: StagePilotPerfEvidenceArtifact;
  service: string;
}) {
  const topStrategy =
    buildStrategyRows(options.benchmarkSnapshot).sort(
      (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
    )[0] ?? null;
  const hottestRoute =
    [...options.perfArtifact.observed.routeMix].sort(
      (left, right) => right.sharePct - left.sharePct
    )[0] ?? null;

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_PERF_EVIDENCE_PACK_SCHEMA,
    headline:
      "Perf evidence pack that ties checked-in k6 rehearsal data to StagePilot's runtime, benchmark, and release guardrails.",
    summary: {
      tool: options.perfArtifact.tool,
      environment: options.perfArtifact.environment,
      benchmarkCaseCount: options.benchmarkSnapshot.caseCount,
      topStrategy,
      requestCount: options.perfArtifact.observed.requestCount,
      checksPassRatePct: options.perfArtifact.observed.checksPassRatePct,
      httpReqFailedRatePct: options.perfArtifact.observed.httpReqFailedRatePct,
      p95DurationMs: options.perfArtifact.observed.p95DurationMs,
      hottestRoute,
    },
    scenario: options.perfArtifact.scenario,
    thresholds: options.perfArtifact.thresholds,
    observedRun: {
      ...options.perfArtifact.observed,
      benchmarkGeneratedAt: options.benchmarkSnapshot.generatedAt,
      baseUrl: options.perfArtifact.baseUrl,
    },
    scaleGuardrails: [
      {
        guardrail: "bounded request surface",
        whyItMatters:
          "Load evidence only matters if plan and benchmark routes stay inside explicit timeout and schema boundaries.",
        surface: "/v1/runtime-brief",
      },
      {
        guardrail: "benchmark-backed reliability floor",
        whyItMatters:
          "The load run stays paired with protocol and benchmark proof so latency is never mistaken for correctness.",
        surface: "/v1/benchmark-summary",
      },
      {
        guardrail: "operator-confirmed delivery",
        whyItMatters:
          "Notify remains a final reviewed action, which keeps runtime pressure separate from downstream side effects.",
        surface: "/v1/developer-ops-pack",
      },
    ],
    reviewPath: [
      "Open /v1/perf-evidence-pack to see the checked-in runtime rehearsal before making scale claims.",
      "Pair it with /v1/runtime-scorecard so local load evidence and live route telemetry stay in the same story.",
      "Use /v1/provider-benchmark-scorecard and /v1/benchmark-summary to separate raw speed from contract-safe correctness.",
      "Finish on /v1/developer-ops-pack and /v1/summary-pack before describing production posture.",
    ],
    operatorNotes: [
      "This is a checked-in local rehearsal against the StagePilot backend, not a claim of internet-scale vendor telemetry.",
      "The strongest claim is bounded runtime discipline under reviewable load, not generic throughput bragging.",
      "Use the perf pack together with the benchmark and failure taxonomy before discussing frontier-runtime promotion.",
    ],
    proofAssets: [
      {
        label: "Latest runtime load artifact",
        path: "docs/benchmarks/stagepilot-runtime-load-latest.json",
        kind: "report",
      },
      {
        label: "k6 load harness",
        path: "scripts/k6-runtime-scorecard.js",
        kind: "script",
      },
      {
        label: "Latest benchmark snapshot",
        path: "docs/benchmarks/stagepilot-latest.json",
        kind: "report",
      },
    ],
    links: {
      perfEvidencePack: "/v1/perf-evidence-pack",
      runtimeBrief: "/v1/runtime-brief",
      runtimeScorecard: "/v1/runtime-scorecard",
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      traceObservabilityPack: "/v1/trace-observability-pack",
      regressionGatePack: "/v1/regression-gate-pack",
      benchmarkSummary: "/v1/benchmark-summary",
      developerOpsPack: "/v1/developer-ops-pack",
      summaryPack: "/v1/summary-pack",
    },
  };
}

export function buildStagePilotTraceObservabilityPack(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  service: string;
  traceArtifact: StagePilotTraceObservabilityArtifact;
}) {
  const topStrategy =
    buildStrategyRows(options.benchmarkSnapshot).sort(
      (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
    )[0] ?? null;
  const providerFamilyCount = new Set(
    options.traceArtifact.traces.map((item) => item.providerFamily)
  ).size;
  const slowestTrace =
    [...options.traceArtifact.traces].sort(
      (left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0)
    )[0] ?? null;

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_TRACE_OBSERVABILITY_PACK_SCHEMA,
    headline:
      "Trace observability pack that turns frontier-style failure replay, regression gates, and operator escalation posture into a checked-in proof surface.",
    summary: {
      benchmarkCaseCount: options.benchmarkSnapshot.caseCount,
      failCount: options.traceArtifact.regressionGate.failCount,
      gate: options.traceArtifact.regressionGate.gate,
      passCount: options.traceArtifact.regressionGate.passCount,
      providerFamilyCount,
      evaluationTier: options.traceArtifact.evaluationTier,
      slowestTrace,
      topStrategy,
      totalTraces: options.traceArtifact.traces.length,
      watchCount: options.traceArtifact.regressionGate.watchCount,
    },
    regressionGate: options.traceArtifact.regressionGate,
    hotspots: options.traceArtifact.hotspots,
    traces: options.traceArtifact.traces,
    reviewPath: [
      "Start with /v1/trace-observability-pack to see whether replayable traces and regression gates agree before discussing frontier-runtime maturity.",
      "Move to /v1/provider-benchmark-scorecard and /v1/protocol-matrix so each trace stays tied to a real contract family instead of generic model talk.",
      "Use /v1/failure-taxonomy to connect the trace bundle to explicit parser/runtime classes.",
      "Finish on /v1/perf-evidence-pack and /v1/summary-pack so replay evidence, load posture, and benchmark lift stay in one story.",
    ],
    operatorNotes: [
      "These traces are checked-in test artifacts, not a claim of internet-scale production telemetry.",
      "The regression gate is meaningful only when protocol, failure, and perf surfaces still agree.",
      "Use the slowest or watch traces to discuss debugging posture, not to imply unlimited provider coverage.",
    ],
    proofAssets: [
      {
        label: "Latest trace observability artifact",
        path: "docs/benchmarks/stagepilot-trace-observability-latest.json",
        kind: "report",
      },
      {
        label: "Latest runtime load artifact",
        path: "docs/benchmarks/stagepilot-runtime-load-latest.json",
        kind: "report",
      },
      {
        label: "Latest benchmark snapshot",
        path: "docs/benchmarks/stagepilot-latest.json",
        kind: "report",
      },
    ],
    links: {
      traceObservabilityPack: "/v1/trace-observability-pack",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      protocolMatrix: "/v1/protocol-matrix",
      perfEvidencePack: "/v1/perf-evidence-pack",
      failureTaxonomy: "/v1/failure-taxonomy",
      regressionGatePack: "/v1/regression-gate-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
      summaryPack: "/v1/summary-pack",
    },
  };
}

export function buildStagePilotRegressionGatePack(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  regressionArtifact: StagePilotRegressionGateArtifact;
  service: string;
}) {
  const topStrategy =
    buildStrategyRows(options.benchmarkSnapshot).sort(
      (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
    )[0] ?? null;
  const attentionCount = options.regressionArtifact.gates.filter(
    (item) => item.decision !== "pass"
  ).length;

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_REGRESSION_GATE_PACK_SCHEMA,
    headline:
      "Regression gate pack that compresses frontier promotion posture, release decisions, and visible eval discipline into one checked-in surface.",
    summary: {
      attentionCount,
      failCount: options.regressionArtifact.scoreSummary.failCount,
      gateCount: options.regressionArtifact.gates.length,
      passCount: options.regressionArtifact.scoreSummary.passCount,
      releasePosture: options.regressionArtifact.releaseRecommendation.posture,
      topStrategy,
      watchCount: options.regressionArtifact.scoreSummary.watchCount,
    },
    releaseRecommendation: options.regressionArtifact.releaseRecommendation,
    gates: options.regressionArtifact.gates,
    reviewPath: [
      "Start with /v1/regression-gate-pack to explain what would block or allow StagePilot promotion into a stronger frontier-runtime claim tier.",
      "Pair it with /v1/trace-observability-pack so each gate stays grounded in replay evidence instead of generic scorekeeping.",
      "Use /v1/perf-evidence-pack and /v1/provider-benchmark-scorecard to show that gate posture still matches runtime pressure and provider-family tradeoffs.",
      "Finish on /v1/summary-pack before summarizing the strongest public frontier signal.",
    ],
    operatorNotes: [
      "This is a checked-in release board, not a substitute for live production SLO ownership.",
      "The value is explicit promotion logic: what would make a benchmark claim stronger, weaker, or blocked.",
      "Use this pack when an interviewer asks how you decide whether a reliability surface is ready to be trusted more broadly.",
    ],
    proofAssets: [
      {
        label: "Latest regression gate artifact",
        path: "docs/benchmarks/stagepilot-regression-gate-latest.json",
        kind: "report",
      },
      {
        label: "Latest trace observability artifact",
        path: "docs/benchmarks/stagepilot-trace-observability-latest.json",
        kind: "report",
      },
      {
        label: "Latest benchmark snapshot",
        path: "docs/benchmarks/stagepilot-latest.json",
        kind: "report",
      },
    ],
    links: {
      regressionGatePack: "/v1/regression-gate-pack",
      traceObservabilityPack: "/v1/trace-observability-pack",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      perfEvidencePack: "/v1/perf-evidence-pack",
      benchmarkSummary: "/v1/benchmark-summary",
      summaryPack: "/v1/summary-pack",
    },
  };
}

export function buildStagePilotRuntimeScorecard(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  bodyTimeoutMs: number;
  geminiHasApiKey: boolean;
  openClawConfigured: boolean;
  runtimeTelemetry: {
    errorCount: number;
    lastErrorAt: string | null;
    lastRequestAt: string | null;
    requestCount: number;
    routeCounts: Array<{
      count: number;
      path: string;
    }>;
  };
  service: string;
}) {
  const strategies = buildStrategyRows(options.benchmarkSnapshot).sort(
    (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
  );
  const topStrategy = strategies[0] ?? null;
  const weakestStrategy = strategies.at(-1) ?? null;
  const readyForPromotion =
    Boolean(options.geminiHasApiKey && options.openClawConfigured) &&
    typeof topStrategy?.successRate === "number" &&
    topStrategy.successRate >= 80;
  const operationalPosture = buildStagePilotOperationalPosture({
    benchmarkReadyForPromotion: readyForPromotion,
    geminiHasApiKey: options.geminiHasApiKey,
    openClawConfigured: options.openClawConfigured,
  });
  const traffic =
    options.runtimeTelemetry.requestCount > 0
      ? {
          errorRatePct:
            Math.round(
              (options.runtimeTelemetry.errorCount /
                options.runtimeTelemetry.requestCount) *
                10_000
            ) / 100,
          routeCounts: options.runtimeTelemetry.routeCounts,
        }
      : {
          errorRatePct: 0,
          routeCounts: [],
        };

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_RUNTIME_SCORECARD_SCHEMA,
    runtime: {
      bodyTimeoutMs: options.bodyTimeoutMs,
      integrationsReady: options.geminiHasApiKey && options.openClawConfigured,
      geminiReady: options.geminiHasApiKey,
      openClawReady: options.openClawConfigured,
      routeCount: buildStagePilotRouteDescriptors().length,
    },
    traffic: {
      requestCount: options.runtimeTelemetry.requestCount,
      errorCount: options.runtimeTelemetry.errorCount,
      lastRequestAt: options.runtimeTelemetry.lastRequestAt,
      lastErrorAt: options.runtimeTelemetry.lastErrorAt,
      errorRatePct: traffic.errorRatePct,
      routeCounts: traffic.routeCounts,
    },
    benchmark: {
      caseCount: options.benchmarkSnapshot.caseCount,
      generatedAt: options.benchmarkSnapshot.generatedAt,
      topStrategy,
      weakestStrategy,
      readyForPromotion,
    },
    operationalPosture,
    recommendations: [
      options.geminiHasApiKey
        ? "Gemini readiness is present. Validate fresh planning runs after any prompt or parser change."
        : "Configure GEMINI_API_KEY to move from deterministic review surfaces to live synthesis validation.",
      options.openClawConfigured
        ? "OpenClaw delivery is configured. Keep notify as a final operator-confirmed step."
        : "Configure OpenClaw delivery before claiming end-to-end orchestration readiness.",
      options.runtimeTelemetry.errorCount > 0
        ? "Investigate failing routes before promoting the service as a stable operator loop."
        : "Runtime errors are currently absent in this process. Keep benchmark and live plan checks paired.",
    ],
    links: {
      health: "/health",
      meta: "/v1/meta",
      runtimeBrief: "/v1/runtime-brief",
      summaryPack: "/v1/summary-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
      perfEvidencePack: "/v1/perf-evidence-pack",
      failureTaxonomy: "/v1/failure-taxonomy",
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      benchmarkSummary: "/v1/benchmark-summary",
      workflowReplay: "/v1/workflow-run-replay",
      planSchema: "/v1/schema/plan-report",
    },
  };
}

export function buildStagePilotFailureTaxonomy(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  geminiHasApiKey: boolean;
  openClawConfigured: boolean;
  runtimeTelemetry: {
    errorCount: number;
    requestCount: number;
    routeCounts: Array<{
      count: number;
      path: string;
    }>;
  };
  service: string;
}) {
  const parserLift =
    options.benchmarkSnapshot.improvements.middlewareVsBaseline;
  const recoveryLift = options.benchmarkSnapshot.improvements.loopVsMiddleware;
  const baselineRate = options.benchmarkSnapshot.strategies.baseline;
  const loopRate = options.benchmarkSnapshot.strategies.ralphLoop;
  const topPressureRoutes = options.runtimeTelemetry.routeCounts.slice(0, 3);

  const failureModes = [
    {
      id: "parse-contract-drift",
      label: "Parse contract drift",
      severity: "high",
      stage: "parse",
      status:
        (typeof baselineRate === "number" && baselineRate < 70) ||
        (typeof parserLift === "number" && parserLift >= 15)
          ? "attention"
          : "ready",
      whyItBreaks:
        "Model output slips outside the expected tool/report contract and turns a planning request into manual cleanup work.",
      signals: [
        typeof baselineRate === "number"
          ? `Baseline success is ${baselineRate}% before parser hardening.`
          : "Baseline success rate is unavailable in the current snapshot.",
        typeof parserLift === "number"
          ? `Middleware lift versus baseline is ${parserLift} percentage points.`
          : "Middleware lift has not been captured yet.",
      ],
      dashboardSurfaces: [
        "/v1/benchmark-summary",
        "/v1/schema/plan-report",
        "/v1/summary-pack",
      ],
      mitigations: [
        "Keep the parser middleware and contract schema together in the evaluation path.",
        "Treat benchmark regressions as release blockers for automation-facing lanes.",
      ],
    },
    {
      id: "bounded-retry-exhaustion",
      label: "Bounded retry exhaustion",
      severity: "high",
      stage: "recover",
      status:
        (typeof loopRate === "number" && loopRate < 85) ||
        (typeof recoveryLift === "number" && recoveryLift < 5)
          ? "attention"
          : "ready",
      whyItBreaks:
        "Recovery loops stop helping once malformed tool output repeats or the retry budget is consumed without a contract-safe answer.",
      signals: [
        typeof loopRate === "number"
          ? `Middleware + Ralph-loop success is ${loopRate}%.`
          : "Loop-recovery success rate is unavailable in the current snapshot.",
        typeof recoveryLift === "number"
          ? `Loop lift versus middleware is ${recoveryLift} percentage points.`
          : "Loop lift has not been captured yet.",
      ],
      dashboardSurfaces: [
        "/v1/benchmark-summary",
        "/v1/developer-ops-pack",
        "/v1/workflow-run-replay",
      ],
      mitigations: [
        "Keep retries bounded and visible instead of silently looping until timeout.",
        "Use workflow replay to inspect which lane still needs human escalation.",
      ],
    },
    {
      id: "delivery-readiness-gap",
      label: "Delivery readiness gap",
      severity: "high",
      stage: "deliver",
      status:
        options.geminiHasApiKey && options.openClawConfigured
          ? "ready"
          : "attention",
      whyItBreaks:
        "A plan can look valid while live synthesis or downstream delivery is still unconfigured, turning the demo into a docs-only surface.",
      signals: [
        options.geminiHasApiKey
          ? "Live provider planning is configured."
          : "Live provider planning is not configured.",
        options.openClawConfigured
          ? "OpenClaw delivery is configured."
          : "OpenClaw delivery is not configured.",
      ],
      dashboardSurfaces: [
        "/v1/runtime-brief",
        "/v1/runtime-scorecard",
        "/v1/summary-pack",
      ],
      mitigations: [
        "Separate plan synthesis success from downstream delivery success.",
        "Keep runtime brief in the first review step before any live claim.",
      ],
    },
    {
      id: "observed-runtime-regressions",
      label: "Observed runtime regressions",
      severity: "medium",
      stage: "operate",
      status:
        options.runtimeTelemetry.requestCount > 0 &&
        options.runtimeTelemetry.errorCount === 0
          ? "ready"
          : "attention",
      whyItBreaks:
        "Confidence drops if the live runtime has no traffic proof or if requests are already erroring under light load.",
      signals: [
        `Observed requests in this process: ${options.runtimeTelemetry.requestCount}.`,
        `Observed errors in this process: ${options.runtimeTelemetry.errorCount}.`,
        topPressureRoutes.length > 0
          ? `Top pressure routes: ${topPressureRoutes
              .map((item) => `${item.path} (${item.count})`)
              .join(", ")}.`
          : "No route pressure has been observed in this process yet.",
      ],
      dashboardSurfaces: [
        "/v1/runtime-scorecard",
        "/v1/workflow-runs",
        "/v1/workflow-run-replay",
      ],
      mitigations: [
        "Keep workflow replay and runtime scorecard together when demoing developer lanes.",
        "Do not promote the runtime as reliable until request and error posture are visible.",
      ],
    },
  ];
  const attentionModes = failureModes.filter(
    (item) => item.status === "attention"
  );
  const topRisk = attentionModes[0] ?? failureModes[0];

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    schema: STAGEPILOT_FAILURE_TAXONOMY_SCHEMA,
    headline:
      "Failure taxonomy that keeps parser drift, retry limits, delivery gaps, and live runtime regressions explicit before any reliability claim.",
    summary: {
      categoryCount: failureModes.length,
      readyCount: failureModes.length - attentionModes.length,
      attentionCount: attentionModes.length,
      highestRisk: topRisk.id,
      benchmarkCaseCount: options.benchmarkSnapshot.caseCount,
      observedRequestCount: options.runtimeTelemetry.requestCount,
    },
    failureModes,
    reviewPath: [
      "Start on /v1/runtime-brief to separate missing integrations from true parser/runtime defects.",
      "Use /v1/benchmark-summary and /v1/schema/plan-report to explain why tool-call hardening exists.",
      "Finish on /v1/runtime-scorecard and /v1/workflow-run-replay to show live evaluation pressure and escalation paths.",
    ],
    links: {
      runtimeBrief: "/v1/runtime-brief",
      benchmarkSummary: "/v1/benchmark-summary",
      runtimeScorecard: "/v1/runtime-scorecard",
      failureTaxonomy: "/v1/failure-taxonomy",
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      workflowReplay: "/v1/workflow-run-replay",
      summaryPack: "/v1/summary-pack",
      planSchema: "/v1/schema/plan-report",
    },
  };
}

export function buildStagePilotSummaryPack(options: {
  benchmarkSnapshot: StagePilotBenchmarkSnapshot;
  bodyTimeoutMs: number;
  geminiHasApiKey: boolean;
  model: string;
  openClawConfigured: boolean;
  openClawHasWebhookUrl: boolean;
  service: string;
}) {
  const strategyRows = buildStrategyRows(options.benchmarkSnapshot);
  const benchmarkReadyForPromotion =
    options.geminiHasApiKey &&
    options.openClawConfigured &&
    strategyRows.some(
      (item) =>
        item.strategy === "middleware+ralph-loop" &&
        typeof item.successRate === "number" &&
        item.successRate >= 80
    );
  const operationalPosture = buildStagePilotOperationalPosture({
    benchmarkReadyForPromotion,
    geminiHasApiKey: options.geminiHasApiKey,
    openClawConfigured: options.openClawConfigured,
  });
  const reviewResourcePack = buildStagePilotReviewResourcePack({
    benchmarkSnapshot: options.benchmarkSnapshot,
    service: options.service,
  });
  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    summaryPackId: STAGEPILOT_SUMMARY_PACK_ID,
    headline:
      "Parser hardening, bounded retry, and orchestration handoff proof now live in one user-facing surface.",
    operatorJourney: [
      {
        stage: "Collect",
        summary:
          "Intake payloads enter one bounded case envelope with fixed body timeout and schema-safe defaults.",
        surface: "/v1/plan",
      },
      {
        stage: "Parse + Plan",
        summary:
          "Parser middleware and StagePilot agents keep malformed tool-style outputs reviewable instead of silent-failing.",
        surface: "@ai-sdk-tool/parser + StagePilotEngine",
      },
      {
        stage: "Benchmark",
        summary:
          "Deterministic benchmark snapshots show the lift from baseline to middleware to bounded Ralph-loop recovery.",
        surface: "docs/benchmarks/stagepilot-latest.json",
      },
      {
        stage: "Deliver",
        summary:
          "OpenClaw delivery remains a final operator-confirmed step, separate from plan synthesis success.",
        surface: "/v1/notify",
      },
    ],
    trustBoundary: [
      "Gemini integration improves live planning and insights, but benchmark proof remains reproducible without network LLM latency.",
      "Parser and orchestration surfaces stay inspectable through explicit report contracts instead of opaque tool-call success claims.",
      "Notify delivery is not treated as implicit success; operators still confirm the final handoff path.",
    ],
    reviewSequence: [
      "Check /v1/runtime-brief to confirm Gemini and OpenClaw readiness before trusting live synthesis.",
      "Inspect /v1/provider-benchmark-scorecard and /v1/failure-taxonomy to validate provider tradeoffs, parser posture, and operator handoff boundaries.",
      "Run /v1/plan and /v1/benchmark before promoting any routing claim or delivery workflow.",
    ],
    twoMinuteReview: [
      {
        step: "1. Runtime brief",
        surface: "/v1/runtime-brief",
        proof:
          "Confirm Gemini/OpenClaw readiness and request boundary before trusting orchestration.",
      },
      {
        step: "2. Review resource pack",
        surface: "/v1/review-resource-pack",
        proof:
          "Inspect fixed scenarios, operator checks, and validation cases before moving into benchmark or live lanes.",
      },
      {
        step: "3. Failure posture",
        surface: "/v1/failure-taxonomy -> /v1/summary-pack",
        proof:
          "Validate benchmark deltas, replayable traces, delivery gaps, and runtime failure classes before repeating any claim.",
      },
      {
        step: "4. Contract boundary",
        surface: "/v1/regression-gate-pack -> /v1/schema/plan-report",
        proof:
          "Check promotion posture, report sections, and operator rules before handing output to downstream tools.",
      },
      {
        step: "5. Operator proof",
        surface: "docs/summary-pack.svg -> docs/STAGEPILOT.md",
        proof:
          "Read the end-to-end orchestration and handoff shape without tracing the full source tree.",
      },
    ],
    evidenceBundle: {
      benchmark: options.benchmarkSnapshot,
      benchmarkSummarySchema: STAGEPILOT_BENCHMARK_SUMMARY_SCHEMA,
      providerBenchmarkScorecardSchema:
        STAGEPILOT_PROVIDER_BENCHMARK_SCORECARD_SCHEMA,
      evaluationPosture: {
        runtimeSourceOfTruth:
          "@ai-sdk-tool/parser package plus /v1/runtime-brief and /v1/summary-pack",
        docsOnlySurfaces: ["docs/summary-pack.svg", "site/"],
        claimTier: benchmarkReadyForPromotion
          ? "runtime-backed-review-ready"
          : "bounded-review-demo",
        claimRule:
          "Treat static/docs surfaces as supporting docs, then repeat runtime claims only after the benchmark and live summary-pack surfaces agree.",
      },
      runtimeScorecardSchema: STAGEPILOT_RUNTIME_SCORECARD_SCHEMA,
      perfEvidencePackSchema: STAGEPILOT_PERF_EVIDENCE_PACK_SCHEMA,
      traceObservabilityPackSchema: STAGEPILOT_TRACE_OBSERVABILITY_PACK_SCHEMA,
      regressionGatePackSchema: STAGEPILOT_REGRESSION_GATE_PACK_SCHEMA,
      integrationsReady: options.geminiHasApiKey && options.openClawConfigured,
      operationalPosture,
      model: options.model,
      openClawHasWebhookUrl: options.openClawHasWebhookUrl,
      packageSurface: "@ai-sdk-tool/parser",
      planSchema: STAGEPILOT_PLAN_REPORT_SCHEMA,
      requestBodyTimeoutMs: options.bodyTimeoutMs,
      routeCount: buildStagePilotRouteDescriptors().length,
      reviewResourcePack: reviewResourcePack.summary,
    },
    proofAssets: buildStagePilotProofAssets(),
    links: {
      health: "/health",
      meta: "/v1/meta",
      runtimeBrief: "/v1/runtime-brief",
      reviewResourcePack: "/v1/review-resource-pack",
      summaryPack: "/v1/summary-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
      perfEvidencePack: "/v1/perf-evidence-pack",
      traceObservabilityPack: "/v1/trace-observability-pack",
      regressionGatePack: "/v1/regression-gate-pack",
      failureTaxonomy: "/v1/failure-taxonomy",
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      benchmarkSummary: "/v1/benchmark-summary",
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      workflowReplay: "/v1/workflow-run-replay",
      planSchema: "/v1/schema/plan-report",
      benchmark: "/v1/benchmark",
      demo: "/demo",
    },
  };
}
