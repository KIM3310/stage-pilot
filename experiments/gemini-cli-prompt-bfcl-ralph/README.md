# Gemini CLI Prompt-Mode BFCL RALPH

이 실험은 `gemini` CLI를 통해 `BFCL v4 prompt-mode function calling`에서:

- baseline prompt
- RALPH loop prompt

를 비교합니다.

핵심은 `Gemini CLI built-in tools`를 쓰는 게 아니라, BFCL에 들어 있는 함수 스키마만 유일한 tool universe처럼 취급하게 만드는 것입니다.

## Runner

- [run_gemini_cli_prompt_bfcl_ralph.py](/Users/kim/github_repos/ai-sdk-tool-calling-lab/experiments/gemini-cli-prompt-bfcl-ralph/run_gemini_cli_prompt_bfcl_ralph.py)
- [test_run_gemini_cli_prompt_bfcl_ralph.py](/Users/kim/github_repos/ai-sdk-tool-calling-lab/experiments/gemini-cli-prompt-bfcl-ralph/test_run_gemini_cli_prompt_bfcl_ralph.py)

## Checked-In Benchmark Snapshot

- `gemini-cli-2-5-flash-lite` with `minimal` RALPH (`3` cases/category): `8.33 -> 8.33`, `flat`
- Evidence:
  - `artifacts/claim-gemini-cli-2-5-flash-lite-3-minimal/summary.json`
  - `artifacts/claim-gemini-cli-2-5-flash-lite-3-minimal/benchmark_report.md`
  - `artifacts/claim-gemini-cli-2-5-flash-lite-3-minimal/data_overall.csv`
  - `artifacts/claim-gemini-cli-2-5-flash-lite-3-minimal/error_forensics.json`

![Gemini CLI 2.5 Flash Lite Prompt-Mode BFCL Snapshot](https://raw.githubusercontent.com/KIM3310/ai-sdk-tool-calling-lab/main/experiments/gemini-cli-prompt-bfcl-ralph/artifacts/claim-gemini-cli-2-5-flash-lite-3-minimal/benchmark-gemini-cli-2-5-flash-lite-3-minimal.svg)

## Preflight

```bash
/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard/.venv311/bin/python \
  experiments/gemini-cli-prompt-bfcl-ralph/run_gemini_cli_prompt_bfcl_ralph.py \
  --bfcl-root /Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard \
  --runtime-root experiments/gemini-cli-prompt-bfcl-ralph/runtime-preflight \
  --model-name gemini-cli-2-5-flash-lite \
  --gemini-model gemini-2.5-flash-lite \
  --preflight-only
```

## Notes

- 이 러너는 `GEMINI_API_KEY` 없이도 `gemini` CLI 로그인 세션이 살아 있으면 돌릴 수 있습니다.
- 결과 문자열은 BFCL AST 디코더가 읽을 수 있도록 함수 호출만 추출/정규화합니다.
- 대량 변형 탐색은 [../prompt-bfcl-ralph-matrix/README.md](/Users/kim/github_repos/ai-sdk-tool-calling-lab/experiments/prompt-bfcl-ralph-matrix/README.md)에서 `gemini-cli` kind로 실행합니다.
