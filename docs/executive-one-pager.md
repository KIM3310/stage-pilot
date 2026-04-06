# StagePilot -- What This Is

## tl;dr

Tool-calling reliability runtime with benchmarks. Good starting point for runtime reliability and tool-call validation conversations.

## Problem

Tool-call failures look like model failures, but they're usually parsing and handoff problems. Makes agent rollouts seem less reliable than they actually are.

## What it does

- Improves success rate for models without native tool calling
- Has benchmarks to back up the claims
- Wraps parser reliability and retry logic into a reusable runtime

## Key numbers

- Success-rate lift over baseline
- Retry recovery rate
- Weakest strategy bucket
- Middleware latency overhead

## Adoption path

1. Benchmark-only validation
2. Drop middleware into one workflow
3. Full StagePilot integration with notifications and handoff

## Where to look

- `pnpm review:proof`
- `/v1/runtime-brief`
- `/v1/summary-pack`
- `/v1/trace-observability-pack`
- `docs/benchmarks/stagepilot-latest.json`
- `docs/solution-architecture.md`
