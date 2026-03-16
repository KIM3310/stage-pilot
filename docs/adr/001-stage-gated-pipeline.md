# ADR-001: Stage-Gated Pipeline Architecture

## Status

Accepted

## Context

StagePilot needs to orchestrate tool calls for language models that produce unreliable structured output. The core challenge is that a single LLM invocation frequently fails to produce a valid, safe, and well-formed tool call — and when it does fail, operators have no visibility into which part of the process broke.

We evaluated two broad approaches:

1. **Single-pass tool calling.** Send the user request to one model, extract the tool call from its response, and execute it. This is the simplest architecture, but it conflates multiple concerns (eligibility checking, safety validation, planning, execution, and quality review) into a single inference step. When something goes wrong, the only recourse is to retry the entire chain. There is no way to isolate whether the failure was a safety issue, a planning mistake, a malformed output, or a bad judgment call. Single-pass also makes it difficult to apply different models or temperature settings to different concerns.

2. **Stage-gated pipeline.** Decompose the tool-calling workflow into discrete stages, each with a single responsibility, explicit pass/fail criteria, and structured telemetry. A case flows through the pipeline only if each gate passes; failures are caught early and attributed to a specific stage.

The benchmark data reinforced the decision. Baseline single-pass success on our 40-case suite is 25%. The middleware parser layer (format normalization and schema coercion) alone brings this to 65%. Adding the repair-and-replay loop reaches 90%. The remaining failures require multi-agent reasoning — a Judge stage that evaluates output quality and a Safety stage that catches harmful or off-policy requests before they reach execution.

## Decision

We adopt a five-stage pipeline orchestrated by `StagePilotEngine`:

1. **EligibilityAgent** — Determines whether the incoming request is within scope and can be serviced by the available tool set. Rejects out-of-scope requests early, before any expensive inference.

2. **SafetyAgent** — Evaluates the request against safety policies. Blocks harmful, abusive, or off-policy requests before planning begins.

3. **PlannerAgent** — Generates a structured tool-call plan: which tool to invoke, with what arguments, and in what order for multi-step tasks. The parser middleware normalizes the model's raw output into a validated schema.

4. **OutreachAgent** — Executes the planned tool call(s) and collects results. Handles retries and partial-failure recovery at the execution layer.

5. **JudgeAgent** — Reviews the completed execution against the original request. Evaluates whether the result is correct, complete, and well-formed. Can trigger a replay through earlier stages if quality criteria are not met.

Each stage produces structured telemetry via OpenTelemetry spans, enabling operators to trace exactly where a case succeeded or failed.

## Consequences

**Benefits:**

- **Failure isolation.** When a case fails, telemetry identifies the exact stage. Operators do not need to guess whether the problem was safety, planning, parsing, or execution.
- **Independent optimization.** Each stage can use a different model, prompt strategy, or temperature setting. The Safety stage can use a conservative model; the Planner can use a capable but less constrained one.
- **Incremental reliability.** The parser middleware alone provides significant improvement (25% to 65%). Teams can adopt the middleware without the full pipeline and still benefit.
- **Auditability.** Every stage decision is logged with structured data, supporting compliance and debugging requirements in production environments.

**Trade-offs:**

- **Increased latency.** Multiple sequential inference calls add latency compared to single-pass. This is mitigated by early rejection at the Eligibility and Safety stages, which prevent unnecessary downstream computation.
- **Operational complexity.** Five agents require more configuration and monitoring than a single model call. The OpenTelemetry integration and Prometheus metrics endpoint are designed to manage this complexity.
- **Cost.** More inference calls mean higher API costs per request. In practice, the reduction in failed-and-retried requests offsets much of this cost for production workloads.
