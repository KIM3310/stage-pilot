# StagePilot Architecture

## Goal

Turn unreliable tool-call text from non-native models into stable, schema-correct tool execution. Measure the improvement.

## Pieces

- `@ai-sdk-tool/parser` -- parsing and type coercion
- `StagePilot API` -- orchestration and runtime endpoints
- `BenchLab` -- benchmark comparison, failure analysis, artifact review

## How they fit together

```mermaid
flowchart LR
  Caller[App / Agent] --> Parser[@ai-sdk-tool/parser]
  Parser --> StagePilot[StagePilot API]
  StagePilot --> Bench[Benchmark Summary]
  StagePilot --> Notify[Notifications / Handoffs]
  Bench --> Review[BenchLab Summary Pack]
```

## Reliability

- Malformed tool-call text gets normalized before execution
- Benchmark shows which strategies work and which don't
- BenchLab keeps artifact-level proof, not just claims
- Summary pack shows the lift before you dig into raw JSON

## For AI engineers

- Schema coercion and format normalization depth
- Bounded retry strategy
- Benchmark-backed numbers
- Reusable middleware

## For architects

- Parser layer and orchestration layer are separate
- Deploys from local demo to Cloud Run
- Clear integration boundary for downstream systems
- Benchmark data makes rollout decisions easier to justify

## Next steps

- Hosted benchmark dashboard
- Per-model latency and cost scorecard
- Signed artifact snapshots for benchmark runs
- Deployment docs for Cloud Run + API gateway
