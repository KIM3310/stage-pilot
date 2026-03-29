# StagePilot Datadog Proof Pack

This pack is intentionally `spec-first`.

The goal is to show how StagePilot would land in Datadog as a production-style runtime reliability surface without making a live Datadog tenant mandatory for review.

## Why this repo is the strongest Datadog fit

StagePilot already exposes OpenTelemetry-facing runtime metrics and a clear API boundary.

- `tool_calls_total`
- `tool_call_retries_total`
- `tool_call_parse_duration_ms`
- `benchmark_success_rate`

That makes Datadog a natural extension of the runtime story rather than a cosmetic add-on.

## Service map

- `stagepilot-api`
  - owns `/v1/plan`, `/v1/benchmark`, `/v1/insights`, `/v1/whatif`, `/v1/metrics`
- `stagepilot-parser`
  - owns parse and schema-coercion behavior across protocol families
- `stagepilot-benchmark`
  - owns benchmark execution, summary generation, and release-readiness reporting

## Dashboard pack

### 1. Runtime Reliability Overview

- request volume by endpoint
- success and error rate by protocol
- retry pressure over time
- parse latency p50 / p95
- benchmark success rate against release threshold

### 2. Provider + Protocol Breakdown

- tool-call volume by provider family
- retry rate by protocol adapter
- malformed output pressure by adapter
- judge-stage failure share by scenario family

### 3. Release Readiness Board

- latest benchmark success rate
- number of failing benchmark buckets
- time since last benchmark run
- current release candidate state

## Monitor pack

- alert when `benchmark_success_rate < 0.90` for 10 minutes
- alert when `tool_call_parse_duration_ms` p95 exceeds `150 ms`
- alert when `tool_call_retries_total` doubles against a 1-hour baseline
- alert when `/v1/plan` or `/v1/benchmark` error rate exceeds `2%`
- synthetic check for `/v1/metrics`
- synthetic check for `/v1/plan` with a deterministic smoke payload

## SLO pack

- `99.0%` availability for `/v1/plan`
- `95%` of parse operations under `150 ms`
- release candidate benchmark success at or above `90%`

## Portfolio evidence to capture

- one Datadog dashboard screenshot with runtime, retry, and benchmark widgets
- one monitor definition screenshot showing the release-readiness threshold
- one synthetic-test screenshot for `/v1/metrics` or `/v1/plan`
- one short notebook or incident-style write-up explaining how retry spikes map to tool-call instability

## Minimal implementation path

1. Export StagePilot metrics through OTLP.
2. Route OTLP to Datadog.
3. Build the three dashboards above.
4. Check in screenshots and monitor descriptions under `docs/datadog/`.

If time is limited, do `Runtime Reliability Overview` first. That single board is enough to make the Datadog story credible in interviews.
