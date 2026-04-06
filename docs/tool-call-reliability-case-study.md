# Case study -- parser failure, one fix path

## The failure

A non-native model outputs something that *almost* looks like a tool call, but it's broken:

- fields split across chunks
- one key wrapped in explanatory text
- looks fine until the downstream tool boundary blows up

Without a parser and repair path, this gets blamed on "the model being flaky" instead of a fixable runtime problem.

## What StagePilot does

Treats it as a tool-calling reliability problem.

Look at it in this order:

1. `docs/benchmarks/stagepilot-latest.json`
2. `GET /v1/runtime-brief`
3. `GET /v1/summary-pack`
4. BenchLab / replay surfaces if you want more detail

## Why the benchmark matters

The point isn't just "higher score."

What's actually useful:
- Parser middleware removes a whole class of silent tool-call failures
- Bounded retry keeps repair behavior visible and explicit
- Checked-in artifacts mean you can verify claims after the fact

## Bottom line

StagePilot turns ambiguous tool-call breakage into something you can see, replay, and benchmark.
