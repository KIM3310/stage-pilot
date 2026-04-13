# From 25% to 90%: Fixing Unreliable LLM Tool Calling with Parser Middleware

> How we built a stage-gated pipeline and parser middleware to make LLM tool-calling reliable enough for production.

---

## Introduction

If you have ever shipped an LLM-based agent to production, you have experienced the pain: you specify a JSON schema in your prompt, and the model responds with XML. You define a tool called `searchWeb`, and the model invents `web_search`. You mark an argument as required, and the model omits it entirely.

**Tool-calling reliability** is the fundamental bottleneck of LLM agent systems.

Models with native tool-calling support (GPT-4o, Claude) handle this reasonably well. But the moment you use an open-source model, a smaller model, or hit an edge case, things fall apart. In our benchmarks, unassisted tool calling succeeded only **25% of the time**.

This post covers how `stage-pilot` and its npm package `@ai-sdk-tool/parser` brought that number to **90%** -- a 3.6x improvement -- using parser middleware and an augmented retry loop.

---

## 1. The Problem: Why Tool Calling Breaks

### Format Drift

The same model, given the same prompt, produces different output formats across turns.

```
// Turn 1
{"tool": "search", "args": {"query": "weather"}}

// Turn 2 (same model, same prompt)
<tool_call>
  <name>search</name>
  <arguments><query>weather</query></arguments>
</tool_call>
```

You asked for JSON and got XML. You asked for XML and got JSON wrapped in a markdown code fence. This **format drift** is silent, unpredictable, and pipeline-breaking.

### Common Failure Patterns

| Failure Type | Example | Frequency |
|-------------|---------|-----------|
| Tool name hallucination | Model invents `web_search` instead of `searchWeb` | High |
| Missing required args | Calls tool without `query` parameter | High |
| Type mismatch | Sends string `"42"` where number `42` is expected | Medium |
| Nested structure errors | Returns flat object where nested object is expected | Medium |
| Mixed formats | JSON body containing XML tags | Low |

### Why Regex Hacks Don't Work

The typical approach is to regex the output and hope for the best.

```typescript
// The classic regex hack
const match = output.match(/```json\n([\s\S]*?)\n```/);
const toolCall = JSON.parse(match[1]);
```

This works **only when the model produces the exact format you expected**. One deviation and your pipeline crashes. In production, this is not acceptable.

---

## 2. The Approach: Stage-Gated Pipeline

`stage-pilot` structures LLM workflows as a pipeline of 5 stages, each managed by an independent agent with its own pass/fail gate and telemetry.

```
[Eligibility] --> [Safety] --> [Planner] --> [Outreach] --> [Judge]
      |               |            |             |             |
   Pass/Fail      Pass/Fail    Pass/Fail     Pass/Fail     Pass/Fail
```

### Stage Responsibilities

1. **Eligibility**: Determines whether the input qualifies for pipeline processing
2. **Safety**: Validates content safety and filters harmful inputs
3. **Planner**: Builds execution plans and determines tool-call sequences
4. **Outreach**: Executes actual external API and tool calls
5. **Judge**: Evaluates final output quality and decides to approve or retry

### Parser Middleware

The core innovation is **parser middleware** that intercepts model output at each stage.

```typescript
import { createParserMiddleware } from '@ai-sdk-tool/parser';

const middleware = createParserMiddleware({
  // Step 1: Format normalization (auto-detect and repair JSON/XML)
  formatNormalization: true,
  // Step 2: Schema coercion (auto-fix type mismatches)
  schemaCoercion: true,
  // Step 3: Fuzzy tool name matching
  fuzzyToolMatch: true,
});
```

### The RALPH Retry Loop

When the parser cannot recover the output, **RALPH** (Retry with Augmented LLM Prompt Hinting) kicks in.

```typescript
const ralph = createRetryLoop({
  maxRetries: 3,
  strategy: 'augmented-hint',
  onRetry: (attempt, error) => {
    // Append failure context as a hint to the next prompt
    return {
      hint: `Previous attempt failed: ${error.message}. 
             Please output valid JSON matching the schema.`
    };
  }
});
```

RALPH is not a naive retry. It analyzes the previous failure and augments the prompt with corrective hints, making each subsequent attempt more likely to succeed.

