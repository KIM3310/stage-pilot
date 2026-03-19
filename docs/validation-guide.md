# StagePilot validation data guide

Use this when you want the fastest credible read of the repo for AI engineer, frontier LLM runtime reliability, or Big Tech platform review. Treat solutions-architect review as a secondary lens, not the headline.

## Hiring signal to anchor

This repo should read first as: **tool-calling reliability proof for frontier/runtime teams**. The recruiter-safe takeaway is that the work is benchmarked, bounded, and reviewable.

## What to believe first

Truth hierarchy for claims in this repo:

1. checked-in benchmark artifact: `docs/benchmarks/stagepilot-latest.json`
2. API review surfaces: `/v1/runtime-brief`, `/v1/summary-pack`, `/v1/benchmark-summary`
3. checked-in docs that explain boundaries: this guide, `docs/executive-one-pager.md`, `docs/solution-architecture.md`
4. static site / SVG supporting docs: `site/`, `docs/summary-pack.svg`

If two surfaces disagree, trust the benchmark artifact and API summary pack over the static docs surface.

## 60-second path

### Local

```bash
pnpm install
pnpm review:proof
pnpm api:stagepilot
# open http://127.0.0.1:8080/demo
```

### Read in this order

1. `docs/benchmarks/stagepilot-latest.json`
2. `docs/executive-one-pager.md`
3. `docs/solution-architecture.md`
4. `docs/summary-pack.svg`
5. `docs/STAGEPILOT.md` only if you want runtime/operator details

## API evidence path

Start here when you want the runtime-backed dashboard instead of reading raw files.

1. `GET /v1/runtime-brief` — confirms readiness, integrations, and review posture
2. `GET /v1/summary-pack` — benchmark-backed validation data pack
3. `GET /v1/benchmark-summary` — concise success-rate lift and weakest-strategy story
4. `GET /v1/developer-ops-pack` — developer workflow / release lane posture
5. `GET /v1/workflow-run-replay` — replay-oriented review surface after execution

## Strongest current claim

The most defensible repo headline is not "hosted agent platform." It is:

> reliable tool calling for non-native models, grounded in checked-in benchmark lift, replayable traces, and ready API/docs surfaces

Current checked-in benchmark snapshot:
- baseline: `29.17%`
- parser middleware: `87.50%`
- bounded retry loop: `100.00%` on the current checked-in 24-case snapshot
- delta vs baseline: `+58.33pp` middleware, `+70.83pp` loop

## Safe interview framing

Use these boundaries to keep the portfolio story honest:

- **Strong claim:** parser middleware + benchmark discipline + reviewable orchestration surface
- **Careful claim:** StagePilot runtime/API shape is production-minded and Cloud Run-friendly
- **Avoid overstating:** static site and docs are supporting docs, not proof of sustained hosted traffic

## If you only have two minutes

- run `pnpm review:proof`
- open `docs/benchmarks/stagepilot-latest.json`
- hit `/v1/summary-pack`
- scan `docs/solution-architecture.md`

That is enough to understand the repo's real value without getting lost in implementation detail.
