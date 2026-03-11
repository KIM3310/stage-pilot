# OpenAI-Compatible BFCL Prompt-Mode RALPH Benchmark

BFCL v4에서 **OpenAI-compatible prompt mode** 기준으로 baseline prompt와 `RALPH loop` 2-pass prompt를 비교하는 실험입니다.

- 대상: native tool calling이 없거나, 있어도 prompt mode로 비교하고 싶은 모델
- 실행 스크립트: `run_openai_compatible_prompt_bfcl_ralph.py`
- 방식: BFCL `is_fc_model=False` 경로로 baseline vs RALPH 비교

여러 모델을 한 번에 돌리고 분류하려면 `../prompt-bfcl-ralph-matrix`를 사용합니다.

## Checked-In No-Key Local Validation (2026-03-11)

이 섹션은 **API key 없이 Ollama 로컬 모델로 다시 돌린 validation 결과**만 정리합니다.

- `llama3.1:8b` on Ollama with `schema-lock` RALPH (`5` cases/category): `7.83 -> 8.33`, `+0.50pp`, `+6.39%` relative
  - `artifacts/claim-ollama-llama3-1-8b-5-schema-lock/summary.json`
  - `artifacts/claim-ollama-llama3-1-8b-5-schema-lock/benchmark_report.md`
  - `artifacts/claim-ollama-llama3-1-8b-5-schema-lock/data_overall.csv`
  - `artifacts/claim-ollama-llama3-1-8b-5-schema-lock/benchmark-ollama-llama3-1-8b-5-schema-lock.svg`

![Meta Llama 3.1 8B Prompt-Mode BFCL Gain](artifacts/claim-ollama-llama3-1-8b-5-schema-lock/benchmark-ollama-llama3-1-8b-5-schema-lock.svg)

- `llama3.2:latest` on Ollama with `schema-lock` RALPH (`5` cases/category): `7.83 -> 8.33`, `+0.50pp`, `+6.39%` relative
  - `artifacts/claim-ollama-llama3-2-5-schema-lock/summary.json`
  - `artifacts/claim-ollama-llama3-2-5-schema-lock/benchmark_report.md`
  - `artifacts/claim-ollama-llama3-2-5-schema-lock/data_overall.csv`
  - `artifacts/claim-ollama-llama3-2-5-schema-lock/benchmark-ollama-llama3-2-5-schema-lock.svg`

![Meta Llama 3.2 Prompt-Mode BFCL Gain](artifacts/claim-ollama-llama3-2-5-schema-lock/benchmark-ollama-llama3-2-5-schema-lock.svg)

- `qwen3.5:4b` on Ollama with `minimal` RALPH (`5` cases/category): `7.83 -> 8.33`, `+0.50pp`, `+6.39%` relative
- `llama3.2:latest` on Ollama with `schema-lock` RALPH (`10` cases/category): `7.50 -> 7.75`, `+0.25pp`, `+3.33%` relative
  - `artifacts/claim-ollama-llama3-2-10-schema-lock/summary.json`
  - `artifacts/claim-ollama-llama3-2-10-schema-lock/benchmark_report.md`
  - `artifacts/claim-ollama-llama3-2-10-schema-lock/data_overall.csv`
  - `artifacts/claim-ollama-llama3-2-10-schema-lock/benchmark-ollama-llama3-2-10-schema-lock.svg`

![Meta Llama 3.2 Prompt-Mode BFCL Follow-up](artifacts/claim-ollama-llama3-2-10-schema-lock/benchmark-ollama-llama3-2-10-schema-lock.svg)

  - `artifacts/claim-ollama-qwen3-5-4b-5-minimal/summary.json`
  - `artifacts/claim-ollama-qwen3-5-4b-5-minimal/benchmark_report.md`
  - `artifacts/claim-ollama-qwen3-5-4b-5-minimal/data_overall.csv`
  - `artifacts/claim-ollama-qwen3-5-4b-5-minimal/benchmark-ollama-qwen3-5-4b-5-minimal.svg`

![Qwen 3.5 4B Prompt-Mode BFCL Gain](artifacts/claim-ollama-qwen3-5-4b-5-minimal/benchmark-ollama-qwen3-5-4b-5-minimal.svg)