---

## 3. Benchmark Methodology

### Experimental Design

We designed a rigorous, reproducible benchmark with the following properties:

- **40 deterministic test cases**: Seeded random generation for full reproducibility
- **20 mutation modes**: Simulating real-world failure patterns
- **3 strategies compared**: Baseline, middleware only, middleware + retry

### The 20 Mutation Modes

| # | Mutation Mode | Description |
|---|--------------|-------------|
| 1 | `json_to_xml` | Returns XML when JSON was requested |
| 2 | `xml_to_json` | Returns JSON when XML was requested |
| 3 | `missing_required_arg` | Randomly removes a required argument |
| 4 | `extra_args` | Injects arguments not in the schema |
| 5 | `tool_name_hallucination` | Invents a non-existent tool name |
| 6 | `type_mismatch_string` | Sends string value for a number field |
| 7 | `type_mismatch_number` | Sends number value for a string field |
| 8 | `nested_object_flatten` | Flattens a nested object structure |
| 9 | `array_to_single` | Returns single value for an array field |
| 10 | `single_to_array` | Wraps single value field in an array |
| 11 | `markdown_wrapping` | Wraps response in markdown code fences |
| 12 | `partial_json` | Truncated JSON with missing closing brackets |
| 13 | `trailing_text` | Appends natural language after JSON |
| 14 | `leading_text` | Prepends natural language before JSON |
| 15 | `duplicate_keys` | JSON contains duplicate keys |
| 16 | `unquoted_keys` | JSON keys without quotes |
| 17 | `single_quotes` | Uses single quotes instead of double quotes |
| 18 | `boolean_as_string` | Returns `"true"`/`"false"` instead of `true`/`false` |
| 19 | `null_for_required` | Passes `null` for required fields |
| 20 | `empty_response` | Returns a completely empty response |

### Results

| Strategy | Passed | Success Rate | Improvement |
|----------|--------|-------------|-------------|
| Baseline (no parsing) | 10/40 | **25%** | -- |
| Middleware Only | 26/40 | **65%** | +40pp |
| Middleware + RALPH | 36/40 | **90%** | +65pp |

```
Success Rate Comparison
Baseline        ████████░░░░░░░░░░░░░░░░░░░░░░░░  25%
Middleware      ████████████████████░░░░░░░░░░░░░  65%
MW + RALPH      ████████████████████████████░░░░░  90%
```

### Failure Analysis

The remaining 10% (4 cases) broke down as follows:

- **Tool name hallucination (2 cases)**: The model invented entirely novel tool names that fuzzy matching could not recover
- **Empty response (1 case)**: The model refused to produce a tool call at all
- **Compound failure (1 case)**: Simultaneous type mismatch and missing arguments

These failures cannot be fixed at the parser level. They require **model-level intervention**.

---

## 4. Key Technical Decisions

### AI SDK Middleware Pattern

`@ai-sdk-tool/parser` adopts the Vercel AI SDK middleware pattern, enabling provider-agnostic integration.

```typescript
import { generateText } from 'ai';
import { createParserMiddleware } from '@ai-sdk-tool/parser';

const result = await generateText({
  model: yourModel,
  tools: yourTools,
  // Drop in the middleware -- that's it
  experimental_middleware: createParserMiddleware(),
  prompt: 'Search for the latest AI news',
});
```

One line of code. Works with OpenAI, Anthropic, Google, or any open-source provider. No changes to your existing tool definitions or prompt structure.

### Relaxed JSON/XML Parsers

Standard `JSON.parse()` is strict. It rejects single quotes, trailing commas, unquoted keys, and comments. LLM output frequently contains these "almost valid" patterns.

```typescript
// RJSON: Relaxed JSON Parser handles:
// - Single quotes:    {'key': 'value'}
// - Trailing commas:  {"a": 1, "b": 2,}
// - Unquoted keys:    {key: "value"}
// - Comments:         {"key": "value" /* comment */}
// - Truncated JSON:   {"key": "val

// RXML: Relaxed XML Parser handles:
// - Missing closing tags:   <tool><name>search
// - Unquoted attributes:    <tool name=search>
// - Namespace mismatches
```

### Schema Coercion

When the model returns `"42"` (string) but the schema expects `number`, coercion handles the conversion automatically.

