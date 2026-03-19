# StagePilot Performance Baseline

> Generated: 2026-03-20 | Source: k6 load test + vitest benchmark harness

## Test Environment

| Property | Value |
|----------|-------|
| Platform | macOS (darwin) / Node 20 |
| Test runner | vitest v4.0.18 |
| Load tool | k6 v0.52+ |
| Benchmark seed | 20260228 |
| Total test files | 184 |
| Total tests | 1,713 |

## Unit / Integration Test Performance

| Metric | Value |
|--------|-------|
| Total duration | 4.51s |
| Parallel execution time | 9.75s |
| Pass rate | 100% (1,713/1,713) |
| Type errors | 0 |

## Benchmark Parse Performance (40-case expanded suite)

Source: `docs/benchmarks/stagepilot-latest.json`

| Strategy | Success Rate | Avg Latency | p95 Latency | Avg Attempts |
|----------|-------------|-------------|-------------|--------------|
| baseline | 25.00% | 0.02ms | 0.03ms | 1.00 |
| middleware | 65.00% | 0.12ms | 0.31ms | 1.00 |
| middleware+ralph-loop | **90.00%** | 0.05ms | 0.09ms | 1.35 |

### Key observations

- Middleware alone yields +40pp improvement over baseline.
- Ralph-loop retry adds another +25pp, reaching 90% on adversarial edge cases.
- Remaining 4 failures are structural (wrong tool name hallucination, empty arguments) — not parser bugs.
- Parse latency is sub-millisecond across all strategies.

## k6 Load Test Results

Source: `docs/benchmarks/stagepilot-runtime-load-latest.json`

| Metric | Value |
|--------|-------|
| Tool | k6 |
| VUs | 6 |
| Iterations | 36 |
| Total requests | 108 |
| HTTP failure rate | 0% |
| Checks pass rate | 100% |
| Avg response time | 812ms |
| p95 response time | **1,668ms** |
| Max response time | 2,241ms |

### Route distribution

| Route | Share |
|-------|-------|
| `POST /v1/plan` | 33% |
| `POST /v1/benchmark` | 33% |
| `GET /v1/runtime-scorecard` | 34% |

### Threshold compliance

| Threshold | Target | Actual | Status |
|-----------|--------|--------|--------|
| `http_req_failed` | < 5% | 0% | PASS |
| `http_req_duration p(95)` | < 3,000ms | 1,668ms | PASS |

## Memory Profile (Stream Processing)

From `rxml/core/stream-chunked.memory.unit.test.ts`:

- Memory-bounded stream chunking under load: **pass** (287ms)
- Streaming performance targets: **pass** (8ms, 2 assertions)

## Regression Gate Status

Source: `docs/benchmarks/stagepilot-regression-gate-latest.json`

| Gate | Decision |
|------|----------|
| provider-contract-coverage | **pass** |
| trace-replay-discipline | **pass** |
| mixed-format-regression-watch | watch |
| xml-boundary-repair-watch | watch |
| bounded-load-posture | **pass** |

**Release posture:** review-ready-with-watch-items (3 pass, 2 watch, 0 fail)

## Reproducing These Results

```bash
# Full test suite
pnpm test

# Benchmark (40-case expanded)
BENCHMARK_CASES=40 BENCHMARK_SEED=20260228 BENCHMARK_LOOP_ATTEMPTS=2 pnpm bench:stagepilot

# k6 load test (requires running API)
pnpm api:stagepilot &
pnpm load:k6

# Validation summary
pnpm review:proof
```

## Trend Notes

- The original 24-case suite showed 100% with ralph-loop. The expanded 40-case suite with adversarial mutations brought this to a more honest 90%.
- Load test p95 is well within the 3s threshold at 1,668ms under 6 concurrent VUs.
- All regression gates pass or are in watch status; none are failing.
