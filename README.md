<img width="3168" height="1344" alt="StagePilot banner" src="https://github.com/user-attachments/assets/9a002988-e535-42ac-8baf-56ec8754410f" />

# StagePilot

[![npm - parser](https://img.shields.io/npm/v/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![npm downloads - parser](https://img.shields.io/npm/dt/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![CI](https://github.com/KIM3310/stage-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/KIM3310/stage-pilot/actions)
[![codecov](https://codecov.io/gh/KIM3310/stage-pilot/branch/main/graph/badge.svg)](https://codecov.io/gh/KIM3310/stage-pilot)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

TypeScript runtime for making tool calls work with models that don't natively support them (or do it inconsistently). Parses, repairs, and retries malformed tool-call output so you don't have to.

Three main pieces:

1. `@ai-sdk-tool/parser` - AI SDK middleware that extracts tool calls from raw model text
2. `StagePilot` - multi-agent orchestration runtime with benchmark + API
3. `BenchLab` - BFCL experiment tooling for prompt-mode tool calling

## Why this exists

Models without native tool support produce unreliable output -- XML one turn, JSON the next, hallucinated tool names, missing args. On our 40-case benchmark, baseline success is 25%.

Most workarounds are regex hacks or single-pass prompts. They break when the format drifts and give you no way to see what went wrong.

StagePilot breaks tool-call handling into stages (Eligibility, Safety, Planner, Outreach, Judge), each with its own pass/fail gate and telemetry. The parser middleware handles format normalization and schema coercion; the retry loop recovers from malformed output. This gets success from 25% to 90% with middleware+retry.

## Quick start

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

## Layout

Pipeline: `EligibilityAgent` -> `SafetyAgent` -> `PlannerAgent` -> `OutreachAgent` -> `JudgeAgent`, run by `StagePilotEngine`.

```
src/
  adapters/          # AWS, GCP integrations
  api/               # HTTP server, Prometheus
  core/              # Parser protocols, utils
  stagepilot/        # Orchestration, agents, benchmark
  telemetry/         # OpenTelemetry
tests/               # ~1700 tests
infra/               # k8s manifests, Terraform
docs/benchmarks/     # Benchmark artifacts
experiments/         # BFCL experiments
```

## API

```bash
pnpm api:stagepilot  # http://127.0.0.1:8080
```

| Endpoint | What it does |
|---|---|
| `POST /v1/plan` | Run a case through the agent pipeline |
| `POST /v1/benchmark` | Run the 40-case benchmark |
| `POST /v1/insights` | Narrative insights from benchmark data |
| `POST /v1/whatif` | What-if sim for staffing/demand changes |
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

## Stack

TypeScript, Node.js, AI SDK, Zod, Prometheus, OpenTelemetry, GCP Cloud Run, AWS S3/CloudWatch, k8s, Terraform, Vercel, Cloudflare Workers

## Links

- npm: [@ai-sdk-tool/parser](https://www.npmjs.com/package/@ai-sdk-tool/parser)
- Based on: [minpeter/ai-sdk-tool-call-middleware](https://github.com/minpeter/ai-sdk-tool-call-middleware)
- Demo: https://youtu.be/6trgTH1vX4M
- Related: [tool-call-finetune-lab](https://github.com/KIM3310/tool-call-finetune-lab) -- fine-tuning approach for the remaining 10% gap

## License

Apache-2.0
