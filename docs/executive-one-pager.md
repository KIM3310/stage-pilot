# StagePilot Executive One-Pager

## Problem

Tool-calling failures often look like model failures, but many are really parsing and handoff failures. That makes agent rollouts appear less reliable than they should be.

## What StagePilot changes

- raises success rate for non-native tool-calling models
- exposes benchmark lift in a reviewer-first surface
- turns parser reliability into a productized integration layer

## Buyer value

- fewer silent tool-call failures
- easier adoption of cheaper or non-native models
- benchmark-backed rollout decisions instead of intuition

## Key metrics

- success-rate lift over baseline
- retry recovery rate
- weakest strategy bucket
- latency overhead of the middleware path

## Rollout

1. benchmark-only validation
2. middleware insertion for one workflow
3. orchestrated StagePilot integration with notifications and handoff

## Best proof path

- `/v1/benchmark-summary`
- `/v1/review-pack`
- `/v1/benchlab/review-pack`
- `docs/benchmarks/stagepilot-latest.json`
- `docs/solution-architecture.md`
