# Discovery guide

## When this fits

- Agent workflows break because model output is close but not quite right
- You want to use cheaper models without losing tool reliability
- Benchmark reproducibility matters more than flashy demos

## Questions to ask

1. Which workflows fail most because tool args are malformed?
2. What's the current baseline success rate? How is it measured?
3. Is the issue native tool support, or text normalization?
4. How much latency can you spend on bounded recovery?
5. Which workflow should pilot the middleware?

## Demo flow

1. `/v1/runtime-brief`
2. `/v1/benchmark-summary`
3. `/v1/summary-pack`
4. BenchLab summary pack
5. Failure taxonomy + best benchmark claim

## What good looks like

- Measurable success-rate lift
- Weakest strategy is explainable
- Bounded retry is acceptable to ops
- Middleware is easy to drop in

## Follow-up reading

- `docs/solution-architecture.md`
- `docs/executive-one-pager.md`
- `docs/benchlab/FAILURE_TAXONOMY.md`
- `docs/benchlab/TOOL_CALLING_GAINS.md`
