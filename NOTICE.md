# StagePilot provenance notice

This repository began from the Apache-2.0 licensed
[`minpeter/ai-sdk-tool-call-middleware`](https://github.com/minpeter/ai-sdk-tool-call-middleware)
project by Woonggi Min (Copyright 2025 Woonggi Min). The root
[`LICENSE`](LICENSE) contains the canonical, unmodified Apache License 2.0
text; this notice preserves upstream attribution separately.

The upstream project publishes the `@ai-sdk-tool/parser` package on npm.
KIM3310 and StagePilot do not own, publish, or control that package or its npm
download statistics.

StagePilot-specific work in this repository includes the reliability service
APIs, StagePilot orchestration runtime, BenchLab, benchmark and scorecard
surfaces, cloud adapters, telemetry, deployment assets, and related
documentation. Git history is the authoritative record for individual file
and change provenance.

The root workspace is intentionally marked `private` and uses the internal
package name `stagepilot-reliability-lab` to prevent accidental publication
under the upstream package identity.
