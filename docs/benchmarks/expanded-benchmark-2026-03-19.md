# Expanded StagePilot Benchmark (2026-03-19)

Previous benchmark: 24 cases, 7 mutation modes.
Expanded benchmark: 40 cases, 20 mutation modes.

## Results

| Strategy | Success | Rate | Avg Latency (ms) | P95 Latency (ms) | Avg Attempts |
|---|---:|---:|---:|---:|---:|
| baseline | 10 / 40 | 25.00% | 0.02 | 0.03 | 1.00 |
| middleware | 26 / 40 | 65.00% | 0.12 | 0.31 | 1.00 |
| middleware+ralph-loop | 36 / 40 | 90.00% | 0.05 | 0.09 | 1.35 |

Improvement deltas:

- Middleware vs Baseline: +40.00pp
- Ralph Loop vs Middleware: +25.00pp
- Ralph Loop vs Baseline: +65.00pp

## Why the numbers changed

The original 24-case suite covered 7 mutation modes (strict, relaxed-json, coercible-types, missing-brace, no-tags, garbage-tail, prefixed-valid). All 7 modes were recoverable with middleware+retry, producing a flat 100%.

The expanded suite adds 13 new mutation modes designed to stress the parser's actual boundaries. The 90% rate is a more honest signal because it exposes cases that genuinely cannot be recovered by parser heuristics alone.

## Mutation modes (20 total)

### Original 7 (all recoverable)

| Mode | Description | Baseline | Middleware | Loop |
|---|---|:---:|:---:|:---:|
| strict | Well-formed `<tool_call>` JSON | pass | pass | pass |
| relaxed-json | Single-quoted keys, unquoted identifiers | fail | pass | pass |
| coercible-types | Numeric strings, scalar-to-array mismatch | fail | pass | pass |
| missing-brace | Truncated closing `}` in JSON envelope | fail | fail | pass |
| no-tags | Raw JSON without `<tool_call>` wrapper | fail | pass | pass |
| garbage-tail | Valid JSON with trailing tokens after `}` | fail | pass | pass |
| prefixed-valid | Prose text before and after valid tool call | fail | pass | pass |

### New 13 edge cases

| Mode | Description | Baseline | Middleware | Loop | Notes |
|---|---|:---:|:---:|:---:|---|
| deeply-nested-args | Tool payload buried 6 levels deep in metadata wrapper | fail | fail | pass | Recovered on retry with canonical format |
| unicode-in-values | Korean text and emoji in argument values | fail | pass | pass | UTF-8 round-trips cleanly through rjson |
| oversized-payload | 12K+ char notes field, no `<tool_call>` tags | fail | fail | pass | Exceeds `maxCandidateLength` (10K) in recovery scanner; retry uses tags |
| trailing-comma-json | Trailing commas in objects and arrays | fail | pass | pass | rjson handles relaxed JSON natively |
| json-in-xml-wrapper | Valid tool call inside `<response><reasoning>` XML | fail | pass | pass | Hermes regex extracts `<tool_call>` regardless of outer XML |
| concurrent-tool-calls | Two `<tool_call>` blocks; first is a decoy tool | fail | pass | pass | Parser iterates all tool calls, matches known tool name |
| empty-arguments | Correct tool name, empty `{}` arguments | fail | fail | **fail** | Missing required fields (caseId, district, notes, risks); retry reproduces same defect |
| backreference-placeholder | `{{previous_result.case_id}}` placeholder tokens in values | fail | pass | pass | Placeholders pass through as string values; validation is downstream |
| adversarial-injection | Prompt injection with nested `</tool_call>` in notes | fail | pass | pass | Injection lands inside JSON string value, not as markup |
| wrong-tool-name | Tool name misspelled as `rout_case` | fail | fail | **fail** | Parser validates against registered tool definitions; no fuzzy match |
| truncated-json | JSON cut at 60% length, no closing tag | fail | fail | pass | rjson recovery fails on truncated input; retry provides complete payload |
| html-escaped-payload | HTML entities (`&quot;`, `&lt;`) instead of raw chars | fail | fail | pass | rjson does not decode HTML entities; retry provides clean JSON |
| double-encoded-json | `arguments` is a JSON string, not an object | fail | fail | pass | `parseAsToolPayload` rejects string arguments; retry provides object form |

## Known failure modes (4 cases)

These cases fail even with middleware+ralph-loop because the defect is structural, not syntactic. Retrying with the same misunderstanding does not help.

### 1. wrong-tool-name (bench-17, bench-37)

The model outputs `rout_case` instead of `route_case`. The parser validates tool names against registered definitions and has no fuzzy-matching heuristic. This is by design: accepting approximate tool names would create silent misrouting in production.

**Why retry does not help:** The model's internal representation of the tool name is wrong. Without explicit correction in the retry prompt, it reproduces the same misspelling.

### 2. empty-arguments (bench-14, bench-34)

The model emits `{"name":"route_case","arguments":{}}` with a correct tool name but zero arguments. The `toIntakeInput` validator requires `caseId`, `district`, `notes`, and `risks`, all of which are missing.

**Why retry does not help:** The model lacks context about which fields to populate. A generic "try again" prompt does not inject schema information, so the retry produces the same empty payload.

### Potential mitigations (not yet implemented)

- **wrong-tool-name:** Levenshtein distance matching with a configurable similarity threshold. Trade-off: could silently route to the wrong tool if two tool names are similar.
- **empty-arguments:** Schema-aware retry prompts that include required field names in the correction instruction. Trade-off: increases prompt token cost per retry.

## Comparison with previous benchmark

| Metric | Previous (24 cases) | Expanded (40 cases) |
|---|---:|---:|
| Mutation modes | 7 | 20 |
| Baseline success | 29.17% | 25.00% |
| Middleware success | 87.50% | 65.00% |
| Middleware+loop success | 100.00% | 90.00% |
| Known failure modes | 0 | 2 (4 cases) |

The lower middleware rate (65% vs 87.5%) reflects the harder edge cases that require a retry to recover (deeply-nested, oversized, truncated, html-escaped, double-encoded). The loop closes most of these gaps. The 4 remaining failures are genuinely unrecoverable without architectural changes.

## Reproduction

```bash
BENCHMARK_CASES=40 BENCHMARK_SEED=20260228 BENCHMARK_LOOP_ATTEMPTS=2 pnpm bench:stagepilot
```

Artifact: [`stagepilot-latest.json`](stagepilot-latest.json)
