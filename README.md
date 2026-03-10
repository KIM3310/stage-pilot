<img width="3168" height="1344" alt="AI SDK Tool monorepo banner" src="https://github.com/user-attachments/assets/9a002988-e535-42ac-8baf-56ec8754410f" />

# StagePilot: Reliable Tool Calling for Non-Native Models

[![npm - parser](https://img.shields.io/npm/v/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![npm downloads - parser](https://img.shields.io/npm/dt/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![codecov](https://codecov.io/gh/minpeter/ai-sdk-tool-call-middleware/branch/main/graph/badge.svg)](https://codecov.io/gh/minpeter/ai-sdk-tool-call-middleware)

`StagePilot` is the canonical repo for three connected surfaces:

1. `@ai-sdk-tool/parser`: AI SDK middleware for parsing tool calls from models that do not natively support `tools`.
2. `StagePilot`: a multi-agent orchestration vertical with benchmark, API, demo UI, and Cloud Run path.
3. `BenchLab`: prompt-mode BFCL experiment tooling, forensics, and local operator APIs.

## Portfolio posture
- Treat this repo as a benchmark and protocol-proof repo; the Pages site is the summary layer, not the runtime itself.
- Benchmark artifacts, runtime brief, review pack, and eval/test surfaces are the evidence base for performance claims.


## Role signals
- **AI engineer:** benchmark discipline, parser middleware, and tool-calling reliability are the core signals.
- **Solution architect:** package, API, benchmark, and review surfaces are separated enough to discuss production posture honestly.
- **Field / solutions engineer:** the repo gives you a fast benchmark walkthrough with proof artifacts instead of vague model claims.

## Project links

- GitHub profile: https://github.com/KIM3310
- GitHub repository: https://github.com/KIM3310/stage-pilot
- Demo video: https://youtu.be/6trgTH1vX4M

## Review Pack At A Glance

- StagePilot reviewer API: `GET /v1/runtime-brief`, `GET /v1/review-pack`, `GET /v1/schema/plan-report`
- StagePilot developer workflow pack: `GET /v1/developer-ops-pack`
- StagePilot workflow history: `GET /v1/workflow-runs`, `GET /v1/workflow-runs/:requestId`
- BenchLab reviewer API: `GET /v1/benchlab/runtime-brief`, `GET /v1/benchlab/review-pack`, `GET /v1/benchlab/schema/job-report`
- Checked-in benchmark proof: baseline `29.17%` -> middleware `87.50%` -> Ralph loop `100.00%`
- Checked-in BenchLab claims: runtime compare, variant leaderboard, best artifacts, and failure forensics
- Latest no-key local validation: `llama3.1:8b`, `llama3.2:latest`, `qwen3.5:4b` all moved from `7.83` to `8.33` with tuned RALPH variants on a `5` cases/category sweep
- Llama follow-up hunt: on `llama3.2:latest`, `schema-lock` stayed ahead while `parallel-safe`, `coverage`, `strict`, `call-count`, and `compact` all stayed flat in a `3` cases/category search

## Review Flow

1. `GET /v1/runtime-brief` -> confirm orchestration readiness and integration posture.
2. `GET /v1/developer-ops-pack` -> inspect MR / pipeline / release lanes before demoing automation.
3. `GET /v1/workflow-runs` -> verify recent developer workflow runs and reviewer-replay posture.
4. `GET /v1/review-pack` -> inspect benchmark lift and parser/handoff boundary.
5. `GET /v1/schema/plan-report` -> verify contract before trusting downstream routing output.
6. `GET /v1/benchlab/review-pack` -> inspect checked-in runtime and artifact claims.
7. `docs/review-pack.svg` + `docs/benchmarks/stagepilot-latest.json` -> read the strongest proof assets first.

![StagePilot Review Pack](docs/review-pack.svg)

## Further Reading

- Architecture: [`docs/solution-architecture.md`](docs/solution-architecture.md)
- Overview: [`docs/executive-one-pager.md`](docs/executive-one-pager.md)
- Discovery notes: [`docs/discovery-guide.md`](docs/discovery-guide.md)
- Local no-key sweep: [`docs/benchlab/LOCAL_OLLAMA_SWEEP_20260311.md`](docs/benchlab/LOCAL_OLLAMA_SWEEP_20260311.md)

## References and attribution

- Earlier fork / baseline reference: https://github.com/KIM3310/ai-sdk-tool-call-middleware
- Upstream source lineage: https://github.com/minpeter/ai-sdk-tool-call-middleware

This repo keeps attribution explicit while treating `stage-pilot` as the canonical working surface for new development.

## Project context

This repo focuses on tool-calling reliability, benchmarked success-rate improvement, and operational handoff readiness.

If API integration is needed, you can connect and use it immediately through the provided API endpoints (`/v1/plan`, `/v1/benchmark`, `/v1/insights`, `/v1/whatif`, `/v1/notify`), either locally or on Cloud Run.

## Why this repo exists

Many models still output tool calls as loose text (`<tool_call>...</tool_call>`, relaxed JSON, trailing tokens, mixed formatting). This project hardens that path so tool execution remains stable instead of silently failing.

For the parser layer, this means:

- parsing malformed tool-call text safely
- coercing payloads to schema-compatible shapes
- streaming tool inputs without depending on native provider tooling

For StagePilot, this directly improves operation routing reliability by:

- applying a bounded Ralph-loop retry when the first call is invalid.

For BenchLab, it creates a repeatable environment to test prompt-mode tool-calling strategies and inspect error buckets instead of relying on anecdotal wins.

## Repository layout

```text
stage-pilot/
  src/
    api/
    bin/
    stagepilot/
  tests/
  docs/
    benchmarks/
    benchlab/
  experiments/
  scripts/
```

## StagePilot benchmark (latest)

Source: [`docs/benchmarks/stagepilot-latest.json`](docs/benchmarks/stagepilot-latest.json)  
Generated at: `2026-03-02T11:15:13.733Z`  
Cases: `24` (`BENCHMARK_SEED=20260228`, `BENCHMARK_LOOP_ATTEMPTS=2`)

| Strategy | Parse/Plan Success | Success Rate | Avg Latency (ms) | P95 Latency (ms) | Avg Attempts |
|---|---:|---:|---:|---:|---:|
| `baseline` | 7 / 24 | 29.17% | 0.02 | 0.03 | 1.00 |
| `middleware` | 21 / 24 | 87.50% | 0.14 | 0.45 | 1.00 |
| `middleware+ralph-loop` | 24 / 24 | 100.00% | 0.04 | 0.08 | 1.13 |

Improvement deltas:

- Middleware vs Baseline: `+58.33pp`
- Ralph Loop vs Middleware: `+12.50pp`
- Ralph Loop vs Baseline: `+70.83pp`

Ralph-loop point (what changed):

- `middleware` is already robust on malformed payloads.
- `middleware+ralph-loop` adds one bounded retry pass (default max 2 attempts), letting the second corrected output recover remaining failures.
- In this benchmark, that closes the gap from `87.50%` to `100.00%`.

Latency note: these numbers come from deterministic in-process benchmark harness execution (parser + planning), not network LLM round-trip latency.

Review-pack surfaces now expose this benchmark delta directly through `/v1/review-pack` so reviewers can inspect the lift without parsing the raw JSON file first.

## Supporting Files

- `docs/review-pack.svg`
- `docs/DEVELOPER_OPS_PACK.md`
- `docs/benchmarks/stagepilot-latest.json`
- `docs/STAGEPILOT.md`
- `docs/benchlab/TOOL_CALLING_GAINS.md`
- `docs/benchlab/FAILURE_TAXONOMY.md`

## Quick start

### 1) Install

```bash
npm install
```

### 2) Run StagePilot demo flow

```bash
npm run demo:stagepilot
```

### 3) Run local API + judge demo UI

```bash
npm run api:stagepilot
# open http://127.0.0.1:8080/demo
```

### 4) Reproduce benchmark

```bash
npm run bench:stagepilot
```

Optional benchmark knobs:

```bash
BENCHMARK_CASES=24 BENCHMARK_SEED=20260228 BENCHMARK_LOOP_ATTEMPTS=2 npm run bench:stagepilot
```

## BenchLab quick start

Run the local BenchLab operator API:

```bash
npm run api:benchlab
# open http://127.0.0.1:8090/benchlab
```

BenchLab surfaces:

- `GET /benchlab`
- `GET /health`
- `GET /v1/benchlab/runtime-brief`
- `GET /v1/benchlab/review-pack`
- `GET /v1/benchlab/schema/job-report`
- `GET /v1/benchlab/configs`
- `GET /v1/benchlab/jobs`
- `GET /v1/benchlab/jobs/:id`
- `GET /v1/benchlab/jobs/:id/logs`
- `POST /v1/benchlab/jobs/:id/cancel`

BenchLab repo assets:

- research notes under `docs/benchlab/`
- runnable prompt-mode experiments under `experiments/`
- local operator scripts under `scripts/`

## StagePilot architecture (high-level)

- `EligibilityAgent`: triage eligibility and constraints
- `SafetyAgent`: risk and urgency assessment
- `PlannerAgent`: route/action plan generation
- `OutreachAgent`: execution-ready outreach actions
- `JudgeAgent`: final consistency gate
- `StagePilotEngine`: orchestration runtime
- `simulateStagePilotTwin`: what-if simulation for staffing/demand/contact-rate deltas
- `GeminiGateway` (optional): narrative summarization layer

Core files:

- `src/stagepilot/types.ts`
- `src/stagepilot/ontology.ts`
- `src/stagepilot/agents.ts`
- `src/stagepilot/orchestrator.ts`
- `src/stagepilot/twin.ts`
- `src/stagepilot/benchmark.ts`

## API surface

Run API:

```bash
npm run api:stagepilot
```

Endpoints:

- `GET /demo`
- `GET /health`
- `GET /v1/meta`
- `GET /v1/runtime-brief`
- `GET /v1/review-pack`
- `GET /v1/schema/plan-report`
- `POST /v1/plan`
- `POST /v1/benchmark`
- `POST /v1/insights`
- `POST /v1/whatif`
- `POST /v1/notify`
- `POST /v1/openclaw/inbox`

See full behavior and payload examples in [`docs/STAGEPILOT.md`](docs/STAGEPILOT.md).

## Service-Grade Surfaces

- `/v1/runtime-brief`, `/v1/review-pack`, and `/v1/schema/plan-report` expose StagePilot readiness, benchmark proof, parser/orchestration posture, and report contract.
- `/v1/benchlab/runtime-brief`, `/v1/benchlab/review-pack`, and `/v1/benchlab/schema/job-report` expose BenchLab evidence counts, checked-in claim proof, dominant failure buckets, and job-report expectations.
- `/demo` and `/benchlab` now render review-pack surfaces directly in the UI so reviewers can validate posture without reading code first.

BenchLab API entrypoint:

```bash
npm run api:benchlab
```

## Cloud Run deployment (Google-only)

```bash
npm run deploy:stagepilot
```

Post-deploy smoke test:

```bash
STAGEPILOT_BASE_URL="https://<your-cloud-run-url>" npm run smoke:stagepilot
```

Runtime notes:

- CPU-only enforced: `USE_GPU=0`
- Secret Manager key mapping expected for `GEMINI_API_KEY`
- safety timeouts supported:
  - `GEMINI_HTTP_TIMEOUT_MS`
  - `STAGEPILOT_REQUEST_BODY_TIMEOUT_MS`
  - `OPENCLAW_WEBHOOK_TIMEOUT_MS`
  - `OPENCLAW_CLI_TIMEOUT_MS`

## `@ai-sdk-tool/parser` usage

Install package only:

```bash
pnpm add @ai-sdk-tool/parser
```

Quick example:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { morphXmlToolMiddleware } from "@ai-sdk-tool/parser";
import { stepCountIs, streamText, wrapLanguageModel } from "ai";
import { z } from "zod";

const model = createOpenAICompatible({
  name: "openrouter",
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
})("arcee-ai/trinity-large-preview:free");

const result = streamText({
  model: wrapLanguageModel({
    model,
    middleware: morphXmlToolMiddleware,
  }),
  stopWhen: stepCountIs(4),
  prompt: "What is the weather in Seoul?",
  tools: {
    get_weather: {
      description: "Get weather by city name",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, condition: "sunny", celsius: 23 }),
    },
  },
});

