<img width="3168" height="1344" alt="StagePilot reliability runtime banner" src="https://github.com/user-attachments/assets/9a002988-e535-42ac-8baf-56ec8754410f" />

# StagePilot: Stage-Gated Tool-Calling Reliability Runtime

[![npm - parser](https://img.shields.io/npm/v/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![npm downloads - parser](https://img.shields.io/npm/dt/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![CI](https://github.com/KIM3310/stage-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/KIM3310/stage-pilot/actions)
[![codecov](https://codecov.io/gh/KIM3310/stage-pilot/branch/main/graph/badge.svg)](https://codecov.io/gh/KIM3310/stage-pilot)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

`StagePilot` is a TypeScript runtime and benchmark harness for stabilizing tool calls across provider families. It stage-gates unstable runs through parse, repair, replay, and review so reliability claims stay inspectable.

The repo brings together three connected surfaces:

1. `@ai-sdk-tool/parser`: AI SDK middleware for parsing tool calls from models that do not natively support `tools`.
2. `StagePilot`: a multi-agent orchestration runtime with benchmark, API, and demo UI.
3. `BenchLab`: prompt-mode BFCL experiment tooling, forensics, and local operator APIs.

## Hiring Fit And Proof Boundary

- **Best fit roles:** applied AI engineer, LLM systems engineer, runtime reliability engineer, GenAI solution architect
- **Strongest public proof:** public npm package, checked-in benchmark artifacts, runnable API/demo surface
- **What is real here:** parser middleware, benchmark harness, checked-in scorecards, deployment surfaces, and API runtime
- **What is bounded here:** benchmark latency is in-process harness timing rather than end-to-end hosted-network latency; provider integrations stay optional

## Latest Verified Snapshot

- **Verified on:** 2026-03-28
- **Command:** `npm run verify`
- **Outcome:** passed locally; 186 test files / 1,720 tests plus package and DTS build completed
- **Notes:** optional provider integrations still remain env-gated and are not required for the local proof path

## Why StagePilot?

Large language models that lack native tool-calling support — or expose it inconsistently — produce unreliable structured output when asked to invoke external functions. A model might wrap arguments in XML one turn, switch to JSON the next, hallucinate tool names, or silently drop required parameters. In production, this means broken agent pipelines, silent data loss, and hours of forensic debugging. The baseline success rate on our 40-case benchmark is just 25%.

Existing solutions tend to paper over the problem with regex-based extraction or single-pass prompt engineering. These approaches are fragile: they break when the model's output format drifts, they cannot recover from partial failures, and they give operators no visibility into _where_ or _why_ a tool call went wrong. When reliability matters — when an agent is booking real appointments, querying real databases, or orchestrating real infrastructure — "usually works" is not good enough.

StagePilot takes a different approach: a **stage-gated pipeline** that decomposes tool-call handling into discrete, inspectable phases. Each stage (Eligibility, Safety, Planner, Outreach, Judge) has a single responsibility, its own pass/fail criteria, and produces structured telemetry. The parser middleware layer handles format normalization and schema coercion, while the repair-and-replay loop recovers from malformed output without re-running the entire chain. This architecture brings tool-call success from 25% to 90% at the middleware layer alone — and the multi-agent pipeline pushes reliability further while keeping every decision auditable.

## 60-Second Quick Start

```bash
pnpm install
pnpm api:stagepilot
# open http://127.0.0.1:8080/demo
```

## Benchmark Results

Source: [`docs/benchmarks/stagepilot-latest.json`](docs/benchmarks/stagepilot-latest.json) — 40 cases, 20 mutation modes.

| Strategy | Parse/Plan Success | Success Rate | Avg Latency (ms) |
|---|---:|---:|---:|
| `baseline` | 10 / 40 | 25.00% | 0.02 |
| `middleware` | 26 / 40 | 65.00% | 0.12 |
| `middleware+ralph-loop` | 36 / 40 | **90.00%** | 0.05 |

Known failure modes (4 remaining cases): wrong tool name hallucination (`bench-17`, `bench-37`) and empty-argument reproduction (`bench-14`, `bench-34`).

## `@ai-sdk-tool/parser` Usage

```bash
pnpm add @ai-sdk-tool/parser
```

```ts
import { morphXmlToolMiddleware } from "@ai-sdk-tool/parser";
import { wrapLanguageModel, streamText } from "ai";

const result = streamText({
  model: wrapLanguageModel({ model, middleware: morphXmlToolMiddleware }),
  prompt: "What is the weather in Seoul?",
  tools: { get_weather: { ... } },
});
```

| Middleware | Best for |
|---|---|
| `hermesToolMiddleware` | JSON-style tool payloads |
| `morphXmlToolMiddleware` | XML-style payloads + schema-aware coercion |
| `yamlXmlToolMiddleware` | XML tool tags + YAML bodies |
| `qwen3CoderToolMiddleware` | Qwen/UI-TARS style `<tool_call>` markup |

## Architecture

- `EligibilityAgent` → `SafetyAgent` → `PlannerAgent` → `OutreachAgent` → `JudgeAgent` — orchestrated by `StagePilotEngine`
- Parser layer: `src/core/` handles malformed tool-call text, schema coercion, streaming without native provider tooling
- Benchmark layer: `src/stagepilot/benchmark.ts` — deterministic in-process harness, not LLM network latency

```
stage-pilot/
  src/
    adapters/          # Multi-cloud integrations (AWS, GCP)
    api/               # HTTP server, Prometheus metrics
    core/              # Parser protocols, utilities
    stagepilot/        # Orchestration runtime, agents, benchmark
    telemetry/         # OpenTelemetry instrumentation
  tests/               # 184 test files, 1,713 tests
  infra/k8s/           # Kubernetes manifests
  infra/terraform/     # GCP Terraform IaC
  docs/benchmarks/     # Checked-in benchmark artifacts
  experiments/         # Prompt-mode BFCL experiments
```

## Core API

```bash
pnpm api:stagepilot  # starts on http://127.0.0.1:8080
```

| Endpoint | Description |
|---|---|
| `POST /v1/plan` | Route a case through the full agent pipeline |
| `POST /v1/benchmark` | Run the 40-case benchmark suite |
| `POST /v1/insights` | Generate narrative insights from benchmark data |
| `POST /v1/whatif` | What-if simulation for staffing/demand deltas |
| `GET /v1/metrics` | Prometheus metrics |

## Deployment

**Docker**
```bash
docker build -t stagepilot-api .
docker run -p 8080:8080 -e GEMINI_API_KEY="$GEMINI_API_KEY" stagepilot-api
```

**GCP Cloud Run**
```bash
pnpm deploy:stagepilot
```

**Kubernetes**
```bash
kubectl create namespace stagepilot
kubectl create secret generic stagepilot-secrets --namespace stagepilot \
  --from-literal=gemini-api-key="$GEMINI_API_KEY"
kubectl apply -f infra/k8s/
```

**Vercel / Cloudflare Workers** — see `vercel.json` and `wrangler.toml`.

## Tech Stack

TypeScript · Node.js · AI SDK · Zod · Prometheus · OpenTelemetry · GCP (Cloud Run, GCS, BigQuery) · AWS (S3, CloudWatch) · Kubernetes · Terraform · Vercel · Cloudflare Workers

## References

- npm: [@ai-sdk-tool/parser](https://www.npmjs.com/package/@ai-sdk-tool/parser)
- Upstream lineage: [minpeter/ai-sdk-tool-call-middleware](https://github.com/minpeter/ai-sdk-tool-call-middleware)
- Demo video: https://youtu.be/6trgTH1vX4M

## Related Projects

This repo's middleware brings tool-call success from 25% to 90%. [tool-call-finetune-lab](https://github.com/KIM3310/tool-call-finetune-lab) explores closing the remaining gap through model fine-tuning.

## License

Apache-2.0
