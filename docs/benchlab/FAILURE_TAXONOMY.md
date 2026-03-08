# Failure Taxonomy Snapshot

This document summarizes checked-in `error_forensics.json` artifacts in this repository.
It is intentionally limited to versioned benchmark claims, not untracked runtime folders.

## Snapshot

Current checked-in snapshot as of 2026-03-07:

- `6` claim artifacts include `error_forensics.json`.
- `1` claim currently has populated error buckets.
- The dominant tracked bucket is `timeout`.
- Strongest tracked reduction: `qwen3.5:4b` minimal reduced recorded timeout errors from `6 -> 0` in the checked-in snapshot (baseline coverage: `40` eval items).

Why this matters:

- Score deltas and failure deltas are separate signals.
- A gain is more credible when the repo also shows which failure mode moved.
- Coverage gaps are explicit when a claim has score evidence but no populated error buckets.

## Current Checked-In Claims

| Claim | Model | Outcome | Delta (pp) | Error signal |
|---|---|---|---:|---|
| `claim-11.1` | `grok-4-latest` | improved | +0.83 | zero recorded error buckets |
| `claim-gemini-cli-2-5-flash-lite-3-minimal` | `gemini-cli-2-5-flash-lite` | flat | +0.00 | zero recorded error buckets |
| `claim-ollama-llama3-1-8b-20-schema-lock` | `llama3.1:8b` | improved | +0.08 | zero recorded error buckets |
| `claim-ollama-llama3-2-20` | `llama3.2:latest` | improved | +0.12 | zero recorded error buckets |
| `claim-ollama-llama3-2-20-schema-lock` | `llama3.2:latest` | improved | +0.12 | zero recorded error buckets |
| `claim-ollama-qwen3-5-4b-10-minimal` | `qwen3.5:4b` | improved | +1.25 | `timeout` bucket, baseline `6/40`, no RALPH-side error bucket recorded |

## Interpretation

- The checked-in artifact set currently proves that this repo tracks failure shape, not just accuracy deltas.
- The evidence is intentionally sparse rather than inflated: only one checked-in claim currently has non-zero error buckets.
- This is still useful because it shows the repository can separate `score gain` from `failure-mode gain` and can surface where coverage needs backfill.

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
