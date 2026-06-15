# StagePilot Solution Architecture

## Problem Statement

LLMs without native tool-calling support produce unreliable structured output. Format varies between turns (XML, JSON, YAML), tool names get hallucinated, required arguments are omitted, and types mismatch the schema. Our benchmark shows **25% baseline success rate** — meaning 3 out of 4 tool calls fail in raw form.

## Design Principles

1. **Separation of concerns** — parsing, orchestration, and observability are independent layers
2. **Fail fast, fail visible** — each stage has pass/fail gates with telemetry
3. **Incremental adoption** — use the parser alone, or the full pipeline, or just the benchmark
4. **Reproducible evaluation** — deterministic benchmarks, seeded cases, versioned artifacts

## System Layers

```mermaid
graph TB
    subgraph L1["Layer 1: Parser Middleware"]
        direction TB
        A1["Protocol Detection<br/>(Hermes, MorphXML, YamlXML, Qwen3Coder)"]
        A2["RJSON Parser<br/>(relaxed JSON with repair)"]
        A3["RXML Parser<br/>(relaxed XML with tokenizer)"]
        A4["Schema Coercion<br/>(type normalization)"]
        A5["RALPH Retry Loop<br/>(bounded 2-pass recovery)"]
        A1 --> A2
        A1 --> A3
        A2 --> A4
        A3 --> A4
        A4 --> A5
    end

    subgraph L2["Layer 2: Orchestration Runtime"]
        direction TB
        B1["EligibilityAgent — scope check"]
        B2["SafetyAgent — policy enforcement"]
        B3["PlannerAgent — action plan"]
        B4["OutreachAgent — execution"]
        B5["JudgeAgent — quality architecture"]
        B1 --> B2 --> B3 --> B4 --> B5
    end

    subgraph L3["Layer 3: Evaluation"]
        direction TB
        C1["Benchmark Harness<br/>(30 mutation modes, seeded)"]
        C2["BenchLab<br/>(BFCL experiments)"]
        C3["Insights Engine<br/>(KPI derivation + Gemini summary)"]
        C4["Digital Twin<br/>(what-if simulation)"]
    end

    subgraph L4["Layer 4: Observability"]
        direction TB
        D1["OpenTelemetry Spans"]
        D2["Prometheus Metrics"]
        D3["Datadog Dashboards"]
        D4["Runtime Event Store (SQLite)"]
    end

    subgraph L5["Layer 5: Infrastructure"]
        direction TB
        E1["Docker"]
        E2["GCP Cloud Run + Terraform"]
        E3["Kubernetes + HPA"]
        E4["Vercel / Cloudflare Workers"]
    end

    L1 --> L2
    L2 --> L3
    L2 --> L4
    L2 --> L5
```

## Integration Boundaries

| Component | npm package | Standalone? | Dependencies |
|---|---|---|---|
| Parser Middleware | `@ai-sdk-tool/parser` | Yes | AI SDK, Zod |
| Sub-parsers | `@ai-sdk-tool/parser/rxml`, `/rjson`, `/schema-coerce` | Yes | None |
| StagePilot Runtime | — (in-repo) | Yes | Parser + Node.js |
| BenchLab | — (in-repo) | Yes | Python (for BFCL) |
| Infrastructure | — (in-repo) | Yes | Docker, K8s, Terraform |

Adopters can choose any combination:
- **Just the middleware**: `pnpm add @ai-sdk-tool/parser`, wrap your model, done
- **Middleware + benchmark**: clone the repo, run `pnpm bench:stagepilot` to validate
- **Full runtime**: deploy the API server with orchestration + observability

## Technology Selection Rationale

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript | AI SDK ecosystem is TypeScript-native. Type safety for schema coercion. |
| Parser architecture | Custom RJSON + RXML | Off-the-shelf parsers reject malformed input. We need repair, not rejection. |
| Middleware pattern | AI SDK `LanguageModelV2Middleware` | Provider-agnostic, composable, own npm lifecycle. See [ADR-002](adr/002-parser-middleware-design.md). |
| Pipeline design | Sequential 5-stage | Each stage isolates a concern. Failures are traceable. See [ADR-001](adr/001-stage-gated-pipeline.md). |
| Benchmark | Deterministic mutation | Reproducible, fast, free. See [ADR-003](adr/003-benchmark-methodology.md). |
| Observability | OTel + Prometheus | Industry standard. Vendor-agnostic. Pre-built Datadog dashboards for quick setup. |
| IaC | Terraform + K8s manifests | Cloud Run for simplicity, K8s for production scale. Both from same codebase. |

## Deployment Options

```mermaid
graph LR
    subgraph Dev["Development"]
        Local["pnpm api:stagepilot<br/>localhost:8080"]
    end

    subgraph Staging["Staging"]
        Docker["Docker<br/>docker run -p 8080:8080"]
        CR["GCP Cloud Run<br/>pnpm deploy:stagepilot"]
    end

    subgraph Prod["Production"]
        K8s["Kubernetes<br/>kubectl apply -f infra/k8s/"]
    end

    subgraph Edge["Edge"]
        Vercel["Vercel<br/>vercel deploy"]
        CF["Cloudflare Workers<br/>wrangler deploy"]
    end

    Local --> Docker
    Docker --> CR
    CR --> K8s
    Local --> Vercel
    Local --> CF
```

## Next Steps

- [ ] Per-model latency and cost scorecard (GPT-4o, Claude, Gemini, Qwen, Llama)
- [ ] Hosted benchmark dashboard with historical trend tracking
- [ ] Signed artifact snapshots for benchmark runs (tamper-proof)
- [ ] Multi-tool schema benchmark expansion
- [ ] Community middleware protocol contributions
