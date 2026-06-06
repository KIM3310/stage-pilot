# Review Guide - StagePilot

Updated: 2026-05-30

Use this page as the short path through the repository. It keeps the review grounded in the code, docs, commands, and boundaries that are already present.

## Summary

| Field | Notes |
|---|---|
| Lane | B2B developer tooling |
| Core idea | Parser/runtime/benchmark surface that improves malformed tool-call recovery. |
| Primary reader | AI platform teams and developer-tool teams shipping agents that need robust tool-call parsing. |
| Stack | TypeScript/JavaScript, Terraform, Cloudflare, Docker |

## Open First

1. Start with the README fast path and architecture section.
2. Open `docs/service-launch-playbook.md` only when reviewing the product or service angle.
3. Check the commands below before making claims about quality.
4. Skim the CI workflows and fixture data before deeper implementation review.
5. Read the boundaries section before presenting the project externally.

## Checks

| Purpose | Command |
|---|---|
| Full local gate | `pnpm run verify` |
| Test suite | `pnpm test` |
| Typecheck | `pnpm run typecheck` |
| Production build | `pnpm run build` |

## CI

- .github/workflows/architecture-blueprint.yml
- .github/workflows/ci.yml
- .github/workflows/code-quality.yml
- .github/workflows/dependency-review.yml
- .github/workflows/pages-auto-deploy.yml
- .github/workflows/release-changeset.yml
- .github/workflows/repository-health.yml
- .github/workflows/repository-surface.yml
- .github/workflows/secret-scan.yml

## Evidence

- package scripts and web/runtime checks
- infrastructure-as-code review surface
- edge deployment configuration
- containerized delivery path
- verify passes
- Published package surface is clear
- Benchmark claim is reproducible

## Commercial Notes

| Possible offer | Working scope assumption |
|---|---|
| npm package support | OSS free + support |
| Parser reliability audit | $3k-$12k audit |
| Benchmark pack and integration help | $2k-$8k/month package support |

## Boundaries

- Provider-neutral fixtures only
- Customer prompts need evals
- No universal reliability guarantee

## Useful Metrics

- Tool-call recovery
- Mutation coverage
- Integration defects avoided
