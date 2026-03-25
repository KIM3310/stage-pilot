# StagePilot case study — one parser failure, one review path

## Failure shape

A non-native model emits something that almost looks like a tool call, but the
payload arrives in an unstable shape:

- fields are split across chunks
- one key is wrapped in explanatory text
- the run looks fine until the downstream tool boundary breaks

Without a bounded parser and repair path, this usually gets mislabeled as
“the model is flaky” instead of a reliability problem at the runtime boundary.

## What StagePilot changes

StagePilot treats this as a **tool-calling reliability** problem.

Use this review order:

1. open `docs/benchmarks/stagepilot-latest.json`
2. inspect `GET /v1/runtime-brief`
3. inspect `GET /v1/summary-pack`
4. inspect BenchLab or replay surfaces only if more detail is needed

## Why the benchmark matters

The important claim is not just “higher score”.

The more defensible claim is:

- parser middleware removes a large class of silent tool-call failures
- bounded retry keeps repair behavior explicit
- checked-in artifacts make the claim reviewable after the run is over

## Reviewer takeaway

> StagePilot turns ambiguous tool-call breakage into a bounded, replayable,
> benchmarked runtime surface.

That is the strongest and cleanest framing for this repo.
