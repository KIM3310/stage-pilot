import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const benchmarkPath = resolve(
  process.cwd(),
  "docs/benchmarks/stagepilot-latest.json"
);

const benchmark = JSON.parse(readFileSync(benchmarkPath, "utf8"));

const strategyRates = new Map(
  Array.isArray(benchmark.strategies)
    ? benchmark.strategies.map((item) => [item.strategy, item.successRate])
    : []
);

function formatPercent(value) {
  return typeof value === "number" ? `${value.toFixed(2)}%` : "n/a";
}

function formatDelta(value) {
  return typeof value === "number"
    ? `${value > 0 ? "+" : ""}${value.toFixed(2)}pp`
    : "n/a";
}

const lines = [
  "StagePilot validation summary",
  "===============================",
  `Artifact: ${benchmarkPath}`,
  `Generated: ${benchmark.generatedAt ?? "unknown"}`,
  `Cases: ${benchmark.caseCount ?? "unknown"}`,
  "",
  "Benchmark ladder",
  `- baseline: ${formatPercent(strategyRates.get("baseline"))}`,
  `- middleware: ${formatPercent(strategyRates.get("middleware"))}`,
  `- middleware+ralph-loop: ${formatPercent(
    strategyRates.get("middleware+ralph-loop")
  )}`,
  `- middleware vs baseline: ${formatDelta(
    benchmark.improvements?.middlewareVsBaseline
  )}`,
  `- loop vs baseline: ${formatDelta(benchmark.improvements?.loopVsBaseline)}`,
  "",
  "Read first",
  "- docs/validation-guide.md",
  "- docs/executive-one-pager.md",
  "- docs/solution-architecture.md",
  "- docs/summary-pack.svg",
  "",
  "API evaluation path",
  "- GET /v1/runtime-brief",
  "- GET /v1/summary-pack",
  "- GET /v1/benchmark-summary",
  "- GET /v1/developer-ops-pack",
  "- GET /v1/workflow-run-replay",
  "",
  "Local flow",
  "- pnpm api:stagepilot",
  "- open http://127.0.0.1:8080/demo",
  "",
  "Boundary reminder",
  "- Checked-in benchmark JSON and summary-pack APIs are the strongest claim surfaces.",
  "- site/ and docs/summary-pack.svg are supporting docs, not runtime proof.",
];

process.stdout.write(`${lines.join("\n")}\n`);
