export interface StagePilotRouteDescriptor {
  method: "GET" | "POST";
  path: string;
  purpose: string;
}

export const STAGEPILOT_READINESS_CONTRACT = "stagepilot-runtime-brief-v1";
export const STAGEPILOT_PLAN_REPORT_SCHEMA = "stagepilot-plan-report-v1";

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
      planSchema: "/v1/schema/plan-report",
    },
  };
}