Flat / regression controls kept on purpose:

- `phi3:latest` + `coverage` (`5` cases/category): `6.33 -> 6.33`, flat
- `gemma3:4b` + `minimal` (`3` cases/category): `5.00 -> 3.33`, regressed
- `qwen2.5:1.5b` + `minimal` (`3` cases/category): `7.50 -> 6.67`, regressed

## Required Environment

Hosted OpenAI-compatible providers need the variables below.
For local Ollama runs, use `api_key=dummy`, `--base-url http://127.0.0.1:11434/v1`, and `--skip-model-check` instead.

```bash
export REPO_ROOT="$(git rev-parse --show-toplevel)"
export OPENAI_COMPATIBLE_API_KEY="sk-..."
export OPENAI_COMPATIBLE_BASE_URL="https://your-provider.example/v1"
export OPENAI_COMPATIBLE_MODEL="your-model-id"
```

Optional metadata:

```bash
export OPENAI_COMPATIBLE_PROVIDER="OpenRouter"
export OPENAI_COMPATIBLE_DOCS_URL="https://openrouter.ai/models"
export OPENAI_COMPATIBLE_PROVIDER_LICENSE="Proprietary"
export OPENAI_COMPATIBLE_DEFAULT_HEADERS='{"HTTP-Referer":"https://example.com","X-Title":"bfcl-ralph"}'
```

## BFCL Setup

```bash
git clone https://github.com/ShishirPatil/gorilla.git /Users/kim/Downloads/gorilla
cd /Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard
/opt/homebrew/bin/python3.11 -m venv .venv311
.venv311/bin/pip install -e .
.venv311/bin/pip install soundfile
```

## Run Benchmark

```bash
/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard/.venv311/bin/python \
  "$REPO_ROOT/experiments/openai-compatible-prompt-bfcl-ralph/run_openai_compatible_prompt_bfcl_ralph.py" \
  --bfcl-root /Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard \
  --runtime-root "$REPO_ROOT/experiments/openai-compatible-prompt-bfcl-ralph/runtime" \
  --provider-name "${OPENAI_COMPATIBLE_PROVIDER:-OpenAI-Compatible}" \
  --model-name "$OPENAI_COMPATIBLE_MODEL" \
  --base-url "$OPENAI_COMPATIBLE_BASE_URL" \
  --categories simple_python,multiple,parallel,parallel_multiple \
  --cases-per-category 3 \
  --num-threads 1 \
  --report-markdown benchmark_report.md \
  --error-report-json error_forensics.json
```

If your provider does not expose a standard `GET /models` endpoint, add `--skip-model-check`.

## Preflight Only

```bash
/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard/.venv311/bin/python \
  "$REPO_ROOT/experiments/openai-compatible-prompt-bfcl-ralph/run_openai_compatible_prompt_bfcl_ralph.py" \
  --preflight-only \
  --bfcl-root /Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard \
  --runtime-root "$REPO_ROOT/experiments/openai-compatible-prompt-bfcl-ralph/runtime" \
  --provider-name "${OPENAI_COMPATIBLE_PROVIDER:-OpenAI-Compatible}" \
  --model-name "$OPENAI_COMPATIBLE_MODEL" \
  --base-url "$OPENAI_COMPATIBLE_BASE_URL" \
  --cases-per-category 3
```

## Debug & Test

```bash
cd "$REPO_ROOT/experiments/openai-compatible-prompt-bfcl-ralph"
/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard/.venv311/bin/python -m py_compile run_openai_compatible_prompt_bfcl_ralph.py
/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard/.venv311/bin/python -m unittest -q test_run_openai_compatible_prompt_bfcl_ralph.py
```

## Notes

- 이 실험은 native tools API가 아니라 BFCL prompt mode를 비교합니다.
- `RALPH loop`는 internal checklist 생성 후 final function-call 출력만 남기는 2-pass prompting 전략입니다.
- 상대 향상폭은 모델, provider, category 구성에 따라 달라지므로 Grok의 `+11.1%`를 그대로 기대하면 안 됩니다.
