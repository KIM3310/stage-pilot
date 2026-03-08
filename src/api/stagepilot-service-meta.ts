export interface StagePilotRouteDescriptor {
  method: "GET" | "POST";
  path: string;
  purpose: string;
}

export const STAGEPILOT_READINESS_CONTRACT = "stagepilot-runtime-brief-v1";
export const STAGEPILOT_PLAN_REPORT_SCHEMA = "stagepilot-plan-report-v1";
export const STAGEPILOT_REVIEW_PACK_ID = "stagepilot-review-pack-v1";

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
  const missingIntegrations: string[] = [];
  if (!options.geminiHasApiKey) {
    missingIntegrations.push("gemini_api_key");
  }
  if (!options.openClawConfigured) {
    missingIntegrations.push("openclaw_delivery");
  }

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
    proofBundle: {
      benchmark: options.benchmarkSnapshot,
      integrationsReady: options.geminiHasApiKey && options.openClawConfigured,
      model: options.model,
      openClawHasWebhookUrl: options.openClawHasWebhookUrl,
      packageSurface: "@ai-sdk-tool/parser",
      planSchema: STAGEPILOT_PLAN_REPORT_SCHEMA,
      requestBodyTimeoutMs: options.bodyTimeoutMs,
      routeCount: buildStagePilotRouteDescriptors().length,
    },
    links: {
      health: "/health",
      meta: "/v1/meta",
      runtimeBrief: "/v1/runtime-brief",
      reviewPack: "/v1/review-pack",
      planSchema: "/v1/schema/plan-report",
      benchmark: "/v1/benchmark",
      demo: "/demo",
    },
  };
}
