import { GcpAdapter } from "../adapters/gcp-adapter";
import type { StagePilotBenchmarkReport } from "../stagepilot/benchmark";

function createRunId(report: StagePilotBenchmarkReport): string {
  return `stagepilot-${report.generatedAt.replace(/[:.]/g, "-")}`;
}

export function publishBenchmarkReportIfConfigured(
  report: StagePilotBenchmarkReport
): Promise<{ bigQueryRows: number; gcsUrl: string } | null> {
  const gcp = GcpAdapter.fromEnv();
  if (!gcp) {
    return Promise.resolve(null);
  }

  return gcp.publishBenchmarkReport(
    createRunId(report),
    report as unknown as Record<string, unknown>,
    report.strategies.map((strategy) => ({
      avg_attempts: strategy.avgAttemptsUsed,
      avg_latency_ms: strategy.avgLatencyMs,
      p95_latency_ms: strategy.p95LatencyMs,
      strategy: strategy.strategy,
      success_rate: strategy.successRate,
      total_cases: strategy.totalCases,
    }))
  );
}
