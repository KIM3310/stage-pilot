# StagePilot portfolio overhaul plan — 2026-03-15

## Audit snapshot / starting point

The repo already has strong technical proof: benchmark artifacts, working API review surfaces, a static site, and passing checks. The main gaps are presentation and reviewer ergonomics rather than core functionality.

Key findings:
- reviewer story is strong but spread across README, docs, site, and API surfaces
- proof surface exists, but there is no single local command that prints the benchmark/review path cleanly
- README still mixes `npm` and `pnpm` guidance and carries at least one stale upstream-facing metadata signal
- repo/package metadata does not fully reinforce the canonical StagePilot surface
- review-pack proof assets can better reflect the strongest reviewer docs

## Scope

1. Tighten README so the flagship portfolio story is faster to parse for Big Tech / frontier AI reviewers.
2. Add a concise reviewer-proof guide and a local proof-summary command.
3. Improve package/repo hygiene with clearer metadata and verification affordances.
4. Keep code changes low-risk: only small service-meta/test updates needed to surface the stronger proof docs.

## Acceptance criteria

- a concise plan file exists in-repo before implementation
- README is more pnpm-first, reviewer-first, and removes misleading/stale metadata
- repo gains a concise reviewer-proof guide tied to exact files/routes/commands
- package.json exposes a clearer local verification path and better canonical metadata
- review-pack proof assets surface the stronger reviewer guide
- regression protection covers any proof-asset contract change
- `pnpm check`, `pnpm test`, and `pnpm build` pass after edits
- changes remain small, reviewable, and behavior-preserving

## Risks / watchouts

- avoid changing benchmark claims or runtime behavior without evidence
- avoid adding dependencies or broad CI/workflow churn
- keep docs aligned with actual checked-in routes/scripts only
- if proof-surface contract changes, update tests in the same diff
