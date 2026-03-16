# ADR-002: AI SDK Middleware Pattern for the Parser Layer

## Status

Accepted

## Context

The parser layer is responsible for extracting structured tool calls from raw model output — text that may be XML, JSON, YAML, or an ad-hoc format the model invented on the fly. This layer must handle format normalization, schema coercion (casting string `"42"` to number `42` when the tool schema expects a number), and graceful recovery from malformed output.

We needed to decide how to package and distribute this functionality. The key requirements were:

1. **Provider independence.** The parser must work with any model accessible through the Vercel AI SDK — OpenAI, Anthropic, Google, Ollama, or any OpenAI-compatible endpoint. Users should not need to change their model configuration to use the parser.

2. **Composability.** Teams should be able to combine the parser with other middleware (logging, caching, rate limiting) without conflicts. The parser should not require wrapping or replacing the model object in an incompatible way.

3. **Incremental adoption.** Teams already using the AI SDK should be able to add the parser with minimal code changes — ideally a single `wrapLanguageModel()` call — without restructuring their application.

4. **Publishability.** The parser should be distributable as a standalone npm package that does not pull in the full StagePilot runtime or its dependencies.

We evaluated three approaches:

- **Custom model wrapper.** Create a new model class that wraps an inner model, intercepts `doGenerate` and `doStream`, and applies parsing. This works but couples the parser to a specific model interface version and makes composition with other wrappers awkward.

- **Post-processing utility.** Provide a function that takes raw model output and returns parsed tool calls. Simple, but pushes integration burden onto the consumer and does not work with streaming.

- **AI SDK middleware.** Use the `LanguageModelV2Middleware` interface from `@ai-sdk/provider-utils`, which provides standardized hooks for `transformParams` and `wrapGenerate`/`wrapStream`. The middleware is applied via `wrapLanguageModel()` and composes naturally with other middleware.

## Decision

We implement the parser as AI SDK middleware, published as `@ai-sdk-tool/parser`.

Each parser variant (Hermes JSON, MorphXML, YamlXML, Qwen3Coder) is a separate middleware factory that returns a `LanguageModelV2Middleware` object. Consumers apply it with a single call:

```ts
import { morphXmlToolMiddleware } from "@ai-sdk-tool/parser";
import { wrapLanguageModel, streamText } from "ai";

const enhanced = wrapLanguageModel({
  model: anyModel,
  middleware: morphXmlToolMiddleware,
});
```

The middleware intercepts the model's text output in `wrapGenerate` and `wrapStream`, runs the appropriate parser, coerces argument types against the declared tool schemas, and injects the resulting tool calls into the response as if the model had produced them natively.

## Consequences

**Benefits:**

- **No provider lock-in.** The middleware sits between the AI SDK and any model provider. Switching from OpenAI to Ollama or Google requires no parser changes. This is critical for StagePilot's mission of stabilizing tool calls across provider families.
- **Composable by design.** Multiple middleware layers can be stacked via `wrapLanguageModel`. The parser composes cleanly with logging middleware, caching layers, or custom transformations. There are no conflicts with other middleware that follows the AI SDK contract.
- **Minimal integration surface.** Adding the parser to an existing AI SDK application requires importing one middleware and wrapping the model. No changes to prompts, tool definitions, or response handling.
- **Streaming support.** The `wrapStream` hook allows the parser to process tool calls as they are generated, rather than waiting for the full response. This preserves the streaming UX that AI SDK consumers expect.
- **Independent versioning.** The parser is published as `@ai-sdk-tool/parser` with its own semver lifecycle. It does not depend on the StagePilot runtime, agents, or infrastructure code. Teams can use the parser without adopting the full orchestration pipeline.

**Trade-offs:**

- **AI SDK coupling.** The middleware depends on the `LanguageModelV2Middleware` interface. If the AI SDK changes this interface in a future major version, the parser will need to be updated. This is an acceptable trade-off given the AI SDK's stability and the benefit of native integration.
- **Limited to AI SDK consumers.** Teams using raw HTTP calls to model APIs, or using a different SDK (like LangChain), cannot use this middleware directly. We mitigate this by also exporting the core parsing functions for standalone use via the `/rxml`, `/rjson`, and `/schema-coerce` subpath exports.
- **Opaque to the model.** The middleware modifies the response after the model has generated it. The model does not "know" its output will be parsed, which means it cannot be guided to produce more parser-friendly output. This is addressed at the prompt layer in the StagePilot runtime, but not by the middleware alone.
