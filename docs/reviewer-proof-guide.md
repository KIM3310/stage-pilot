# StagePilot reviewer proof guide

Use this when you want the fastest credible read of the repo for Big Tech / frontier LLM / solutions-architect style review.

## What to believe first

Truth hierarchy for claims in this repo:

1. checked-in benchmark artifact: `docs/benchmarks/stagepilot-latest.json`
2. API review surfaces: `/v1/runtime-brief`, `/v1/review-pack`, `/v1/benchmark-summary`
3. checked-in docs that explain boundaries: this guide, `docs/executive-one-pager.md`, `docs/solution-architecture.md`
4. static site / SVG reviewer aids: `site/`, `docs/review-pack.svg`

If two surfaces disagree, trust the benchmark artifact and API review pack over the static docs surface.

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
4. `docs/review-pack.svg`
5. `docs/STAGEPILOT.md` only if you want runtime/operator details

## API proof path

Start here when you want the runtime-backed reviewer surface instead of reading raw files.

1. `GET /v1/runtime-brief` — confirms readiness, integrations, and review posture
2. `GET /v1/review-pack` — benchmark-backed reviewer proof pack
3. `GET /v1/benchmark-summary` — concise success-rate lift and weakest-strategy story
4. `GET /v1/developer-ops-pack` — developer workflow / release lane posture
5. `GET /v1/workflow-run-replay` — replay-oriented review surface after execution

## Strongest current claim

The most defensible repo headline is not "hosted agent platform." It is:

> reliable tool calling for non-native models, grounded in checked-in benchmark lift and reviewer-ready API/docs surfaces

Current checked-in benchmark snapshot:
- baseline: `29.17%`
- parser middleware: `87.50%`
- bounded retry loop: `100.00%`
- delta vs baseline: `+58.33pp` middleware, `+70.83pp` loop

## Safe interview framing

Use these boundaries to keep the portfolio story honest:

- **Strong claim:** parser middleware + benchmark discipline + reviewable orchestration surface
- **Careful claim:** StagePilot runtime/API shape is production-minded and Cloud Run-friendly
- **Avoid overstating:** static site and docs are reviewer aids, not proof of sustained hosted traffic

## If you only have two minutes

- run `pnpm review:proof`
- open `docs/benchmarks/stagepilot-latest.json`
- hit `/v1/review-pack`
- scan `docs/solution-architecture.md`

That is enough to understand the repo's real value without getting lost in implementation detail.
