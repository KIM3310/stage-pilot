import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  benchmarkStagePilotStrategies,
  formatBenchmarkSummary,
} from "../stagepilot/benchmark";
import { publishBenchmarkReportIfConfigured } from "./benchmark-cloud-publish";

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

async function main() {
  const caseCount = readIntEnv("BENCHMARK_CASES", 40);
  const seed = readIntEnv("BENCHMARK_SEED", 20_260_228);
  const maxLoopAttempts = readIntEnv("BENCHMARK_LOOP_ATTEMPTS", 2);

  const report = await benchmarkStagePilotStrategies({
    caseCount,
    maxLoopAttempts,
    seed,
  });

  console.log(formatBenchmarkSummary(report));

  const outDir = resolve(process.cwd(), "docs/benchmarks");
  mkdirSync(outDir, { recursive: true });

  const outPath = resolve(outDir, "stagepilot-latest.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // Keep benchmark artifacts check:biome-friendly for CI/local verification.
  try {
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
    execFileSync(npxCommand, ["biome", "format", "--write", outPath], {
      stdio: "ignore",
    });
  } catch {
    // Best effort only: JSON is still usable even if formatter is unavailable.
  }

  console.log(`\nSaved benchmark JSON -> ${outPath}`);

  const publishResult = await publishBenchmarkReportIfConfigured(report);
  if (publishResult) {
    console.log(
      `Published GCP benchmark artifacts -> ${publishResult.gcsUrl} (${publishResult.bigQueryRows} BigQuery rows)`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
