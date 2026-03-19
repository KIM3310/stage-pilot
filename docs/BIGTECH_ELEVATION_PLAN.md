# Big-Tech Elevation Plan

## Hiring Thesis

Turn `stage-pilot` from a strong parser plus benchmark repo into a canonical `LLM tool-runtime reliability` proof. The hiring story should be: this repo hardens tool use across unstable providers, exposes failure boundaries clearly, and proves recovery quality with repeatable evidence.

## Implemented Now

- `GET /v1/failure-taxonomy` is live and makes parser drift, bounded retry exhaustion, delivery readiness gaps, and observed runtime regressions reviewable in one surface.
- `GET /v1/runtime-scorecard` is already live and now pairs cleanly with the failure taxonomy for runtime pressure and promotion posture.

## 30 / 60 / 90

### 30 days
- Add a provider matrix runner that compares OpenAI-compatible, Gemini, Claude-compatible, Ollama, and local prompt-mode routes under one schema contract.
- Add a checked-in malformed tool-call corpus with tagged buckets such as `schema-drift`, `partial-json`, `parallel-call-shape`, and `trailing-token`.
- Expose a first-class runtime scorecard route for success rate, retry count, latency, and parser recovery distribution.

### 60 days
- Add schema drift replay routes that show before/after behavior when tool definitions change.
- Add cost and latency deltas by model family so operators can discuss reliability tradeoffs honestly.
- Add workflow-level traces that make parser, repair, retry, and final handoff decisions inspectable per request.

### 90 days
- Add continuous benchmark publishing for the provider matrix and benchmark corpus.
- Add a "production adoption guide" that explains where parser middleware ends and application trust policy begins.
- Add one end-to-end case study showing a broken tool path that becomes stable only because of StagePilot.

## Proof Surfaces

### Live now
- `GET /v1/runtime-scorecard`
- `GET /v1/failure-taxonomy`

### Next
- `GET /v1/provider-matrix`
- `GET /v1/schema-drift-replay`

## Success Bar

- Anyone can compare providers without reading raw benchmark JSON first.
- A hiring panel can see exactly which failure classes are recovered and which are still rejected.
- The repo supports a credible discussion about bounded recovery, not just "the parser got better."
