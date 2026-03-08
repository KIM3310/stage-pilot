import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBenchLabApiServer } from "../src/api/benchlab-server";

const serversToClose: ReturnType<typeof createBenchLabApiServer>[] = [];

afterEach(async () => {
  await Promise.all(
    serversToClose.splice(0, serversToClose.length).map((server) => {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    })
  );
});

async function startServer(
  options: Parameters<typeof createBenchLabApiServer>[0]
) {
  const server = createBenchLabApiServer(options);
  serversToClose.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function buildCounts(
  records: Array<{ outcome: string; status: string }>
): Record<string, number> {
  const counts = {
    completed: 0,
    failed: 0,
    flat: 0,
    improved: 0,
    preflight_ok: 0,
    regressed: 0,
    unknown: 0,
  };
  for (const record of records) {
    if (record.status in counts) {
      counts[record.status as keyof typeof counts] += 1;
    }
    if (record.outcome in counts && record.outcome !== record.status) {
      counts[record.outcome as keyof typeof counts] += 1;
    }
  }
  return counts;
}

function writeRuntimeFixture(
  matrixRoot: string,
  runtimeName: string,
  records: Record<string, unknown>[]
) {
  const runtimeRoot = join(matrixRoot, runtimeName);
  mkdirSync(join(runtimeRoot, "runs"), { recursive: true });
  writeFileSync(
    join(runtimeRoot, "matrix_summary.json"),
    JSON.stringify(
      {
        categories: ["simple_python", "multiple"],
        cases_per_category:
          (records[0]?.cases_per_category as number | undefined) ?? 5,
        counts: buildCounts(
          records.map((record) => ({
            outcome: String(record.outcome ?? "unknown"),
            status: String(record.status ?? "unknown"),
          }))
        ),
        models_file: join(matrixRoot, "models.ollama.local.json"),
        preflight_only: false,
        records,
      },
      null,
      2
    )
  );
  writeFileSync(
    join(runtimeRoot, "matrix_report.md"),
    `# ${runtimeName}\n\n- synthetic runtime\n`
  );
  return runtimeRoot;
}

function createBenchLabFixtureRoot() {
  const repoRoot = mkdtempSync(join(tmpdir(), "benchlab-fixture-"));
  const matrixRoot = join(repoRoot, "experiments", "prompt-bfcl-ralph-matrix");
  const artifactRoot = join(
    repoRoot,
    "experiments",
    "openai-compatible-prompt-bfcl-ralph",
    "artifacts",
    "claim-ollama-qwen3-5-4b-10-minimal"
  );
  const olderArtifactRoot = join(
    repoRoot,
    "experiments",
    "openai-compatible-prompt-bfcl-ralph",
    "artifacts",
    "claim-ollama-qwen3-5-4b-5-default"
  );
  mkdirSync(matrixRoot, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(olderArtifactRoot, { recursive: true });

  writeFileSync(
    join(matrixRoot, "models.ollama.local.json"),
    JSON.stringify({ models: [] }, null, 2)
  );
  writeFileSync(
    join(matrixRoot, "models.zero-cost.local.json"),
    JSON.stringify({ models: [] }, null, 2)
  );
  writeFileSync(
    join(matrixRoot, "run_prompt_bfcl_ralph_matrix.py"),
    "print('stub')\n"
  );
  writeFileSync(
    join(artifactRoot, "summary.json"),
    JSON.stringify(
      {
        categories: [
          "multiple",
          "parallel",
          "parallel_multiple",
          "simple_python",
        ],
        cases_per_category: 10,
        metrics_percent_point: {
          "Overall Acc": {
            baseline: 6.08,
            ralph: 7.33,
            delta: 1.25,
          },
        },
      },
      null,
      2
    )
  );
  writeFileSync(
    join(artifactRoot, "benchmark_report.md"),
    [
      "# OpenAI-Compatible Prompt-Mode BFCL Benchmark Report",
      "",
      "- Provider: `Ollama`",
      "- Model: `qwen3.5:4b`",
      "",
      "## Scoreboard",
      "",
      "| Metric | Baseline | RALPH | Delta (pp) |",
      "|---|---:|---:|---:|",
      "| Overall Acc | 6.08 | 7.33 | +1.25 |",
      "",
    ].join("\n")
  );
  writeFileSync(
    join(artifactRoot, "data_overall.csv"),
    "metric,baseline,ralph,delta\nOverall Acc,6.08,7.33,1.25\n"
  );
  writeFileSync(
    join(artifactRoot, "error_forensics.json"),
    JSON.stringify(
      {
        registries: {
          "qwen3.5:4b-prompt-baseline": {
            error_items: 6,
            error_reasons: [
              {
                count: 6,
                reason: "timeout",
                sample_ids: ["multiple_5", "multiple_6", "multiple_7"],
              },
            ],
            total_items: 40,
          },
          "qwen3.5:4b-prompt-ralph-loop-minimal": {
            error_items: 1,
            error_reasons: [
              {
                count: 1,
                reason: "timeout",
                sample_ids: ["multiple_7"],
              },
            ],
            total_items: 40,
          },
        },
      },
      null,
      2
    )
  );
  writeFileSync(
    join(artifactRoot, "benchmark-ollama-qwen3-5-4b-10-minimal.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20"><text x="10" y="14">qwen snapshot</text></svg>\n'
  );
  writeFileSync(
    join(olderArtifactRoot, "summary.json"),
    JSON.stringify(
      {
        categories: ["simple_python"],
        cases_per_category: 5,
        metrics_percent_point: {
          "Overall Acc": {
            baseline: 6.0,
            ralph: 6.25,
            delta: 0.25,
          },
        },
      },
      null,
      2
    )
  );
  writeFileSync(
    join(olderArtifactRoot, "benchmark_report.md"),
    [
      "# OpenAI-Compatible Prompt-Mode BFCL Benchmark Report",
      "",
      "- Provider: `Ollama`",
      "- Model: `qwen3.5:4b`",
      "",
      "## Scoreboard",
      "",
      "| Metric | Baseline | RALPH | Delta (pp) |",
      "|---|---:|---:|---:|",
      "| Overall Acc | 6.00 | 6.25 | +0.25 |",
      "",
    ].join("\n")
  );
  writeFileSync(join(olderArtifactRoot, "error_forensics.json"), "{}\n");

  const compareLeftRoot = writeRuntimeFixture(
    matrixRoot,
    "runtime-compare-left",
    [
      {
        id: "ollama-llama3-2-default",
        cases_per_category: 5,
        kind: "openai-compatible",
        label: "Ollama Llama 3.2 default",
        model_name: "llama3.2:latest",
        outcome: "improved",
        overall_baseline: 7.4,
        overall_delta_pp: 0.1,
        overall_ralph: 7.5,
        overall_relative_delta_percent: 1.35,
        provider_name: "Ollama",
        ralph_variant: "default",
        runtime_root:
          "experiments/prompt-bfcl-ralph-matrix/runtime-compare-left/runs/ollama-llama3-2-default",
        status: "completed",
      },
      {
        id: "ollama-qwen3-5-4b-schema-lock",
        cases_per_category: 5,
        kind: "openai-compatible",
        label: "Ollama Qwen 3.5 schema-lock",
        model_name: "qwen3.5:4b",
        outcome: "regressed",
        overall_baseline: 6.2,
        overall_delta_pp: -0.2,
        overall_ralph: 6.0,
        overall_relative_delta_percent: -3.23,
        provider_name: "Ollama",
        ralph_variant: "schema-lock",
        runtime_root:
          "experiments/prompt-bfcl-ralph-matrix/runtime-compare-left/runs/ollama-qwen3-5-4b-schema-lock",
        status: "completed",
      },
    ]
  );
  const compareRightRoot = writeRuntimeFixture(
    matrixRoot,
    "runtime-compare-right",
    [
      {
        id: "ollama-llama3-2-schema-lock",
        cases_per_category: 10,
        kind: "openai-compatible",
        label: "Ollama Llama 3.2 schema-lock",
        model_name: "llama3.2:latest",
        outcome: "improved",
        overall_baseline: 7.4,
        overall_delta_pp: 0.3,
        overall_ralph: 7.7,
        overall_relative_delta_percent: 4.05,
        provider_name: "Ollama",
        ralph_variant: "schema-lock",
        runtime_root:
          "experiments/prompt-bfcl-ralph-matrix/runtime-compare-right/runs/ollama-llama3-2-schema-lock",
        status: "completed",
      },
      {
        id: "ollama-qwen3-5-4b-minimal",
        cases_per_category: 10,
        kind: "openai-compatible",
        label: "Ollama Qwen 3.5 minimal",
        model_name: "qwen3.5:4b",
        outcome: "improved",
        overall_baseline: 6.2,
        overall_delta_pp: 0.8,
        overall_ralph: 7.0,
        overall_relative_delta_percent: 12.9,
        provider_name: "Ollama",
        ralph_variant: "minimal",
        runtime_root:
          "experiments/prompt-bfcl-ralph-matrix/runtime-compare-right/runs/ollama-qwen3-5-4b-minimal",
        status: "completed",
      },
      {
        id: "ollama-gemma3-4b-coverage",
        cases_per_category: 10,
        kind: "openai-compatible",
        label: "Ollama Gemma 3 coverage",
        model_name: "gemma3:4b",
        outcome: "flat",
        overall_baseline: 4.5,
        overall_delta_pp: 0,
        overall_ralph: 4.5,
        overall_relative_delta_percent: 0,
        provider_name: "Ollama",
        ralph_variant: "coverage",
        runtime_root:
          "experiments/prompt-bfcl-ralph-matrix/runtime-compare-right/runs/ollama-gemma3-4b-coverage",
        status: "completed",
      },
    ]
  );
  mkdirSync(join(compareLeftRoot, "runs", "ollama-qwen3-5-4b-schema-lock"), {
    recursive: true,
  });
  writeFileSync(
    join(
      compareLeftRoot,
      "runs",
      "ollama-qwen3-5-4b-schema-lock",
      "error_forensics.json"
    ),
    JSON.stringify(
      {
        registries: {
          "qwen3.5:4b-prompt-baseline": {
            error_items: 3,
            error_reasons: [
              { count: 3, reason: "timeout", sample_ids: ["multiple_1"] },
            ],
            total_items: 10,
          },
          "qwen3.5:4b-prompt-ralph-loop-schema-lock": {
            error_items: 5,
            error_reasons: [
              { count: 5, reason: "timeout", sample_ids: ["multiple_2"] },
            ],
            total_items: 10,
          },
        },
      },
      null,
      2
    )
  );
  mkdirSync(join(compareRightRoot, "runs", "ollama-qwen3-5-4b-minimal"), {
    recursive: true,
  });
  writeFileSync(
    join(
      compareRightRoot,
      "runs",
      "ollama-qwen3-5-4b-minimal",
      "error_forensics.json"
    ),
    JSON.stringify(
      {
        registries: {
          "qwen3.5:4b-prompt-baseline": {
            error_items: 4,
            error_reasons: [
              { count: 4, reason: "timeout", sample_ids: ["multiple_3"] },
            ],
            total_items: 20,
          },
          "qwen3.5:4b-prompt-ralph-loop-minimal": {
            error_items: 1,
            error_reasons: [
              { count: 1, reason: "timeout", sample_ids: ["multiple_4"] },
            ],
            total_items: 20,
          },
        },
      },
      null,
      2
    )
  );
  mkdirSync(join(compareRightRoot, "runs", "ollama-gemma3-4b-coverage"), {
    recursive: true,
  });
  writeFileSync(
    join(
      compareRightRoot,
      "runs",
      "ollama-gemma3-4b-coverage",
      "error_forensics.json"
    ),
    JSON.stringify(
      {
        registries: {
          "gemma3:4b-prompt-baseline": {
            error_items: 1,
            error_reasons: [
              {
                count: 1,
                reason: "missing required args",
                sample_ids: ["simple_1"],
              },
            ],
            total_items: 20,
          },
          "gemma3:4b-prompt-ralph-loop-coverage": {
            error_items: 2,
            error_reasons: [
              {
                count: 2,
                reason: "missing required args",
                sample_ids: ["simple_2"],
              },
            ],
            total_items: 20,
          },
        },
      },
      null,
      2
    )
  );

  return { matrixRoot, repoRoot };
}

describe("benchlab api", () => {
  it("lists config files and renders the demo", async () => {
    const fixture = createBenchLabFixtureRoot();
    const baseUrl = await startServer({
      benchmarkRoot: "/tmp/bfcl",
      pythonExecutable: "/usr/bin/python3",
      repoRoot: fixture.repoRoot,
    });

    const htmlResponse = await fetch(`${baseUrl}/benchlab`);
    const html = await htmlResponse.text();
    expect(htmlResponse.status).toBe(200);
    expect(html).toContain("BenchLab");
    expect(html).toContain("Best Checked-In Claims");

    const configResponse = await fetch(`${baseUrl}/v1/benchlab/configs`);
    const payload = await configResponse.json();
    expect(configResponse.status).toBe(200);
    expect(payload.configs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "models.ollama.local.json" }),
        expect.objectContaining({ name: "models.zero-cost.local.json" }),
      ])
    );

    const artifactsResponse = await fetch(`${baseUrl}/v1/benchlab/artifacts`);
    const artifactsPayload = await artifactsResponse.json();
    expect(artifactsResponse.status).toBe(200);
    expect(artifactsPayload.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelName: "qwen3.5:4b",
          providerName: "Ollama",
          outcome: "improved",
          deltaPp: 1.25,
        }),
      ])
    );
    expect(artifactsPayload.artifacts).toHaveLength(2);

    const bestArtifactsResponse = await fetch(
      `${baseUrl}/v1/benchlab/artifacts/best`
    );
    const bestArtifactsPayload = await bestArtifactsResponse.json();
    expect(bestArtifactsResponse.status).toBe(200);
    expect(bestArtifactsPayload.artifacts).toEqual([
      expect.objectContaining({
        claimName: "claim-ollama-qwen3-5-4b-10-minimal",
        modelName: "qwen3.5:4b",
        deltaPp: 1.25,
      }),
    ]);

    const artifactForensicsResponse = await fetch(
      `${baseUrl}/v1/benchlab/artifacts/forensics`
    );
    const artifactForensicsPayload = await artifactForensicsResponse.json();
    expect(artifactForensicsResponse.status).toBe(200);
    expect(artifactForensicsPayload.summary).toEqual(
      expect.objectContaining({
        artifacts: 2,
        artifactsWithErrorBuckets: 1,
        artifactsWithForensicsFile: 2,
        artifactsWithTrackedErrors: 1,
        baselineErrorItems: 6,
        dominantBucket: "timeout",
        ralphErrorItems: 1,
      })
    );
    expect(artifactForensicsPayload.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baselineCount: 6,
          bucket: "timeout",
          deltaCount: -5,
          ralphCount: 1,
        }),
      ])
    );
    expect(artifactForensicsPayload.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactId:
            "openai-compatible-prompt-bfcl-ralph::claim-ollama-qwen3-5-4b-10-minimal",
          baselineErrorItems: 6,
          dominantBucket: "timeout",
          hasErrorBuckets: true,
          ralphErrorItems: 1,
        }),
        expect.objectContaining({
          artifactId:
            "openai-compatible-prompt-bfcl-ralph::claim-ollama-qwen3-5-4b-5-default",
          hasErrorBuckets: false,
          hasForensicsFile: true,
        }),
      ])
    );
    expect(artifactForensicsPayload.gaps).toEqual([
      expect.objectContaining({
        artifactId:
          "openai-compatible-prompt-bfcl-ralph::claim-ollama-qwen3-5-4b-5-default",
        gap: "no_error_buckets",
      }),
    ]);

    const artifactDetailResponse = await fetch(
      `${baseUrl}/v1/benchlab/artifacts/${encodeURIComponent(
        "openai-compatible-prompt-bfcl-ralph::claim-ollama-qwen3-5-4b-10-minimal"
      )}`
    );
    const artifactDetailPayload = await artifactDetailResponse.json();
    expect(artifactDetailResponse.status).toBe(200);
    expect(artifactDetailPayload.reportMarkdown).toContain("Overall Acc");
    expect(artifactDetailPayload.chartSvg).toContain("<svg");
    expect(artifactDetailPayload.errorForensicsJson).toEqual(
      expect.objectContaining({
        registries: expect.objectContaining({
          "qwen3.5:4b-prompt-baseline": expect.objectContaining({
            error_items: 6,
          }),
        }),
      })
    );

    const compareResponse = await fetch(
      `${baseUrl}/v1/benchlab/compare?left=runtime-compare-left&right=runtime-compare-right`
    );
    const comparePayload = await compareResponse.json();
    expect(compareResponse.status).toBe(200);
    expect(comparePayload.summary).toEqual(
      expect.objectContaining({
        leftBetter: 0,
        rightBetter: 2,
        shared: 2,
      })
    );
    expect(comparePayload.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelName: "qwen3.5:4b",
          verdict: "right-better",
          deltaPpShift: 1,
        }),
        expect.objectContaining({
          modelName: "llama3.2:latest",
          verdict: "right-better",
          deltaPpShift: 0.2,
        }),
      ])
    );

    const variantLeaderboardResponse = await fetch(
      `${baseUrl}/v1/benchlab/leaderboards/variants`
    );
    const variantLeaderboardPayload = await variantLeaderboardResponse.json();
    expect(variantLeaderboardResponse.status).toBe(200);
    expect(variantLeaderboardPayload.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelKey: "Ollama::qwen3.5:4b",
          variant: "minimal",
          avgDeltaPp: 0.8,
        }),
      ])
    );
    expect(variantLeaderboardPayload.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bestVariant: "minimal",
          modelName: "qwen3.5:4b",
          stage: "validated",
          testedVariants: expect.arrayContaining(["minimal", "schema-lock"]),
        }),
        expect.objectContaining({
          dominantBucket: "missing_args",
          modelName: "gemma3:4b",
          nextVariantsToTry: expect.arrayContaining(["schema-lock"]),
        }),
      ])
    );
  });

  it("creates a job and exposes it through jobs and runs endpoints", async () => {
    const fixture = createBenchLabFixtureRoot();
    const baseUrl = await startServer({
      benchmarkRoot: "/tmp/bfcl",
      jobLauncher: ({ stdoutPath, stderrPath }) => {
        writeFileSync(stdoutPath, "job started\n");
        writeFileSync(stderrPath, "");
        const normalizedRuntimeRoot = dirname(stdoutPath);
        writeFileSync(
          join(normalizedRuntimeRoot, "matrix_summary.json"),
          JSON.stringify(
            {
              categories: ["simple_python"],
              cases_per_category: 5,
              preflight_only: false,
              counts: {
                completed: 1,
                improved: 1,
                flat: 0,
                regressed: 0,
                failed: 0,
                preflight_ok: 0,
                unknown: 0,
              },
              models_file: join(fixture.matrixRoot, "models.ollama.local.json"),
              records: [
                {
                  id: "openai-compatible-qwen3-5-4b-minimal",
                  kind: "openai-compatible",
                  label: "Qwen 3.5 minimal",
                  model_name: "qwen3.5:4b",
                  outcome: "improved",
                  overall_baseline: 6.08,
                  overall_delta_pp: 1.25,
                  overall_ralph: 7.33,
                  overall_relative_delta_percent: 20.56,
                  provider_name: "Ollama",
                  ralph_variant: "minimal",
                  runtime_root:
                    "experiments/prompt-bfcl-ralph-matrix/runtime-test-suite/runs/openai-compatible-qwen3-5-4b-minimal",
                  status: "completed",
                },
                {
                  id: "openai-compatible-phi3-coverage",
                  kind: "openai-compatible",
                  label: "Phi-3 coverage",
                  model_name: "phi3:latest",
                  outcome: "unknown",
                  overall_baseline: null,
                  overall_delta_pp: null,
                  overall_ralph: null,
                  overall_relative_delta_percent: null,
                  provider_name: "Ollama",
                  ralph_variant: "coverage",
                  runtime_root:
                    "experiments/prompt-bfcl-ralph-matrix/runtime-test-suite/runs/openai-compatible-phi3-coverage",
                  status: "running",
                },
                {
                  id: "openai-compatible-gemma3-4b-schema-lock",
                  kind: "openai-compatible",
                  label: "Gemma 3 schema-lock",
                  model_name: "gemma3:4b",
                  outcome: "unknown",
                  overall_baseline: null,
                  overall_delta_pp: null,
                  overall_ralph: null,
                  overall_relative_delta_percent: null,
                  provider_name: "Ollama",
                  ralph_variant: "schema-lock",
                  runtime_root:
                    "experiments/prompt-bfcl-ralph-matrix/runtime-test-suite/runs/openai-compatible-gemma3-4b-schema-lock",
                  status: "running",
                },
              ],
            },
            null,
            2
          )
        );
        writeFileSync(
          join(normalizedRuntimeRoot, "matrix_report.md"),
          "# Matrix Report\n\n- improved\n"
        );
        const modelRunRoot = join(
          normalizedRuntimeRoot,
          "runs",
          "openai-compatible-qwen3-5-4b-minimal"
        );
        mkdirSync(modelRunRoot, { recursive: true });
        writeFileSync(
          join(modelRunRoot, "summary.json"),
          JSON.stringify(
            {
              categories: [
                "multiple",
                "parallel",
                "parallel_multiple",
                "simple_python",
              ],
              cases_per_category: 10,
              metrics_percent_point: {
                "Overall Acc": {
                  baseline: 6.08,
                  ralph: 7.33,
                  delta: 1.25,
                },
              },
            },
            null,
            2
          )
        );
        writeFileSync(
          join(modelRunRoot, "benchmark_report.md"),
          [
            "# OpenAI-Compatible Prompt-Mode BFCL Benchmark Report",
            "",
            "- Provider: `Ollama`",
            "- Model: `qwen3.5:4b`",
            "",
            "## Scoreboard",
            "",
            "| Metric | Baseline | RALPH | Delta (pp) |",
            "|---|---:|---:|---:|",
            "| Overall Acc | 6.08 | 7.33 | +1.25 |",
            "",
          ].join("\n")
        );
        writeFileSync(
          join(modelRunRoot, "stdout.log"),
          "baseline and ralph done\n"
        );
        writeFileSync(join(modelRunRoot, "stderr.log"), "");
        writeFileSync(
          join(modelRunRoot, "error_forensics.json"),
          JSON.stringify(
            {
              registries: {
                "qwen3.5:4b-prompt-baseline": {
                  error_items: 6,
                  error_reasons: [
                    {
                      count: 6,
                      reason: "timeout",
                      sample_ids: ["multiple_5", "multiple_6"],
                    },
                  ],
                  total_items: 40,
                },
                "qwen3.5:4b-prompt-ralph-loop-minimal": {
                  error_items: 1,
                  error_reasons: [
                    {
                      count: 1,
                      reason: "timeout",
                      sample_ids: ["multiple_7"],
                    },
                  ],
                  total_items: 40,
                },
              },
            },
            null,
            2
          )
        );
        const runningModelRunRoot = join(
          normalizedRuntimeRoot,
          "runs",
          "openai-compatible-phi3-coverage"
        );
        mkdirSync(runningModelRunRoot, { recursive: true });
        writeFileSync(join(runningModelRunRoot, "stdout.log"), "");
        writeFileSync(
          join(runningModelRunRoot, "stderr.log"),
          [
            "Generating results for phi3:latest-prompt-baseline: 98%|█████████▊| 78/80 [00:12<00:00, 6.12it/s]",
            "",
          ].join("\n")
        );
        const phaseOnlyModelRunRoot = join(
          normalizedRuntimeRoot,
          "runs",
          "openai-compatible-gemma3-4b-schema-lock"
        );
        mkdirSync(phaseOnlyModelRunRoot, { recursive: true });
        writeFileSync(join(phaseOnlyModelRunRoot, "stdout.log"), "");
        writeFileSync(
          join(phaseOnlyModelRunRoot, "stderr.log"),
          "Generating results for [gemma3:4b-prompt-ralph]\n"
        );
        return {
          pid: 4321,
          kill: () => {
            // no-op test launcher
          },
          completion: Promise.resolve(0),
        };
      },
      pythonExecutable: "/usr/bin/python3",
      repoRoot: fixture.repoRoot,
    });

    const createResponse = await fetch(`${baseUrl}/v1/benchlab/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "benchmark",
        modelsFile: "models.ollama.local.json",
        runtimeName: "runtime-test-suite",
        casesPerCategory: 5,
      }),
    });
    const createPayload = await createResponse.json();
    expect(createResponse.status).toBe(202);
    expect(createPayload.job.status).toBe("running");

    await new Promise((resolve) => setTimeout(resolve, 20));

    const jobsResponse = await fetch(`${baseUrl}/v1/benchlab/jobs`);
    const jobsPayload = await jobsResponse.json();
    expect(jobsResponse.status).toBe(200);
    expect(jobsPayload.jobs[0].status).toBe("completed");

    const runsResponse = await fetch(`${baseUrl}/v1/benchlab/runs`);
    const runsPayload = await runsResponse.json();
    expect(runsResponse.status).toBe(200);
    expect(runsPayload.runs[0].name).toBe("runtime-test-suite");
    expect(runsPayload.runs[0].primaryOutcome).toBe("improved");

    const runDetailResponse = await fetch(
      `${baseUrl}/v1/benchlab/runs/runtime-test-suite`
    );
    const runDetailPayload = await runDetailResponse.json();
    expect(runDetailResponse.status).toBe(200);
    expect(runDetailPayload.run.reportMarkdown).toContain("Matrix Report");

    const runtimeModelsResponse = await fetch(
      `${baseUrl}/v1/benchlab/runs/runtime-test-suite/models`
    );
    const runtimeModelsPayload = await runtimeModelsResponse.json();
    expect(runtimeModelsResponse.status).toBe(200);
    expect(runtimeModelsPayload.modelRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelName: "qwen3.5:4b",
          outcome: "improved",
          deltaPp: 1.25,
        }),
        expect.objectContaining({
          name: "openai-compatible-phi3-coverage",
          status: "running",
          executionPhase: "phi3:latest-prompt-baseline",
          progressCurrent: 78,
          progressTotal: 80,
          progressPercent: 98,
        }),
        expect.objectContaining({
          name: "openai-compatible-gemma3-4b-schema-lock",
          status: "running",
          executionPhase: "gemma3:4b-prompt-ralph",
          progressCurrent: null,
          progressTotal: null,
          progressPercent: null,
        }),
      ])
    );
    expect(runtimeModelsPayload.modelRuns[0].status).toBe("running");

    const runtimeModelDetailResponse = await fetch(
      `${baseUrl}/v1/benchlab/runs/runtime-test-suite/models/openai-compatible-qwen3-5-4b-minimal`
    );
    const runtimeModelDetailPayload = await runtimeModelDetailResponse.json();
    expect(runtimeModelDetailResponse.status).toBe(200);
    expect(runtimeModelDetailPayload.reportMarkdown).toContain("Overall Acc");
    expect(runtimeModelDetailPayload.forensics).toEqual(
      expect.objectContaining({
        baselineErrorItems: 6,
        dominantBucket: "timeout",
        ralphErrorItems: 1,
      })
    );
    expect(runtimeModelDetailPayload.stdout).toContain(
      "baseline and ralph done"
    );

    const runningRuntimeModelDetailResponse = await fetch(
      `${baseUrl}/v1/benchlab/runs/runtime-test-suite/models/openai-compatible-phi3-coverage`
    );
    const runningRuntimeModelDetailPayload =
      await runningRuntimeModelDetailResponse.json();
    expect(runningRuntimeModelDetailResponse.status).toBe(200);
    expect(runningRuntimeModelDetailPayload.modelRun.status).toBe("running");
    expect(runningRuntimeModelDetailPayload.modelRun.progressCurrent).toBe(78);
    expect(runningRuntimeModelDetailPayload.stderr).toContain("78/80");

    const forensicsResponse = await fetch(
      `${baseUrl}/v1/benchlab/runs/runtime-test-suite/forensics`
    );
    const forensicsPayload = await forensicsResponse.json();
    expect(forensicsResponse.status).toBe(200);
    expect(forensicsPayload.forensics).toEqual(
      expect.objectContaining({
        baselineErrorItems: 6,
        modelsWithErrors: 1,
        modelsWithImprovedErrors: 1,
        ralphErrorItems: 1,
      })
    );
    expect(forensicsPayload.forensics.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baselineCount: 6,
          bucket: "timeout",
          deltaCount: -5,
          ralphCount: 1,
        }),
      ])
    );

    const logsResponse = await fetch(
      `${baseUrl}/v1/benchlab/jobs/${createPayload.job.id}/logs`
    );
    const logsPayload = await logsResponse.json();
    expect(logsResponse.status).toBe(200);
    expect(logsPayload.logs.stdout.text).toContain("job started");
  });

  it("cancels a running job", async () => {
    const fixture = createBenchLabFixtureRoot();
    let wasKilled = false;
    let resolveCompletion: ((value: number) => void) | null = null;
    const baseUrl = await startServer({
      benchmarkRoot: "/tmp/bfcl",
      jobLauncher: ({ stdoutPath, stderrPath }) => {
        writeFileSync(stdoutPath, "job started\n");
        writeFileSync(stderrPath, "");
        return {
          pid: 9876,
          kill: () => {
            wasKilled = true;
            resolveCompletion?.(1);
          },
          completion: new Promise<number>((resolve) => {
            resolveCompletion = resolve;
          }),
        };
      },
      pythonExecutable: "/usr/bin/python3",
      repoRoot: fixture.repoRoot,
    });

    const createResponse = await fetch(`${baseUrl}/v1/benchlab/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "benchmark",
        modelsFile: "models.ollama.local.json",
        runtimeName: "runtime-cancel-me",
      }),
    });
    const createPayload = await createResponse.json();
    const jobId = createPayload.job.id;

    const cancelResponse = await fetch(
      `${baseUrl}/v1/benchlab/jobs/${jobId}/cancel`,
      {
        method: "POST",
      }
    );
    const cancelPayload = await cancelResponse.json();
    expect(cancelResponse.status).toBe(200);
    expect(cancelPayload.job.status).toBe("cancelled");
    expect(wasKilled).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const jobsResponse = await fetch(`${baseUrl}/v1/benchlab/jobs`);
    const jobsPayload = await jobsResponse.json();
    expect(jobsPayload.jobs[0].status).toBe("cancelled");
  });
});
