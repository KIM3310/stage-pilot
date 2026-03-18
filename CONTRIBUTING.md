# Contributing to StagePilot

Thank you for your interest in contributing to StagePilot. This guide covers everything you need to get started.

## Prerequisites

- **Node.js 18+** (LTS recommended)
- **pnpm 9+** — install via `corepack enable && corepack prepare pnpm@latest --activate`
- **Git** with a GitHub account

## Getting Started

1. **Fork and clone** the repository:

   ```bash
   git clone https://github.com/<your-username>/stage-pilot.git
   cd stage-pilot
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Copy the environment file** and fill in any required keys:

   ```bash
   cp .env.example .env
   ```

4. **Verify your setup** by running the full check suite:

   ```bash
   pnpm verify   # runs type-check, lint, test, and build
   ```

## Development Workflow

### Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The configuration lives in `biome.jsonc`.

```bash
pnpm check:biome    # check for lint/format issues
pnpm fmt:biome      # auto-fix lint/format issues
```

Do not introduce ESLint or Prettier configurations. Biome handles both concerns.

### Type Checking

```bash
pnpm check:types    # runs tsc --noEmit
```

### Testing

Tests use [Vitest](https://vitest.dev/) and live in the `tests/` directory.

```bash
pnpm test           # run all tests
```

When adding new functionality, include corresponding tests. The benchmark harness is deterministic and runs in-process — no network calls or API keys are needed for the core test suite.

### Building

```bash
pnpm build          # clean build via tsup
```

## Making Changes

1. **Create a feature branch** from `main`:

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes.** Keep commits focused and atomic.

3. **Add a changeset** if your change affects the published package or public API:

   ```bash
   pnpm changeset
   ```

   Follow the prompts to describe the change and select a semver bump level.

4. **Run the full verification** before pushing:

   ```bash
   pnpm verify
   ```

## Pull Request Process

1. Push your branch and open a PR against `main`.
2. Fill out the PR template — describe what changed, why, and how to test it.
3. Ensure CI passes (type-check, lint, tests, build).
4. A maintainer will review your PR. Address feedback with additional commits rather than force-pushing, so the review history stays readable.
5. Once approved, a maintainer will squash-merge your PR.

## Reporting Issues

Use the [GitHub issue templates](https://github.com/KIM3310/stage-pilot/issues/new/choose) for bug reports and feature requests. Include reproduction steps and relevant environment details.

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 license.