for await (const part of result.fullStream) {
  // text-delta / tool-input-start / tool-input-delta / tool-input-end / tool-call / tool-result
}
```

Preconfigured middleware exports:

| Middleware | Best for |
|---|---|
| `hermesToolMiddleware` | JSON-style tool payloads |
| `morphXmlToolMiddleware` | XML-style payloads + schema-aware coercion |
| `yamlXmlToolMiddleware` | XML tool tags + YAML bodies |
| `qwen3CoderToolMiddleware` | Qwen/UI-TARS style `<tool_call>` markup |

## AI SDK compatibility

Fact-checked from this repo `CHANGELOG.md` and npm metadata (as of 2026-02-18).

| `@ai-sdk-tool/parser` major | AI SDK major | Status |
|---|---|---|
| `v1.x` | `v4.x` | Legacy |
| `v2.x` | `v5.x` | Legacy |
| `v3.x` | `v6.x` | Legacy |
| `v4.x` | `v6.x` | Active (`latest`) |

## Local development

```bash
npm run fmt:biome
npm run check
npm test
npm run build
```

If `pnpm` is not available:

```bash
corepack enable
corepack prepare pnpm@9.14.4 --activate
```

## Docs map

- StagePilot guide: [`docs/STAGEPILOT.md`](docs/STAGEPILOT.md)
- Latest benchmark artifact: [`docs/benchmarks/stagepilot-latest.json`](docs/benchmarks/stagepilot-latest.json)
- BenchLab gains: [`docs/benchlab/TOOL_CALLING_GAINS.md`](docs/benchlab/TOOL_CALLING_GAINS.md)
- BenchLab failure taxonomy: [`docs/benchlab/FAILURE_TAXONOMY.md`](docs/benchlab/FAILURE_TAXONOMY.md)
- Parser core examples: [`examples/parser-core/README.md`](examples/parser-core/README.md)
- RXML examples: [`examples/rxml-core/README.md`](examples/rxml-core/README.md)
- Prompt-mode experiments: `experiments/*`

## License

Apache-2.0

## Local Verification
```bash
pnpm install
pnpm run check
pnpm run typecheck
pnpm run test
pnpm run build
```

## Repository Hygiene
- Keep runtime artifacts out of commits (`.codex_runs/`, cache folders, temporary venvs).
- Prefer running verification commands above before opening a PR.
