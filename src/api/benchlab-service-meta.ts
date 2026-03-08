export interface BenchLabRouteDescriptor {
  method: "GET" | "POST";
  path: string;
  purpose: string;
}

export const BENCHLAB_READINESS_CONTRACT = "benchlab-runtime-brief-v1";
export const BENCHLAB_JOB_REPORT_SCHEMA = "benchlab-job-report-v1";
export const BENCHLAB_REVIEW_PACK_ID = "benchlab-review-pack-v1";

export function buildBenchLabRouteDescriptors(): BenchLabRouteDescriptor[] {
  return [
    {
      method: "GET",
      path: "/benchlab",
      purpose: "Interactive BenchLab operator console",
    },
    {
      method: "GET",
      path: "/health",
      purpose: "BenchLab runtime health and repository posture",
    },
    {
      method: "GET",
      path: "/v1/benchlab/runtime-brief",
      purpose: "BenchLab operator readiness brief",
    },
    {
      method: "GET",
      path: "/v1/benchlab/review-pack",
      purpose: "BenchLab reviewer proof pack",
    },
    {
      method: "GET",
      path: "/v1/benchlab/schema/job-report",
      purpose: "BenchLab job report contract",
    },
    {
      method: "GET",
      path: "/v1/benchlab/configs",
      purpose: "Config discovery for runnable model matrices",
    },
    {
      method: "GET",
      path: "/v1/benchlab/jobs",
      purpose: "Tracked job list",
    },
    {
      method: "GET",
      path: "/v1/benchlab/jobs/:id",
      purpose: "Tracked job detail",
    },
    {
      method: "GET",
      path: "/v1/benchlab/jobs/:id/logs",
      purpose: "Job log tail for operators",
    },
    {
      method: "POST",
      path: "/v1/benchlab/jobs/:id/cancel",
      purpose: "Cancel running job",
    },
    {
      method: "POST",
      path: "/v1/benchlab/jobs",
      purpose: "Launch benchmark or preflight run",
    },
    {
      method: "GET",
      path: "/v1/benchlab/runs",
      purpose: "Runtime matrix summaries",
    },
    {
      method: "GET",
      path: "/v1/benchlab/runs/:name",
      purpose: "Runtime detail",
    },
    {
      method: "GET",
      path: "/v1/benchlab/runs/:name/models",
      purpose: "Model-level summaries for a runtime",
    },
    {
      method: "GET",
      path: "/v1/benchlab/runs/:name/forensics",
      purpose: "Failure forensics for a runtime",
    },
    {
      method: "GET",
      path: "/v1/benchlab/compare",
      purpose: "Runtime compare surface",
    },
    {
      method: "GET",
      path: "/v1/benchlab/leaderboards/variants",
      purpose: "Variant leaderboard and recommendation surface",
    },
    {
      method: "GET",
      path: "/v1/benchlab/artifacts",
      purpose: "Tracked artifact summaries",
    },
    {
      method: "GET",
      path: "/v1/benchlab/artifacts/best",
      purpose: "Best checked-in artifacts",
    },
    {
      method: "GET",
      path: "/v1/benchlab/artifacts/forensics",
      purpose: "Tracked artifact failure taxonomy",
    },
  ];
}

export function buildBenchLabJobReportSchema() {
  return {
    schema: BENCHLAB_JOB_REPORT_SCHEMA,
    requiredSections: ["job", "runtime", "artifacts", "forensics"],
    operatorRules: [
      "Every launched job must preserve stdout/stderr evidence and a stable runtime name.",
      "Runtime compare and variant recommendations should be read before promoting a new claim.",
      "Checked-in artifacts must keep summary, markdown report, and forensics files aligned.",
    ],
  };
}

