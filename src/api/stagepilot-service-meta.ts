export interface StagePilotRouteDescriptor {
  method: "GET" | "POST";
  path: string;
  purpose: string;
}

export const STAGEPILOT_READINESS_CONTRACT = "stagepilot-runtime-brief-v1";
export const STAGEPILOT_PLAN_REPORT_SCHEMA = "stagepilot-plan-report-v1";
export const STAGEPILOT_REVIEW_PACK_ID = "stagepilot-review-pack-v1";
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
      ? "Live integrations and benchmark floor support real reviewer runs."
      : `Keep this as a bounded reviewer demo until ${blockers[0]} is cleared.`,
  };
}

function buildStagePilotProofAssets() {
  return [
    {
      label: "Reviewer proof guide",
      path: "docs/reviewer-proof-guide.md",
      kind: "doc",
    },
    {
      label: "Review pack diagram",
      path: "docs/review-pack.svg",
      kind: "diagram",
    },
    {
      label: "Latest benchmark snapshot",
      path: "docs/benchmarks/stagepilot-latest.json",
      kind: "report",
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
      path: "/v1/review-pack",
      purpose: "Benchmark-backed reviewer proof pack",
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
        "Failure classes for parser drift, retry exhaustion, delivery gaps, and reviewer handoff risk",
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
      path: "/v1/benchmark-summary",
      purpose:
        "Reviewer summary of benchmark lift, weakest strategy, and promotion posture",
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
      purpose: "Plan report contract for reviewers and downstream tools",
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
  geminiHasApiKey: boolean;
  geminiTimeoutMs: number;
  model: string;
  openClawConfigured: boolean;
  openClawHasWebhookUrl: boolean;
  service: string;
}) {
  const operationalPosture = buildStagePilotOperationalPosture({
    geminiHasApiKey: options.geminiHasApiKey,
    openClawConfigured: options.openClawConfigured,
  });
  const missingIntegrations = operationalPosture.blockers.filter(
    (blocker) => blocker === "gemini_api_key" || blocker === "openclaw_delivery"
  );

  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    readinessContract: STAGEPILOT_READINESS_CONTRACT,
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
      nextAction:
        missingIntegrations.length === 0
          ? "Run POST /v1/plan or POST /v1/benchmark to validate live flows."
          : `Configure ${missingIntegrations[0]} to unlock live planning diagnostics.`,
    },
    links: {
      health: "/health",
      meta: "/v1/meta",
      runtimeBrief: "/v1/runtime-brief",
      reviewPack: "/v1/review-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
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
    reviewerNotes: [
      "Review benchmark lift before claiming parser or loop recovery gains.",
      "Weakest strategy stays visible so regressions are not hidden by average lift.",
      "Use the summary as a promotion screen, then confirm with /v1/benchmark when changing runtime code.",
    ],
    links: {
      reviewPack: "/v1/review-pack",
      benchmark: "/v1/benchmark",
      benchmarkSummary: "/v1/benchmark-summary",
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
        "Collect MR notes, changed-file summary, and reviewer instructions.",
        "Run plan generation through the same schema-safe parser surface used in benchmarked routing.",
        "Keep the final reviewer decision separate from the agent recommendation.",
      ],
      guardrails: [
        "Do not auto-merge on tool output alone.",
        "Keep report contract stable before exposing results to reviewers.",
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
        "Do not rerun or mutate live infrastructure without reviewer approval.",
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
      "/v1/review-pack",
      "/v1/schema/plan-report",
    ],
    reviewerNotes: [
      "Use the developer ops pack to explain where agent help stops and human release review begins.",
      "Benchmark lift matters because developer automation breaks first on malformed tool or workflow output.",
      "Keep the weakest strategy visible during demo and submission walkthroughs.",
    ],
    links: {
      runtimeBrief: "/v1/runtime-brief",
      runtimeScorecard: "/v1/runtime-scorecard",
      failureTaxonomy: "/v1/failure-taxonomy",
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      workflowReplay: "/v1/workflow-run-replay",
      benchmarkSummary: "/v1/benchmark-summary",
      reviewPack: "/v1/review-pack",
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
      coverageAreas: ["parse-generated-text", "stream", "pipeline", "middleware"],
      biggestWhy:
        "Provider-agnostic tool reliability only matters if protocol families and their failure hotspots are visible together.",
    },
    protocols,
    reviewPath: [
      "Start with /v1/protocol-matrix to see which protocol families are explicitly covered.",
      "Move to /v1/provider-benchmark-scorecard to see how those protocol families map to provider-facing latency, cost, and contract confidence posture.",
      "Then inspect /v1/failure-taxonomy to connect protocol drift to runtime risk and handoff posture.",
      "Finish on /v1/benchmark-summary and /v1/review-pack so benchmark lift stays grounded in concrete protocol surfaces.",
    ],
    links: {
      protocolMatrix: "/v1/protocol-matrix",
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      failureTaxonomy: "/v1/failure-taxonomy",
      benchmarkSummary: "/v1/benchmark-summary",
      developerOpsPack: "/v1/developer-ops-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
      reviewPack: "/v1/review-pack",
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
  const parserLift = options.benchmarkSnapshot.improvements.middlewareVsBaseline ?? 0;
  const recoveryLift = options.benchmarkSnapshot.improvements.loopVsMiddleware ?? 0;
  const topStrategy = buildStrategyRows(options.benchmarkSnapshot).sort(
    (left, right) => (right.successRate ?? 0) - (left.successRate ?? 0)
  )[0] ?? null;

  const providers = [
    {
      provider: "openai-compatible",
      posture: "review-ready",
      contractConfidencePct: Math.round(middlewareRate),
      latencyBandMs: "350-900",
      costBand: "high",
      dominantProtocols: ["Hermes", "tool wrappers", "middleware normalization"],
      biggestRisk: "tool-choice coercion and wrapper drift",
      whyItMatters:
        "Shows how StagePilot hardens common function-call wrappers before downstream workflow automation.",
      proofRoutes: ["/v1/protocol-matrix", "/v1/benchmark-summary", "/v1/review-pack"],
    },
    {
      provider: "anthropic-xml-style",
      posture: loopRate >= 85 ? "review-ready" : "attention",
      contractConfidencePct: Math.round(Math.min(100, baselineRate + parserLift + recoveryLift)),
      latencyBandMs: "700-1800",
      costBand: "high",
      dominantProtocols: ["Morph XML", "stream repair", "close-tag recovery"],
      biggestRisk: "chunk-boundary drift and repair-vs-strict parser decisions",
      whyItMatters:
        "Makes XML-heavy frontier runtimes legible by tying parser repair to a bounded retry posture.",
      proofRoutes: ["/v1/protocol-matrix", "/v1/failure-taxonomy", "/v1/runtime-scorecard"],
    },
    {
      provider: "gemini-hybrid",
      posture: middlewareRate >= 80 ? "review-ready" : "attention",
      contractConfidencePct: Math.round((middlewareRate + loopRate) / 2),
      latencyBandMs: "500-1400",
      costBand: "medium-high",
      dominantProtocols: ["YAML/XML hybrid", "multiline streaming", "report contracts"],
      biggestRisk: "multiline indentation drift under mixed structured output",
      whyItMatters:
        "Pairs live synthesis pressure with contract-safe output instead of relying on prompt-only compliance.",
      proofRoutes: ["/v1/runtime-brief", "/v1/provider-benchmark-scorecard", "/v1/benchmark-summary"],
    },
    {
      provider: "local-oss",
      posture: baselineRate >= 65 ? "review-ready" : "attention",
      contractConfidencePct: Math.round(loopRate),
      latencyBandMs: "120-450",
      costBand: "low",
      dominantProtocols: ["Qwen3Coder", "wrapperless tool calls", "format roundtrip"],
      biggestRisk: "literal tag leakage and weak wrapper assumptions",
      whyItMatters:
        "Shows that low-cost local inference still gets bounded recovery instead of being dismissed as a toy path.",
      proofRoutes: ["/v1/protocol-matrix", "/v1/developer-ops-pack", "/v1/workflow-run-replay"],
    },
  ];

  const attentionCount = providers.filter((item) => item.posture === "attention").length;

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
      "Use /v1/benchmark-summary and /v1/runtime-scorecard together before claiming production-like runtime reliability.",
    ],
    reviewerNotes: [
      "Latency and cost bands are provider-family posture signals, not a claim of live production telemetry for every vendor.",
      "Contract confidence only stays credible when the protocol matrix and benchmark summary still agree.",
      "Use the scorecard to explain tradeoffs, then point to failure taxonomy before promising automation at the boundary.",
    ],
    links: {
      providerBenchmarkScorecard: "/v1/provider-benchmark-scorecard",
      protocolMatrix: "/v1/protocol-matrix",
      benchmarkSummary: "/v1/benchmark-summary",
      failureTaxonomy: "/v1/failure-taxonomy",
      runtimeScorecard: "/v1/runtime-scorecard",
      reviewPack: "/v1/review-pack",
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
      reviewPack: "/v1/review-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
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
  const parserLift = options.benchmarkSnapshot.improvements.middlewareVsBaseline;
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
        "Model output slips outside the expected tool/report contract and turns a planning request into reviewer cleanup work.",
      signals: [
        typeof baselineRate === "number"
          ? `Baseline success is ${baselineRate}% before parser hardening.`
          : "Baseline success rate is unavailable in the current snapshot.",
        typeof parserLift === "number"
          ? `Middleware lift versus baseline is ${parserLift} percentage points.`
          : "Middleware lift has not been captured yet.",
      ],
      reviewerSurfaces: [
        "/v1/benchmark-summary",
        "/v1/schema/plan-report",
        "/v1/review-pack",
      ],
      mitigations: [
        "Keep the parser middleware and contract schema together in the reviewer path.",
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
      reviewerSurfaces: [
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
          ? "Gemini live planning is configured."
          : "Gemini live planning is not configured.",
        options.openClawConfigured
          ? "OpenClaw delivery is configured."
          : "OpenClaw delivery is not configured.",
      ],
      reviewerSurfaces: [
        "/v1/runtime-brief",
        "/v1/runtime-scorecard",
        "/v1/review-pack",
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
        "Reviewer trust drops if the live runtime has no traffic proof or if requests are already erroring under light load.",
      signals: [
        `Observed requests in this process: ${options.runtimeTelemetry.requestCount}.`,
        `Observed errors in this process: ${options.runtimeTelemetry.errorCount}.`,
        topPressureRoutes.length > 0
          ? `Top pressure routes: ${topPressureRoutes
              .map((item) => `${item.path} (${item.count})`)
              .join(", ")}.`
          : "No route pressure has been observed in this process yet.",
      ],
      reviewerSurfaces: [
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
  const attentionModes = failureModes.filter((item) => item.status === "attention");
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
      "Finish on /v1/runtime-scorecard and /v1/workflow-run-replay to show live reviewer pressure and escalation paths.",
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
      reviewPack: "/v1/review-pack",
      planSchema: "/v1/schema/plan-report",
    },
  };
}

export function buildStagePilotReviewPack(options: {
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
  return {
    service: options.service,
    status: "ok",
    generatedAt: new Date().toISOString(),
    reviewPackId: STAGEPILOT_REVIEW_PACK_ID,
    headline:
      "Parser hardening, bounded retry, and orchestration handoff proof now live in one reviewer-facing surface.",
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
        step: "2. Failure posture",
        surface: "/v1/failure-taxonomy -> /v1/review-pack",
        proof:
          "Validate benchmark deltas, delivery gaps, and runtime failure classes before repeating any claim.",
      },
      {
        step: "3. Contract boundary",
        surface: "/v1/schema/plan-report",
        proof:
          "Check report sections and operator rules before handing output to downstream tools.",
      },
      {
        step: "4. Operator proof",
        surface: "docs/review-pack.svg -> docs/STAGEPILOT.md",
        proof:
          "Read the end-to-end orchestration and handoff shape without tracing the full source tree.",
      },
    ],
    proofBundle: {
      benchmark: options.benchmarkSnapshot,
      benchmarkSummarySchema: STAGEPILOT_BENCHMARK_SUMMARY_SCHEMA,
      providerBenchmarkScorecardSchema:
        STAGEPILOT_PROVIDER_BENCHMARK_SCORECARD_SCHEMA,
      reviewerPosture: {
        runtimeSourceOfTruth:
          "@ai-sdk-tool/parser package plus /v1/runtime-brief and /v1/review-pack",
        docsOnlySurfaces: ["docs/review-pack.svg", "site/"],
        claimTier: benchmarkReadyForPromotion
          ? "runtime-backed-review-ready"
          : "bounded-review-demo",
        claimRule:
          "Treat static/docs surfaces as reviewer aids, then repeat runtime claims only after the benchmark and live review-pack surfaces agree.",
      },
      runtimeScorecardSchema: STAGEPILOT_RUNTIME_SCORECARD_SCHEMA,
      integrationsReady: options.geminiHasApiKey && options.openClawConfigured,
      operationalPosture,
      model: options.model,
      openClawHasWebhookUrl: options.openClawHasWebhookUrl,
      packageSurface: "@ai-sdk-tool/parser",
      planSchema: STAGEPILOT_PLAN_REPORT_SCHEMA,
      requestBodyTimeoutMs: options.bodyTimeoutMs,
      routeCount: buildStagePilotRouteDescriptors().length,
    },
    proofAssets: buildStagePilotProofAssets(),
    links: {
      health: "/health",
      meta: "/v1/meta",
      runtimeBrief: "/v1/runtime-brief",
      reviewPack: "/v1/review-pack",
      runtimeScorecard: "/v1/runtime-scorecard",
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
