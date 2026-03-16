# StagePilot Discovery Guide

## Best-fit signals

- agent workflows fail because model output is close to correct, but not executable
- the team wants cheaper models without losing tool reliability
- benchmark reproducibility matters more than flashy demo output

## Discovery questions

1. Which workflows fail most often because tool arguments are malformed?
2. What is the current baseline success rate and how is it measured?
3. Is the blocker provider-native tools, or tool text normalization?
4. How much latency budget can the team spend for bounded recovery?
5. Which workflow is the right pilot for middleware insertion?

## Demo path

1. show `/v1/runtime-brief`
2. show `/v1/benchmark-summary`
3. show `/v1/summary-pack`
4. open BenchLab summary pack
5. inspect failure taxonomy and strongest benchmark claim

## Success criteria

- success-rate lift is measurable
- weakest strategy is explainable
- bounded retry is acceptable to operators
- the middleware path is easy to integrate

## Follow-up artifacts

- `docs/solution-architecture.md`
- `docs/executive-one-pager.md`
- `docs/benchlab/FAILURE_TAXONOMY.md`
- `docs/benchlab/TOOL_CALLING_GAINS.md`