export function buildBenchLabRuntimeBrief(options: {
  artifactCount: number;
  benchmarkRoot: string;
  configCount: number;
  jobCount: number;
  matrixRoot: string;
  pythonExecutable: string;
  repoRoot: string;
  runCount: number;
}) {
  return {
    service: "benchlab-api",
    status: "ok",
    generatedAt: new Date().toISOString(),
    readinessContract: BENCHLAB_READINESS_CONTRACT,
    headline:
      "Local-first BFCL matrix lab with tracked jobs, runtime compare, and checked-in artifact forensics.",
    reportContract: buildBenchLabJobReportSchema(),
    runtime: {
      benchmarkRoot: options.benchmarkRoot,
      matrixRoot: options.matrixRoot,
      pythonExecutable: options.pythonExecutable,
      repoRoot: options.repoRoot,
    },
    evidenceCounts: {
      configs: options.configCount,
      jobs: options.jobCount,
      runs: options.runCount,
      artifacts: options.artifactCount,
    },
    reviewFlow: [
      "Validate configs and repo roots before launching a new runtime.",
      "Inspect run-level forensics and compare views before trusting a claim delta.",
      "Promote only artifacts with aligned summary, report, and forensics evidence.",
    ],
    watchouts: [
      "A runtime without forensics files weakens the error-bucket narrative.",
      "Local Python path drift can break job launch even when UI surfaces still load.",
    ],
    routeCount: buildBenchLabRouteDescriptors().length,
    routes: buildBenchLabRouteDescriptors(),
    links: {
      health: "/health",
      runtimeBrief: "/v1/benchlab/runtime-brief",
      reviewPack: "/v1/benchlab/review-pack",
      jobSchema: "/v1/benchlab/schema/job-report",
      jobs: "/v1/benchlab/jobs",
      runs: "/v1/benchlab/runs",
      artifacts: "/v1/benchlab/artifacts",
    },
  };
}

export function buildBenchLabReviewPack(options: {
  artifactCount: number;
  artifactsWithTrackedErrors: number;
  bestArtifactClaimName: string | null;
  bestArtifactDeltaPp: number | null;
  configCount: number;
  dominantBucket: string | null;
  improvedArtifactCount: number;
  jobCount: number;
  runCount: number;
}) {
  return {
    service: "benchlab-api",
    status: "ok",
    generatedAt: new Date().toISOString(),
    reviewPackId: BENCHLAB_REVIEW_PACK_ID,
    headline:
      "BenchLab compresses configs, runtime matrices, checked-in claims, and failure forensics into one promotion-ready review surface.",
    operatorJourney: [
      {
        stage: "Configure",
        summary:
          "Validate model configs, runtime roots, and local Python path before launching any claim.",
        surface: "/v1/benchlab/configs + /v1/benchlab/runtime-brief",
      },
      {
        stage: "Launch",
        summary:
          "Preflight and benchmark jobs keep stdout/stderr and runtime names stable for later audit.",
        surface: "/v1/benchlab/jobs",
      },
      {
        stage: "Compare",
        summary:
          "Runtime compare, model summaries, and variant leaderboard make deltas reviewable before any promotion.",
        surface:
          "/v1/benchlab/runs + /v1/benchlab/compare + /v1/benchlab/leaderboards/variants",
      },
      {
        stage: "Promote",
        summary:
          "Checked-in artifacts and failure taxonomy turn benchmark claims into persistent evidence.",
        surface: "/v1/benchlab/artifacts + /v1/benchlab/artifacts/forensics",
      },
    ],
    reviewSequence: [
      "Confirm configs, jobs, and runtime counts before trusting a new claim surface.",
      "Inspect best checked-in delta and dominant failure bucket before comparing variants.",
      "Promote only artifacts with aligned summary, report, and tracked forensics evidence.",
    ],
    proofBundle: {
      counts: {
        configs: options.configCount,
        jobs: options.jobCount,
        runs: options.runCount,
        artifacts: options.artifactCount,
      },
      bestArtifact: {
        claimName: options.bestArtifactClaimName,
        deltaPp: options.bestArtifactDeltaPp,
      },
      dominantBucket: options.dominantBucket,
      improvedArtifacts: options.improvedArtifactCount,
      trackedArtifactsWithErrors: options.artifactsWithTrackedErrors,
      routeCount: buildBenchLabRouteDescriptors().length,
      schema: BENCHLAB_JOB_REPORT_SCHEMA,
    },
    links: {
      health: "/health",
      runtimeBrief: "/v1/benchlab/runtime-brief",
      reviewPack: "/v1/benchlab/review-pack",
      jobSchema: "/v1/benchlab/schema/job-report",
      jobs: "/v1/benchlab/jobs",
      runs: "/v1/benchlab/runs",
      compare: "/v1/benchlab/compare",
      variants: "/v1/benchlab/leaderboards/variants",
      artifacts: "/v1/benchlab/artifacts/best",
      artifactForensics: "/v1/benchlab/artifacts/forensics",
    },
  };
}
