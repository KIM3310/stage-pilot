# OpenAI-Compatible Prompt-Mode BFCL Benchmark Report

- Generated (UTC): 2026-03-10T15:12:47.682750+00:00
- Provider: `Ollama`
- Model: `gemma3:4b`
- Runtime Root: `/Users/kim/.debug-all-repos-20260310-remote/stage-pilot/experiments/prompt-bfcl-ralph-matrix/runtime-local-hunt-20260311/phase1-search/runs/openai-compatible-gemma3-4b-minimal`
- Categories: `multiple, parallel, parallel_multiple, simple_python`
- Cases per category: `3`
- Run-id mode: `enabled`

## Scoreboard

- Baseline: `gemma3:4b (Prompt Baseline)`
- RALPH: `gemma3:4b (Prompt + RALPH Loop Minimal)`

| Metric | Baseline | RALPH | Delta (pp) |
|---|---:|---:|---:|
| Overall Acc | 5.00 | 3.33 | -1.67 |
| Non-Live AST Acc | N/A | N/A | N/A |
| Live Acc | 0.00 | 0.00 | +0.00 |
| Multi Turn Acc | 0.00 | 0.00 | +0.00 |
| Relevance Detection | N/A | N/A | N/A |
| Irrelevance Detection | N/A | N/A | N/A |

## Headline

- Verdict: `regressed`
- Wins: `0` | Losses: `1` | Ties: `2` | Unknown: `3`
- Biggest drop: `Overall Acc` (-1.67 pp)
- Missing metrics: `Non-Live AST Acc, Relevance Detection, Irrelevance Detection`
