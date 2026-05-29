# Enterprise Readiness Notes - StagePilot

Updated: 2026-05-30

This note defines what an enterprise buyer, public-sector reviewer, serious user, or technical evaluator can safely infer from this repository today. It is intentionally conservative: public proof is separated from production claims.

## Scope

| Field | Notes |
|---|---|
| Repository | `stage-pilot` |
| Lane | B2B developer tooling |
| Primary reader or buyer | AI platform teams and developer-tool teams shipping agents that need robust tool-call parsing. |
| Core wedge | Parser/runtime/benchmark surface that improves malformed tool-call recovery. |
| Stack | TypeScript/JavaScript, Terraform, Cloudflare, Docker |
| Readiness posture | Pilot-ready technical surface; production use requires customer-specific identity, monitoring, data, and support controls. |

## Enterprise Controls

| Control | Current expectation |
|---|---|
| Data boundary | Public artifacts should use demo, fixture, or synthetic data until the buyer approves data handling, retention, and access controls. |
| Identity and access | Production pilots should add SSO/OIDC, RBAC, scoped service accounts, secret rotation, and admin-visible access reviews. |
| Auditability | Keep decision logs, generated reports, CI results, eval outputs, and operator handoff artifacts reviewable. |
| Observability | Track health checks, latency, error budget, cost, eval pass rate, audit-log completeness, and handoff/report generation status. |
| Release gate | Full local gate: pnpm run verify; Test suite: pnpm test; Typecheck: pnpm run typecheck; Production build: pnpm run build |
| Support handoff | Name the owner, escalation path, rollback path, known limits, and review cadence before a paid or production pilot. |

## Verification Surface

| Purpose | Command |
|---|---|
| Full local gate | `pnpm run verify` |
| Test suite | `pnpm test` |
| Typecheck | `pnpm run typecheck` |
| Production build | `pnpm run build` |

## CI Surface

- .github/workflows/architecture-blueprint.yml
- .github/workflows/ci.yml
- .github/workflows/code-quality.yml
- .github/workflows/dependency-review.yml
- .github/workflows/pages-auto-deploy.yml
- .github/workflows/release-changeset.yml
- .github/workflows/repository-health.yml
- .github/workflows/repository-surface.yml
- .github/workflows/secret-scan.yml

## Acceptance Criteria

- pnpm run verify can be run or the equivalent CI gate is visible.
- README, review guide, quality notes, revenue model, and this readiness note agree on the same scope.
- Demo, fixture, synthetic, or public-data boundaries are explicit before a buyer sees outputs.
- A reviewer can identify the first useful outcome without reading implementation details.
- Production claims stay behind customer-specific validation, access control, monitoring, and support handoff.

## Integration Path

- Run a synthetic-data walkthrough with the buyer and document the acceptance criteria.
- Scope a controlled pilot using approved data, named users, secrets, and rollback paths.
- Convert the pilot into an operating handoff with monitoring, review cadence, support owner, and renewal metric.

## Proof Points

- verify passes
- Published package surface is clear
- Benchmark claim is reproducible

## Operating Metrics

- Tool-call recovery
- Mutation coverage
- Integration defects avoided

## Open Risks

- Provider-neutral fixtures only
- Customer prompts need evals
- No universal reliability guarantee

## Finish Line

- Keep the public repository honest, runnable, and easy to review.
- Keep sensitive data, secrets, private tenant details, and unsupported claims out of public artifacts.
- Treat this repository as a proof surface until an approved pilot defines users, data, access, monitoring, support, and success metrics.
