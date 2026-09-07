# StagePilot: design and evidence

Updated 2026-09-07.

## Design decision

A bounded recovery loop makes tool-call failures observable. The benchmark reports individual cases and failed attempts, so a reader can distinguish a recovered payload from a successful first attempt.

## Inspect the code

- [src/stagepilot/benchmark.ts](../src/stagepilot/benchmark.ts): Case-level evaluation and retry accounting.
- [tests/stagepilot-benchmark.test.ts](../tests/stagepilot-benchmark.test.ts): Malformed tool-call and budget regressions.

## Scope of the evidence

This is an extension of upstream Apache-2.0 code. Original attribution remains in the repository. The benchmark uses synthetic inputs and prewritten retry responses, not independent model-quality measurements.

## Contribution and provenance

These notes describe what can be inspected in the repository. Commit history and pull-request diffs preserve the change trail; they do not independently establish manual versus AI-assisted authorship, team roles or contribution percentages. No such percentages are inferred here.

[Project overview](../README.md)
