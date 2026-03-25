import { describe, expect, it, vi } from "vitest";
import { publishBenchmarkReportIfConfigured } from "../src/examples/benchmark-cloud-publish";
import type { StagePilotBenchmarkReport } from "../src/stagepilot/benchmark";

const { publishBenchmarkReport, fromEnv } = vi.hoisted(() => ({
  publishBenchmarkReport: vi.fn(),
  fromEnv: vi.fn(),
}));

vi.mock("../src/adapters/gcp-adapter", () => ({
  GcpAdapter: {
    fromEnv,
  },
}));

const report: StagePilotBenchmarkReport = {
  caseCount: 40,
  generatedAt: "2026-03-24T05:00:00.000Z",
  improvements: {
    loopVsBaseline: 65,
    loopVsMiddleware: 25,
    middlewareVsBaseline: 40,
  },
  seed: 20_260_324,
  strategies: [
    {
      avgAttemptsUsed: 1,
      avgLatencyMs: 5,
      p95LatencyMs: 9,
      parseSuccessCount: 10,
      planSuccessCount: 10,
      successRate: 25,
      strategy: "baseline",
      totalCases: 40,
    },
    {
      avgAttemptsUsed: 1,
      avgLatencyMs: 6,
      p95LatencyMs: 10,
      parseSuccessCount: 26,
      planSuccessCount: 26,
      successRate: 65,
      strategy: "middleware",
      totalCases: 40,
    },
    {
      avgAttemptsUsed: 1.35,
      avgLatencyMs: 7,
      p95LatencyMs: 12,
      parseSuccessCount: 36,
      planSuccessCount: 36,
      successRate: 90,
      strategy: "middleware+ralph-loop",
      totalCases: 40,
    },
  ],
};

describe("publishBenchmarkReportIfConfigured", () => {
  it("returns null when no GCP adapter is configured", async () => {
    fromEnv.mockReturnValue(null);

    await expect(
      publishBenchmarkReportIfConfigured(report)
    ).resolves.toBeNull();
    expect(publishBenchmarkReport).not.toHaveBeenCalled();
  });

  it("publishes the benchmark report through the configured GCP adapter", async () => {
    publishBenchmarkReport.mockResolvedValue({
      bigQueryRows: 3,
      gcsUrl: "https://storage.googleapis.com/example/run.json",
    });
    fromEnv.mockReturnValue({
      publishBenchmarkReport,
    });

    await expect(publishBenchmarkReportIfConfigured(report)).resolves.toEqual({
      bigQueryRows: 3,
      gcsUrl: "https://storage.googleapis.com/example/run.json",
    });

    expect(publishBenchmarkReport).toHaveBeenCalledWith(
      "stagepilot-2026-03-24T05-00-00-000Z",
      report,
      expect.arrayContaining([
        expect.objectContaining({
          strategy: "baseline",
          success_rate: 25,
          total_cases: 40,
        }),
        expect.objectContaining({
          strategy: "middleware+ralph-loop",
          success_rate: 90,
          avg_attempts: 1.35,
        }),
      ])
    );
  });
});
