# Validation guide

How to verify what this repo actually does, starting from benchmark data.

## What this is

Tool-calling reliability with checked-in benchmark evidence. The work is benchmarked, bounded, and you can verify it yourself.

## Trust order

1. Benchmark artifact: `docs/benchmarks/stagepilot-latest.json`
2. API endpoints: `/v1/runtime-brief`, `/v1/summary-pack`, `/v1/benchmark-summary`
3. These docs: this guide, `executive-one-pager.md`, `solution-architecture.md`
4. Static site / SVG: `site/`, `docs/summary-pack.svg`

If docs and API disagree, trust the benchmark artifact.

## Quick path

### Local

```bash
pnpm install
pnpm review:proof
pnpm api:stagepilot
# open http://127.0.0.1:8080/demo
```

### Reading order

1. `docs/benchmarks/stagepilot-latest.json`
2. `docs/tool-call-reliability-case-study.md`
3. `docs/executive-one-pager.md`
4. `docs/solution-architecture.md`
5. `docs/summary-pack.svg`
6. `docs/STAGEPILOT.md` for runtime/operator details

## API evidence

1. `GET /v1/runtime-brief` -- readiness, integrations
2. `GET /v1/summary-pack` -- benchmark validation data
3. `GET /v1/benchmark-summary` -- success-rate lift, weakest strategy
4. `GET /v1/developer-ops-pack` -- dev workflow / release posture
5. `GET /v1/workflow-run-replay` -- replay after execution

## Current numbers

Checked-in benchmark snapshot:
- baseline: 29.17%
- parser middleware: 87.50%
- bounded retry: 100.00% on the 24-case snapshot
- delta vs baseline: +58.33pp middleware, +70.83pp loop

## Honest framing

- **Strong:** parser middleware + benchmark discipline + reviewable orchestration
- **Reasonable:** runtime/API shape is practical and Cloud Run-friendly
- **Don't oversell:** static site and docs are supporting material, not proof of live traffic

## Two-minute version

- `pnpm review:proof`
- `docs/benchmarks/stagepilot-latest.json`
- `/v1/summary-pack`
- `docs/solution-architecture.md`
