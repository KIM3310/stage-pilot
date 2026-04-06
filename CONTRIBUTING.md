# Contributing

## Prerequisites

- Node.js 18+ (LTS recommended)
- pnpm 9+ -- `corepack enable && corepack prepare pnpm@latest --activate`
- Git + GitHub account

## Getting Started

1. Fork and clone:

   ```bash
   git clone https://github.com/<your-username>/stage-pilot.git
   cd stage-pilot
   ```

2. Install deps:

   ```bash
   pnpm install
   ```

3. Copy env file, fill in keys:

   ```bash
   cp .env.example .env
   ```

4. Verify setup:

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

Add tests when you add features. Benchmark harness is deterministic and in-process -- no network calls or API keys needed.

### Building

```bash
pnpm build          # clean build via tsup
```

## Making Changes

1. Branch off `main`:

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes. Keep commits focused.

3. Add a changeset if it affects the published package:

   ```bash
   pnpm changeset
   ```

   Follow the prompts for change description and semver bump.

4. Run verification before pushing:

   ```bash
   pnpm verify
   ```

## Pull Request Process

1. Push your branch and open a PR against `main`.
2. Fill out the PR template — describe what changed, why, and how to test it.
3. Ensure CI passes (type-check, lint, tests, build).
4. A maintainer will review your PR. Address feedback with additional commits rather than force-pushing, so the review history stays readable.
5. Once approved, a maintainer will squash-merge your PR.

## Issues

Use the [issue templates](https://github.com/KIM3310/stage-pilot/issues/new/choose). Include repro steps and environment info.

## License

Contributions are licensed under Apache-2.0.
