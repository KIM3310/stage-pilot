# OpenAI-Compatible Prompt-Mode BFCL Benchmark Report

- Generated (UTC): 2026-03-10T16:16:00.739999+00:00
- Provider: `Ollama`
- Model: `qwen3.5:4b`
- Runtime Root: `/Users/kim/.debug-all-repos-20260310-remote/stage-pilot/experiments/prompt-bfcl-ralph-matrix/runtime-local-validation5/runs/ollama-qwen3-5-4b-minimal-v5`
- Categories: `multiple, parallel, parallel_multiple, simple_python`
- Cases per category: `5`
- Run-id mode: `enabled`

## Scoreboard

- Baseline: `qwen3.5:4b (Prompt Baseline)`
- RALPH: `qwen3.5:4b (Prompt + RALPH Loop Minimal)`

| Metric | Baseline | RALPH | Delta (pp) |
|---|---:|---:|---:|
| Overall Acc | 7.83 | 8.33 | +0.50 |
| Non-Live AST Acc | N/A | N/A | N/A |
| Live Acc | 0.00 | 0.00 | +0.00 |
| Multi Turn Acc | 0.00 | 0.00 | +0.00 |
| Relevance Detection | N/A | N/A | N/A |
| Irrelevance Detection | N/A | N/A | N/A |

## Headline

- Verdict: `improved`
- Wins: `1` | Losses: `0` | Ties: `2` | Unknown: `3`
- Best gain: `Overall Acc` (+0.50 pp)
- Missing metrics: `Non-Live AST Acc, Relevance Detection, Irrelevance Detection`
