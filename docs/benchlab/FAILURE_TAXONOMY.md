# Failure Taxonomy Snapshot

이 문서는 **현재 이 브랜치에 체크인된 local/no-key BFCL artifact** 기준으로
실패/flat/regression 신호를 요약합니다.

## Snapshot

Current checked-in snapshot as of 2026-03-11:

- `6` claim artifacts include `error_forensics.json`.
- `3` improved claims, `1` flat control, `2` regressed pilots are checked in.
- 현재 체크인된 artifact들은 모두 `error_items = 0` 이라서, **score delta 비교용**으로는 좋지만
  bucket-level failure analysis용으로는 아직 backfill이 필요합니다.

Why this matters:

- score delta와 failure bucket은 다른 신호다.
- improvement claim만 남기면 과장처럼 보일 수 있다.
- flat/regressed control을 같이 남겨야 어떤 variant가 어디서 안 먹히는지 설명하기 쉽다.

## Current Checked-In Claims

| Claim | Model | Outcome | Delta (pp) | Error signal |
|---|---|---|---:|---|
| `claim-ollama-llama3-1-8b-5-schema-lock` | `llama3.1:8b` | improved | +0.50 | zero recorded error buckets |
| `claim-ollama-llama3-2-5-schema-lock` | `llama3.2:latest` | improved | +0.50 | zero recorded error buckets |
| `claim-ollama-qwen3-5-4b-5-minimal` | `qwen3.5:4b` | improved | +0.50 | zero recorded error buckets |
| `claim-ollama-phi3-latest-5-coverage` | `phi3:latest` | flat | +0.00 | zero recorded error buckets |
| `claim-ollama-gemma3-4b-3-minimal` | `gemma3:4b` | regressed | -1.67 | zero recorded error buckets |
| `claim-ollama-qwen2-5-1-5b-3-minimal` | `qwen2.5:1.5b` | regressed | -0.83 | zero recorded error buckets |

## Interpretation

- `schema-lock`는 `llama3.1:8b`, `llama3.2:latest`에서 현재 가장 안정적인 no-key variant로 보인다.
- `minimal`은 `qwen3.5:4b`에서는 이득이 있었지만, `gemma3:4b`와 `qwen2.5:1.5b`에서는 오히려 손해였다.
- `coverage`는 `phi3:latest`에서 최소한 성능을 해치지 않는 flat control로 남았다.
- 즉, RALPH는 모델마다 다르게 먹히고, 작은 로컬 모델일수록 variant 선택이 더 중요하다.

## Local Inspection

BenchLab exposes the same aggregate view at:

- `GET /v1/benchlab/artifacts/forensics`
- `GET /v1/benchlab/artifacts/best`
- `GET /v1/benchlab/artifacts/:id`

Run locally:

```bash
npm run api:benchlab
```

Then open `http://127.0.0.1:8090/benchlab` or query the endpoints directly.
