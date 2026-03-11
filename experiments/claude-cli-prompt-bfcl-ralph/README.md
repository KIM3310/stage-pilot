# Claude CLI Prompt-Mode BFCL RALPH

이 실험은 `claude` CLI를 통해 `BFCL v4 prompt-mode function calling`에서:

- baseline prompt
- RALPH loop prompt

를 비교합니다.

핵심은 `Claude Code`의 built-in tools를 끄고, BFCL 함수 스키마만 callable tool universe처럼 다루는 것입니다.

## Runner

- [run_claude_cli_prompt_bfcl_ralph.py](./run_claude_cli_prompt_bfcl_ralph.py)
- [test_run_claude_cli_prompt_bfcl_ralph.py](./test_run_claude_cli_prompt_bfcl_ralph.py)

## Preflight

```bash
/Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard/.venv311/bin/python \
  experiments/claude-cli-prompt-bfcl-ralph/run_claude_cli_prompt_bfcl_ralph.py \
  --bfcl-root /Users/kim/Downloads/gorilla/berkeley-function-call-leaderboard \
  --runtime-root experiments/claude-cli-prompt-bfcl-ralph/runtime-preflight \
  --model-name claude-cli-sonnet \
  --claude-model sonnet \
  --preflight-only
```

## Notes

- 현재 이 환경에서는 `claude` CLI가 설치돼 있어도 조직 권한이 없으면 preflight에서 바로 막힙니다.
- runner와 matrix integration은 이미 들어 있으므로, 권한만 정상화되면 바로 benchmark를 다시 시작할 수 있습니다.
- 대량 변형 탐색은 [prompt-bfcl-ralph-matrix README](../prompt-bfcl-ralph-matrix/README.md)에서 `claude-cli` kind로 실행합니다.
