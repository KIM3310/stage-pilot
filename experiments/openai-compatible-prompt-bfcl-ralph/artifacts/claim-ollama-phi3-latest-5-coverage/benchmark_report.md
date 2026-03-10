# OpenAI-Compatible Prompt-Mode BFCL Benchmark Report

- Generated (UTC): 2026-03-10T16:04:18.640020+00:00
- Provider: `Ollama`
- Model: `phi3:latest`
- Runtime Root: `/Users/kim/.debug-all-repos-20260310-remote/stage-pilot/experiments/prompt-bfcl-ralph-matrix/runtime-local-validation5/runs/ollama-phi3-latest-coverage-v5`
- Categories: `multiple, parallel, parallel_multiple, simple_python`
- Cases per category: `5`
- Run-id mode: `enabled`

## Scoreboard

- Baseline: `phi3:latest (Prompt Baseline)`
- RALPH: `phi3:latest (Prompt + RALPH Loop Coverage)`

| Metric | Baseline | RALPH | Delta (pp) |
|---|---:|---:|---:|
| Overall Acc | 6.33 | 6.33 | +0.00 |
| Non-Live AST Acc | N/A | N/A | N/A |
| Live Acc | 0.00 | 0.00 | +0.00 |
| Multi Turn Acc | 0.00 | 0.00 | +0.00 |
| Relevance Detection | N/A | N/A | N/A |
| Irrelevance Detection | N/A | N/A | N/A |

## Headline

- Verdict: `mixed`
- Wins: `0` | Losses: `0` | Ties: `3` | Unknown: `3`
- Missing metrics: `Non-Live AST Acc, Relevance Detection, Irrelevance Detection`
