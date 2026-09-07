# Reproducible setup and visible benchmark outcomes

Fresh installation failed because the lockfile and the two locations of pnpm overrides disagreed. Overrides now have one location in `pnpm-workspace.yaml`, the lockfile is regenerated, and the macOS-only direct Rollup dependency is removed; Rollup selects its own platform binary. The repository is verified with the declared pnpm 10.34.5 version and a frozen install.

The benchmark previously coerced a one-attempt budget to two attempts, and did not reject non-finite/fractional options. It now honors one attempt and rejects invalid counts before constructing fixtures. Every strategy emits per-case identifiers, mutation modes, attempts, and parse/plan outcomes so aggregate counts can be reconciled.

Run `pnpm verify` and `pnpm bench:stagepilot`. The benchmark regression checks compare a one-attempt loop with middleware-only results and reconcile case outcomes with the reported totals and failure IDs.

The 60-case suite is a synthetic parser experiment. Second responses are prewritten fixtures; local latency excludes a live model or network. Source provenance remains documented in `NOTICE.md`, and no upstream package ownership or download statistics are claimed.
