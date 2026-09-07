import { describe, expect, it } from "vitest";
import {
  benchmarkStagePilotStrategies,
  createBenchmarkCases,
} from "../src/stagepilot/benchmark";

describe("stagepilot benchmark harness", () => {
  it("shows middleware and ralph-loop gains over baseline", async () => {
    const report = await benchmarkStagePilotStrategies({
      caseCount: 60,
      maxLoopAttempts: 2,
      seed: 20_260_413,
    });

    const baseline = report.strategies.find(
      (item) => item.strategy === "baseline"
    );
    const middleware = report.strategies.find(
      (item) => item.strategy === "middleware"
    );
    const loop = report.strategies.find(
      (item) => item.strategy === "middleware+ralph-loop"
    );

    expect(baseline).toBeDefined();
    expect(middleware).toBeDefined();
    expect(loop).toBeDefined();

    expect(middleware?.successRate ?? 0).toBeGreaterThan(
      baseline?.successRate ?? 0
    );
    expect(loop?.successRate ?? 0).toBeGreaterThanOrEqual(
      middleware?.successRate ?? 0
    );

    // Sixty cases exercise each of the 30 mutation modes twice. Modes such
    // as wrong-tool-name and empty-arguments remain genuinely unrecoverable.
    expect(baseline?.successRate).toBeCloseTo(33.33, 2);
    expect(middleware?.successRate).toBeCloseTo(66.67, 2);
    expect(loop?.successRate).toBe(90);
    expect(report.improvements.middlewareVsBaseline).toBe(33.33);
    expect(loop?.failedCaseIds?.length ?? 0).toBeGreaterThan(0);
    for (const strategy of report.strategies) {
      expect(strategy.caseResults).toHaveLength(60);
      expect(
        strategy.caseResults.filter((result) => result.planned)
      ).toHaveLength(strategy.planSuccessCount);
      expect(
        strategy.caseResults
          .filter((result) => !result.planned)
          .map((result) => result.id)
      ).toEqual(strategy.failedCaseIds);
    }
  });

  it("honors a one-attempt budget without silently adding a retry", async () => {
    const report = await benchmarkStagePilotStrategies({ maxLoopAttempts: 1 });
    const middleware = report.strategies[1];
    const loop = report.strategies[2];
    expect(loop?.caseResults).toEqual(middleware?.caseResults);
    expect(loop?.avgAttemptsUsed).toBe(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5, 10_001])(
    "rejects invalid case count %s before constructing fixtures",
    (value) => {
      expect(() => createBenchmarkCases(value, 1)).toThrow(RangeError);
    }
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5, 21])(
    "rejects invalid retry budget %s",
    async (value) => {
      await expect(
        benchmarkStagePilotStrategies({ maxLoopAttempts: value })
      ).rejects.toThrow(RangeError);
    }
  );
});