```typescript
const coerce = createSchemaCoercion(toolSchema);

// Input:  { "count": "42", "active": "true", "tags": "ai" }
// Output: { "count": 42, "active": true, "tags": ["ai"] }
```

This single feature alone recovers a significant percentage of type mismatch failures.

### OpenTelemetry Instrumentation

Every stage is instrumented with OpenTelemetry for per-stage tracing.

```typescript
tracer.startActiveSpan('stage.planner', (span) => {
  span.setAttribute('stage.name', 'planner');
  span.setAttribute('tool.name', toolCall.name);
  span.setAttribute('parse.attempts', retryCount);
  span.setAttribute('parse.success', true);
  // ... stage logic
  span.end();
});
```

---

## 5. Deployment & Observability

### Infrastructure Stack

```
Code --> Docker Container --> GCP Cloud Run --> Kubernetes
            |                                       |
      Multi-stage Build               HPA (Horizontal Pod Autoscaler)
      (minimal image size)             (traffic-based auto-scaling)
```

### Observability Stack

```yaml
# Prometheus metrics example
stage_pilot_tool_call_total{stage="planner", status="success"}: 3847
stage_pilot_tool_call_total{stage="planner", status="failure"}: 412
stage_pilot_parse_retry_total{strategy="ralph"}: 891
stage_pilot_parse_duration_seconds{quantile="0.95"}: 0.234
```

- **Prometheus**: Custom metric collection (success/failure counts, parse time, retry counts)
- **Datadog**: Dashboard visualization and alerting
- **Terraform**: Full infrastructure as code (IaC)

The stage-gate pattern makes observability almost trivial. When something fails, the trace tells you exactly which stage, which tool call, and how many retries were attempted. Debugging goes from "something is broken somewhere" to "the planner failed on the third retry with a type mismatch error."

---

## 6. Results & Lessons Learned

### Key Numbers

- **25% to 90%**: 3.6x improvement in tool-calling reliability
- **Parser middleware alone**: +40 percentage points (25% to 65%)
- **RALPH retry on top**: +25 additional percentage points (65% to 90%)

### The Remaining 10%

The last 10% cannot be fixed by parsers or prompt engineering. When the model does not recognize the tool's existence or invents entirely new tool names, no amount of post-processing can help.

To address this, we are building a separate project: **tool-call-finetune-lab**. It uses LoRA fine-tuning to teach models about specific tool schemas at the weight level.

### Lessons

1. **Stage gates make debugging trivial.** When each stage has independent pass/fail telemetry, you know exactly where failures occur. Debugging time drops dramatically.

2. **Middleware pattern enables drop-in adoption.** No one wants to rewrite their agent framework to add reliability. A single middleware line that works with any provider removes the adoption barrier.

3. **Relaxed parsers beat strict parsers.** LLM output is "almost right" most of the time. Strict parsers reject everything. Relaxed parsers recover most of it.

4. **Retries must be augmented, not naive.** Retrying with the same prompt produces the same failure. Appending the previous failure reason as a hint materially improves the success rate on subsequent attempts.

---

## 7. What's Next

### Multi-Model Comparison

The current benchmark runs against a single model. We plan to run the same 40-case benchmark across GPT-4o, Claude, Gemini, and Qwen to map the tool-calling reliability landscape across providers.

### Extended Benchmark

40 cases is a starting point. We are expanding to 100+ cases covering more edge cases, longer tool-call chains, and multi-tool orchestration scenarios.

### Community Middleware Protocols

We plan to standardize the middleware interface of `@ai-sdk-tool/parser` so that the community can contribute custom parsers and recovery strategies as plugins.

---

## Closing Thoughts

Tool-calling reliability is a problem that will gradually diminish as models improve. But for now, if you are running LLM agents in production, you need an application-layer fix. `stage-pilot` and `@ai-sdk-tool/parser` provide that fix in a systematic, measurable way.

The code is available on [GitHub](https://github.com/doeon-kim/stage-pilot). The package can be installed via `npm install @ai-sdk-tool/parser`.

---

**Doeon Kim** -- AI Engineer at INTERX, building production-grade AI systems. Previously at Microsoft AI School. Trilingual: Korean, English, Japanese.
