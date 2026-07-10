# ADR-001: Stage-Gated Pipeline

## Status

Accepted

## Context

We need to handle tool calls from models that produce unreliable structured output. Single-pass approach (one model call, extract tool call, execute) mixes too many concerns together. When something breaks you can't tell if it was a safety issue, bad planning, malformed output, or just a wrong answer.

Benchmark showed single-pass gets 25% success on our 40-case suite. Parser middleware alone bumps that to 65%. Adding retry gets to 90%. The remaining failures need actual multi-agent reasoning.

## Decision

Five-stage pipeline run by `StagePilotEngine`:

1. **EligibilityAgent** -- is this request in scope? Rejects early before wasting inference.
2. **SafetyAgent** -- checks against safety policies. Blocks bad requests before planning.
3. **PlannerAgent** -- generates the tool-call plan. Parser middleware normalizes the raw output.
4. **OutreachAgent** -- executes the tool calls, handles retries and partial failures.
5. **JudgeAgent** -- reviews execution results. Can trigger replay if quality is off.

Each stage emits OpenTelemetry spans so you can trace where things broke.

## Consequences

Good:
- When a case fails, you know which stage. No more guessing.
- Each stage can use different models/temperatures.
- You can adopt just the middleware without the full pipeline.
- Every decision is logged.

Trade-offs:
- More latency from sequential calls. Mitigated by early rejection at Eligibility/Safety.
- More config and monitoring overhead. OTel + Prometheus help with this.
- Higher API costs per request, but fewer wasted retries in practice.
