# Local Ollama RALPH Sweep (2026-03-11)

이 문서는 **API key 없이** 로컬 Ollama 모델만으로 다시 돌린 BFCL prompt-mode RALPH 실험 메모입니다.

## Goal

- 무과금/로컬 범위에서 다양한 LLM의 tool-calling baseline을 다시 확인한다.
- 모델별로 어떤 RALPH variant가 실제로 도움이 되는지 찾는다.
- improvement 뿐 아니라 flat / regression도 같이 남긴다.

## Setup

- BFCL root: `/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard`
- Provider: `Ollama` (`http://127.0.0.1:11434/v1`)
- Models used in this sweep:
  - `llama3.1:8b`
  - `llama3.2:latest`
  - `qwen3.5:4b`
  - `qwen2.5:1.5b`
  - `phi3:latest`
  - `gemma3:4b`
  - `mistral:latest`

## Phase 1 search (3 cases / category)

Early signal from the search pass:

| Model | Variant | Baseline | RALPH | Delta (pp) | Outcome |
|---|---|---:|---:|---:|---|
| `llama3.1:8b` | `schema-lock` | 7.50 | 8.33 | +0.83 | improved |
| `llama3.2:latest` | `schema-lock` | 7.50 | 8.33 | +0.83 | improved |
| `phi3:latest` | `coverage` | 7.50 | 8.33 | +0.83 | improved |
| `qwen3.5:4b` | `minimal` | 7.50 | 8.33 | +0.83 | improved |
| `gemma3:4b` | `minimal` | 5.00 | 3.33 | -1.67 | regressed |
| `qwen2.5:1.5b` | `minimal` | 7.50 | 6.67 | -0.83 | regressed |

Why phase 1 matters:
- it is cheap enough to search multiple variants quickly;
- it is noisy, so winners should be re-checked before being treated as official claims.

## Validation 5 (5 cases / category)

Winner replay with a slightly wider sample:

| Model | Variant | Baseline | RALPH | Delta (pp) | Relative delta | Outcome |
|---|---|---:|---:|---:|---:|---|
| `llama3.1:8b` | `schema-lock` | 7.83 | 8.33 | +0.50 | +6.39% | improved |
| `llama3.2:latest` | `schema-lock` | 7.83 | 8.33 | +0.50 | +6.39% | improved |
| `qwen3.5:4b` | `minimal` | 7.83 | 8.33 | +0.50 | +6.39% | improved |
| `phi3:latest` | `coverage` | 6.33 | 6.33 | +0.00 | +0.00% | flat |

## Takeaways

- `schema-lock` is the cleanest no-key win right now for:
  - `llama3.1:8b`
  - `llama3.2:latest`
- `minimal` still works well for `qwen3.5:4b`, but not for every small model.
- `coverage` helped `phi3:latest` in the tiny pilot, but flattened out in validation.
- `gemma3:4b` and `qwen2.5:1.5b` are good reminders that RALPH is **variant-sensitive**, not magic.

## Checked-in proof assets

Improved / flat validation claims now live under:

- `experiments/openai-compatible-prompt-bfcl-ralph/artifacts/claim-ollama-llama3-1-8b-5-schema-lock/`
- `experiments/openai-compatible-prompt-bfcl-ralph/artifacts/claim-ollama-llama3-2-5-schema-lock/`
- `experiments/openai-compatible-prompt-bfcl-ralph/artifacts/claim-ollama-qwen3-5-4b-5-minimal/`
- `experiments/openai-compatible-prompt-bfcl-ralph/artifacts/claim-ollama-phi3-latest-5-coverage/`

Regression pilot controls live under:

- `experiments/openai-compatible-prompt-bfcl-ralph/artifacts/claim-ollama-gemma3-4b-3-minimal/`
- `experiments/openai-compatible-prompt-bfcl-ralph/artifacts/claim-ollama-qwen2-5-1-5b-3-minimal/`


## Llama 3.2 latest follow-up variant hunt

사용자 요청대로 **Llama 최신 로컬 라인(`llama3.2:latest`)** 에 대해 variant를 더 넓게 다시 돌렸습니다.

### Search sweep (3 cases / category)

| Variant | Baseline | RALPH | Delta (pp) | Outcome |
|---|---:|---:|---:|---|
| `schema-lock` | 7.50 | 8.33 | +0.83 | improved |
| `parallel-safe` | 7.50 | 7.50 | +0.00 | flat |
| `coverage` | 7.50 | 7.50 | +0.00 | flat |
| `strict` | 7.50 | 7.50 | +0.00 | flat |
| `call-count` | 7.50 | 7.50 | +0.00 | flat |
| `compact` | 7.50 | 7.50 | +0.00 | flat |

### Follow-up read

- 현재 로컬 최신 Llama 라인에서는 `schema-lock`만 유의미한 gain을 만들었습니다.
- `parallel-safe`, `coverage`, `strict`, `call-count`, `compact`는 이번 샘플에서는 모두 flat이었습니다.
- 즉, 적어도 지금의 BFCL prompt-mode 범위에서는 **Llama 계열은 broad prompt보다 schema locking이 더 직접적인 이득**을 주는 쪽으로 보입니다.


## Llama 3.2 stronger replay (10 cases / category)

`llama3.2:latest + schema-lock`를 더 넓은 샘플로 다시 돌렸습니다.

| Model | Variant | Baseline | RALPH | Delta (pp) | Relative delta | Outcome |
|---|---|---:|---:|---:|---:|---|
| `llama3.2:latest` | `schema-lock` | 7.50 | 7.75 | +0.25 | +3.33% | improved |

읽는 포인트:
- 3-case search에서 보인 `+0.83pp`보다 gain 폭은 줄었지만,
- 더 넓은 `10` cases/category에서도 **양수 delta를 유지**했다.
- 즉 `schema-lock`는 Llama 최신 로컬 라인에서 여전히 가장 믿을 만한 variant다.
