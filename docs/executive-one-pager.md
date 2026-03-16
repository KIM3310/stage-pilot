# StagePilot Executive One-Pager

## Primary read

StagePilot works best as a concise sample of **runtime reliability and tool-calling validation**. It can also support broader systems and architecture conversations, but the reliability lens is the clearest starting point.

## Problem

Tool-calling failures often look like model failures, but many are really parsing and handoff failures. That makes agent rollouts appear less reliable than they should be.

## What StagePilot changes

- raises success rate for non-native tool-calling models
- exposes benchmark lift through compact, bounded evidence surfaces
- turns parser reliability and retry discipline into a productized runtime boundary

## Review value

- fewer silent tool-call failures
- easier adoption of cheaper or non-native models
- benchmark-backed rollout decisions instead of intuition
- a compact way to review reliability posture without overstating hosted-platform maturity

## Key metrics

- success-rate lift over baseline
- retry recovery rate
- weakest strategy bucket
- latency overhead of the middleware path

## Rollout

1. benchmark-only validation
2. middleware insertion for one workflow
3. orchestrated StagePilot integration with notifications and handoff

## Best evidence path

- `pnpm review:proof`
- `/v1/runtime-brief`
- `/v1/summary-pack`
- `/v1/trace-observability-pack`
- `docs/benchmarks/stagepilot-latest.json`
- `docs/solution-architecture.md`
