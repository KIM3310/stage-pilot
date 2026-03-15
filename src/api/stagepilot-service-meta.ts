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
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      workflowReplay: "/v1/workflow-run-replay",
      benchmarkSummary: "/v1/benchmark-summary",
      reviewPack: "/v1/review-pack",
      planSchema: "/v1/schema/plan-report",
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
      benchmarkSummary: "/v1/benchmark-summary",
      workflowReplay: "/v1/workflow-run-replay",
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
      "Inspect /v1/review-pack to validate benchmark lift, parser posture, and operator handoff boundaries.",
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
        step: "2. Benchmark lift",
        surface: "/v1/review-pack -> docs/benchmarks/stagepilot-latest.json",
        proof:
          "Validate baseline, middleware, and Ralph-loop deltas before repeating any claim.",
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
