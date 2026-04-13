# ADR-003: Benchmark Methodology

## Status

Accepted

## Context

We need a way to measure whether parser changes actually improve tool-calling reliability. The measurement must be reproducible (same inputs produce same results), realistic (test cases represent real-world failures), and diagnostic (tells you _why_ something failed, not just _that_ it failed).

Common approaches we considered:

1. **Ad hoc testing** — run a few examples, eyeball the output. Fast but not reproducible. You can't tell if a regression happened.
2. **Live model evaluation** — send prompts to a real LLM, measure tool-call success. Realistic but non-deterministic (model updates, temperature variance, rate limits). Expensive to run repeatedly.
3. **Deterministic mutation benchmark** — generate synthetic tool-call output with known failure patterns, run parser strategies against them, compare success rates. Reproducible, fast, free.

We also needed to separate two categories of failure:
- **Format failures**: the model produced the right information but in a broken format (missing brace, wrong encoding, extra tokens). These are fixable by parsing.
- **Semantic failures**: the model misunderstood what tool to call or what arguments to provide (wrong tool name, empty arguments). These require model-level fixes (fine-tuning, better prompts).

## Decision

Deterministic mutation benchmark with seeded random case generation and categorized failure modes.

### Case Generation

- `createBenchmarkCases(caseCount, seed)` generates `caseCount` cases using a seeded PRNG.
- Same seed always produces the same cases. Default seed: `20260413`.
- Each case gets tool arguments (caseId, district, notes, risks, urgencyHint) sampled from fixed pools.
- Each case is assigned a mutation mode from the `MUTATION_SEQUENCE` array, cycling through all 30 modes.
- Default case count: 60 (each of the 30 modes appears twice).

### Mutation Modes (30)

Each mode applies a specific transformation to the canonical tool-call output. The transformation represents a real failure pattern observed in production LLM outputs.

Categories:

**Format normalization (recoverable by parser):**
- `strict`, `relaxed-json`, `mixed-quotes`, `trailing-comma-json`, `reversed-key-order` — JSON format variations
- `no-tags`, `prefixed-valid`, `markdown-fenced`, `bom-prefix` — wrapper/encoding issues
- `unicode-in-values`, `multiline-values`, `null-bytes`, `html-escaped-payload` — content encoding
- `coercible-types`, `double-encoded-json` — type/encoding mismatches

**Structural repair (recoverable by parser + retry):**
- `missing-brace`, `truncated-json`, `garbage-tail` — incomplete output
- `deeply-nested-args`, `json-in-xml-wrapper`, `xml-attribute-style` — structural mismatch
- `yaml-body`, `comment-in-json` — alternative format
- `oversized-payload`, `concurrent-tool-calls`, `backreference-placeholder`, `adversarial-injection` — edge cases

**Semantic (unrecoverable by parser — requires model fix):**
- `wrong-tool-name` — model hallucinated a non-existent tool name
- `empty-arguments` — model emitted correct tool envelope with no payload
- `partial-schema` — model provided some required fields but not all

### Strategies Compared

1. **baseline** — regex extraction of `<tool_call>` tags + `JSON.parse`. No repair, no retry.
2. **middleware** — full protocol detection + RJSON/RXML parsing + schema coercion. Single pass, no retry.
3. **middleware+ralph-loop** — middleware + RALPH (Retry Attempt Loop for Parse Handling). Up to 2 attempts; second attempt uses canonical format for recoverable modes, reproduces the defect for unrecoverable modes.

### Metrics Captured

Per strategy:
- `parseSuccessCount` / `planSuccessCount` — how many cases parsed and ran successfully
- `successRate` — percentage
- `avgLatencyMs` / `p95LatencyMs` — timing
- `avgAttemptsUsed` — retry utilization
- `failedCaseIds` — which cases failed (diagnostic)

### Reproducibility

- Seeded PRNG ensures identical cases across runs
- Benchmark runs locally with zero network calls (no LLM API needed)
- JSON artifacts captured in `docs/benchmarks/` for version-controlled history
- CI runs benchmark on every PR to detect regressions

## Consequences

Good:
- **Reproducible**: same seed = same cases = same results. Compare across commits.
- **Fast**: 60 cases run in <1 second. No API costs.
- **Diagnostic**: failed case IDs + mutation modes tell you exactly what broke and why.
- **Regression-safe**: CI runs prevent unnoticed regressions.
- **Extensible**: new mutation modes can be added without changing the harness.

Trade-offs:
- **Synthetic data only**: doesn't capture failure patterns we haven't seen yet. Mitigated by the BenchLab experiments which run against real models (Claude, Gemini, Grok, Ollama local models).
- **Single tool schema**: benchmark uses one tool (`route_case`). Multi-tool scenarios need separate testing.
- **No latency realism**: synthetic benchmark measures parser latency, not end-to-end LLM latency. Load testing via k6 covers this separately.
- **Unrecoverable modes artificially fail**: `wrong-tool-name`, `empty-arguments`, `partial-schema` are expected failures that cap the maximum achievable success rate. This is intentional — it surfaces the gap that fine-tuning must close (see [tool-call-finetune-lab](https://github.com/KIM3310/tool-call-finetune-lab)).
