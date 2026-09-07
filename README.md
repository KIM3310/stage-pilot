# StagePilot

**A tool-call reliability lab with inspectable recovery and retry behavior.**

StagePilot extends an Apache-2.0 parser codebase with orchestration, service APIs, diagnostics, and a reproducible mutation benchmark. Read the [provenance notice](NOTICE.md): the upstream parser and its npm package belong to their original maintainer.

The original project is [minpeter/ai-sdk-tool-call-middleware](https://github.com/minpeter/ai-sdk-tool-call-middleware) by Woonggi Min. StagePilot does not publish or control the `@ai-sdk-tool/parser` npm package.

[Demo](https://stage-pilot.pages.dev/) · [CI](https://github.com/KIM3310/stage-pilot/actions/workflows/ci.yml) · [Apache-2.0](LICENSE)

## Inspect the implementation

| Engineering problem | Implementation | Verify |
|---|---|---|
| Tool-call formats drift | Parser recovery, schema coercion, and explicit tool definitions. | Read the recovery path in [the benchmark](src/stagepilot/benchmark.ts). |
| Retries can obscure how a result was obtained | Per-case records expose mutation mode, attempts, parse outcome, and plan outcome. | [Benchmark tests](tests/stagepilot-benchmark.test.ts) |
| Experiments need bounded, reproducible inputs | Seeded fixtures, validated integer limits, and an honored one-attempt budget. | Compare one-attempt and two-attempt runs. |

## Reproduce

Use Node.js 22.12+ and the pinned pnpm version in `package.json`.

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm bench:stagepilot
```

The benchmark writes `docs/benchmarks/stagepilot-latest.json`, including the individual case outcomes. `pnpm verify` runs lint, type checks, tests, and ESM/CommonJS/declaration builds.

## Read the result correctly

The default suite contains **60 synthetic cases across 30 mutation modes**. The recorded fixture pass rates are 20/60 for the baseline, 40/60 for middleware, and 54/60 with the prewritten retry sequence. These are parser/workflow fixture outcomes, not real-model accuracy or an independently sampled production success rate.

Retry responses are supplied by the fixture generator. Reported latency measures local parsing and plan construction; it excludes model inference and network calls. Cases that still fail remain in the report. The repository is intentionally private in its package manifest and does not publish the upstream npm package.

## Further reading

- [Detailed reference](REFERENCE.md)
- [Engineering changes and regression cases](docs/engineering-notes.md)
- [Cloud architecture](docs/cloud-ai-architecture.md) · [Machine-readable blueprint](docs/architecture/blueprint.json) · [Blueprint validator](scripts/validate_architecture_blueprint.py)
