# StagePilot Datadog-Ready Pack

This pack now supports two lanes:

- `spec-first` review via the markdown overview below
- `asset-first` sync via `docs/datadog/assets/*.json` and `npm run datadog:plan`

The current repo posture is `Datadog-ready, currently disabled`.

The goal is still to keep local review lightweight, while making it possible to push a real dashboard and monitor pack into Datadog later if `DD_API_KEY`, `DD_APP_KEY`, and `DD_SITE` are available again.

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

## Asset files

- `docs/datadog/assets/dashboard.json`
- `docs/datadog/assets/monitors.json`
- `scripts/datadog-assets.mjs`

## Sync path

This path is optional and is intentionally not active in the default local setup.

1. Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a Datadog Agent or OTEL collector.
2. Run `npm run datadog:plan` to confirm titles, monitor names, and env config.
3. Run `node scripts/datadog-assets.mjs validate` once `DD_API_KEY` is present.
4. Run `npm run datadog:sync` once both `DD_API_KEY` and `DD_APP_KEY` are present.
5. Capture screenshots and any post-sync notes under `docs/datadog/`.

If time is limited, do `Runtime Reliability Overview` first. Even with live sync disabled, that single board is enough to make the Datadog story credible in interviews.
