# ADR-002: Parser as AI SDK Middleware

## Status

Accepted

## Context

The parser extracts tool calls from raw model text -- could be XML, JSON, YAML, or whatever the model feels like that day. Needs to normalize format, coerce types (string "42" -> number 42), and handle malformed output.

Requirements:
- Works with any AI SDK provider (OpenAI, Anthropic, Google, Ollama, etc.)
- Composable with other middleware (logging, caching, rate limiting)
- Easy to add -- ideally one `wrapLanguageModel()` call
- Publishable as standalone npm package without pulling in the rest of StagePilot

We looked at three options:
- **Custom model wrapper** -- works but couples to model interface version, awkward composition
- **Post-processing function** -- simple but doesn't work with streaming, pushes burden to consumer
- **AI SDK middleware** -- uses `LanguageModelV2Middleware` from `@ai-sdk/provider-utils`, composes naturally

## Decision

Implement as AI SDK middleware, published as `@ai-sdk-tool/parser`.

Each parser variant (Hermes JSON, MorphXML, YamlXML, Qwen3Coder) returns a `LanguageModelV2Middleware`. Applied with:

```ts
const enhanced = wrapLanguageModel({
  model: anyModel,
  middleware: morphXmlToolMiddleware,
});
```

Intercepts text output in `wrapGenerate`/`wrapStream`, runs the parser, coerces args against tool schemas, injects tool calls into the response.

## Consequences

Good:
- No provider lock-in. Switch models without touching parser code.
- Stacks cleanly with other middleware.
- One import + one wrap call to integrate.
- Streaming works via `wrapStream` hook.
- Own semver lifecycle, no dependency on StagePilot runtime.

Trade-offs:
- Tied to `LanguageModelV2Middleware` interface. If AI SDK changes it, we update.
- Only works for AI SDK consumers. Core parsing functions exported separately via `/rxml`, `/rjson`, `/schema-coerce` for other use cases.
- Model doesn't know its output will be parsed, so it can't optimize for it. Addressed at the prompt layer in StagePilot, not by middleware alone.
