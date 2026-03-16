# StagePilot Benchmark Results

> Generated: 2026-03-19 | Runner: vitest v4.0.18 | Platform: macOS (darwin)

## Test Suite Summary

| Metric | Value |
|--------|-------|
| Total test files | 184 |
| Total tests | 1,713 |
| Passed | 1,713 |
| Failed | 0 |
| Type errors | 0 |
| Total duration | 4.51s |
| Test execution time | 9.75s (parallel) |

## Parse Success Rates by Protocol

Source: `docs/benchmarks/stagepilot-latest.json` (24 benchmark cases, seed 20260228)

| Strategy | Success Rate | Parse Success | Avg Latency | p95 Latency | Avg Attempts |
|----------|-------------|---------------|-------------|-------------|--------------|
| baseline | 29.17% | 7/24 | 0.02ms | 0.05ms | 1.00 |
| middleware | 87.50% | 21/24 | 0.16ms | 0.44ms | 1.00 |
| middleware+ralph-loop | **100.00%** | 24/24 | 0.05ms | 0.10ms | 1.13 |

### Improvement Margins

- Loop vs Baseline: **+70.83%**
- Loop vs Middleware: **+12.50%**
- Middleware vs Baseline: **+58.33%**

## Latency Percentiles (Load Test)

Source: `docs/benchmarks/stagepilot-runtime-load-latest.json` (k6 load harness)

| Metric | Value |
|--------|-------|
| Tool | k6 |
| Virtual users | 6 |
| Total iterations | 36 |
| Total requests | 108 |
| Checks pass rate | 100% |
| HTTP failure rate | 0% |
| Avg duration | 812ms |
| **p95 duration** | **1,668ms** |
| Max duration | 2,241ms |

### Route Mix

| Route | Share |
|-------|-------|
| `/v1/plan` | 33% |
| `/v1/benchmark` | 33% |
| `/v1/runtime-scorecard` | 34% |

## Regression Gate Status

Source: `docs/benchmarks/stagepilot-regression-gate-latest.json`

| Gate | Decision | Focus |
|------|----------|-------|
| provider-contract-coverage | **pass** | frontier credibility |
| trace-replay-discipline | **pass** | debuggability |
| mixed-format-regression-watch | watch | contract drift |
| xml-boundary-repair-watch | watch | stream repair |
| bounded-load-posture | **pass** | runtime pressure |

**Release posture:** review-ready-with-watch-items (3 pass, 2 watch, 0 fail)

## Memory Usage (Stream Processing)

From `rxml/core/stream-chunked.memory.unit.test.ts`: 1 test passed in 287ms, validating memory-bounded stream chunking under load.

From `rxml/core/stream-chunked.performance.unit.test.ts`: 2 tests passed in 8ms, confirming streaming performance targets.

## Existing Benchmark Artifacts

- `docs/benchmarks/stagepilot-latest.json` — 24-case protocol benchmark
- `docs/benchmarks/stagepilot-regression-gate-latest.json` — 5-gate regression board
- `docs/benchmarks/stagepilot-runtime-load-latest.json` — k6 load test results
- `docs/benchmarks/stagepilot-trace-observability-latest.json` — trace replay evidence
- `docs/benchlab/TOOL_CALLING_GAINS.md` — tool-calling improvement analysis
- `docs/benchlab/FAILURE_TAXONOMY.md` — failure classification
- `docs/benchlab/LOCAL_OLLAMA_SWEEP_20260311.md` — local model sweep results
