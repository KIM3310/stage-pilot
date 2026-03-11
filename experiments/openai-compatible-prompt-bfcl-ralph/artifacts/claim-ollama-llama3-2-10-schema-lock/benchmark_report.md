# OpenAI-Compatible Prompt-Mode BFCL Benchmark Report

- Generated (UTC): 2026-03-11T00:13:50.748437+00:00
- Provider: `Ollama`
- Model: `llama3.2:latest`
- Runtime Root: `/Users/kim/.debug-all-repos-20260310-remote/stage-pilot/experiments/openai-compatible-prompt-bfcl-ralph/runtime-llama32-10-schema-lock`
- Categories: `multiple, parallel, parallel_multiple, simple_python`
- Cases per category: `10`
- Run-id mode: `enabled`

## Scoreboard

- Baseline: `llama3.2:latest (Prompt Baseline)`
- RALPH: `llama3.2:latest (Prompt + RALPH Loop Schema Lock)`

| Metric | Baseline | RALPH | Delta (pp) |
|---|---:|---:|---:|
| Overall Acc | 7.50 | 7.75 | +0.25 |
| Non-Live AST Acc | N/A | N/A | N/A |
| Live Acc | 0.00 | 0.00 | +0.00 |
| Multi Turn Acc | 0.00 | 0.00 | +0.00 |
| Relevance Detection | N/A | N/A | N/A |
| Irrelevance Detection | N/A | N/A | N/A |

## Headline

- Verdict: `improved`
- Wins: `1` | Losses: `0` | Ties: `2` | Unknown: `3`
- Best gain: `Overall Acc` (+0.25 pp)
- Missing metrics: `Non-Live AST Acc, Relevance Detection, Irrelevance Detection`
