<img width="3168" height="1344" alt="AI SDK Tool monorepo banner" src="https://github.com/user-attachments/assets/9a002988-e535-42ac-8baf-56ec8754410f" />

# StagePilot: Reliable Tool Calling for Non-Native Models

[![npm - parser](https://img.shields.io/npm/v/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![npm downloads - parser](https://img.shields.io/npm/dt/@ai-sdk-tool/parser)](https://www.npmjs.com/package/@ai-sdk-tool/parser)
[![codecov](https://codecov.io/gh/minpeter/ai-sdk-tool-call-middleware/branch/main/graph/badge.svg)](https://codecov.io/gh/minpeter/ai-sdk-tool-call-middleware)

`StagePilot` combines two things in one repo:

1. `@ai-sdk-tool/parser`: AI SDK middleware for parsing tool calls from models that do not natively support `tools`.
2. A hackathon-ready multi-agent orchestration vertical (`src/stagepilot`) with benchmark, API, demo UI, and Cloud Run deployment path.

## Project links

- GitHub profile: https://github.com/KIM3310
- GitHub repository: https://github.com/KIM3310/stage-pilot
- Demo video: https://youtu.be/6trgTH1vX4M

## References and attribution

- Fork reference used during implementation: https://github.com/KIM3310/ai-sdk-tool-call-middleware
- Upstream source repository: https://github.com/minpeter/ai-sdk-tool-call-middleware

## Hackathon context

Built at the Gemini 3 Seoul Hackathon with a focus on tool-calling reliability, benchmarked success-rate improvement, and operational handoff readiness.

If API integration is needed, you can connect and use it immediately through the provided API endpoints (`/v1/plan`, `/v1/benchmark`, `/v1/insights`, `/v1/whatif`, `/v1/notify`), either locally or on Cloud Run.

## Why this repo exists

Many models still output tool calls as loose text (`<tool_call>...</tool_call>`, relaxed JSON, trailing tokens, mixed formatting). This project hardens that path so tool execution remains stable instead of silently failing.

For StagePilot, this directly improves operation routing reliability by:

- parsing malformed tool-call text safely,
- coercing payloads to schema-compatible shapes,
- applying a bounded Ralph-loop retry when the first call is invalid.

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
- `POST /v1/plan`
- `POST /v1/benchmark`
- `POST /v1/insights`
- `POST /v1/whatif`
- `POST /v1/notify`
- `POST /v1/openclaw/inbox`

See full behavior and payload examples in [`docs/STAGEPILOT.md`](docs/STAGEPILOT.md).

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
- Parser core examples: [`examples/parser-core/README.md`](examples/parser-core/README.md)
- RXML examples: [`examples/rxml-core/README.md`](examples/rxml-core/README.md)

## License

Apache-2.0
