# Search Growth Implementation - StagePilot

This repository now exposes a search-readable service surface in addition to the system architecture. The implementation is designed to support organic discovery, AI answer surfaces, and a free-to-paid service path without committing to paid infrastructure first.

## Implemented Surface

| Surface | Path |
| --- | --- |
| Machine-readable offer | [docs/service-offer.json](./service-offer.json) |
| Revenue architecture | [docs/revenue-architecture.md](./revenue-architecture.md) |
| System architecture | [docs/system-architecture.md](./system-architecture.md) |
| Public canonical URL | https://stage-pilot.pages.dev/ |
| Lead capture URL | https://kim3310-doeon-kim-portfolio.pages.dev/?offer=stage-pilot&inquiry=agent-reliability-audit#private-inquiry |
| Repository resource route | https://kim3310-doeon-kim-portfolio.pages.dev/resources/stage-pilot/ |
| Commercial route | https://kim3310-doeon-kim-portfolio.pages.dev/?offer=stage-pilot#service-offers |

## Search Positioning

- Primary query: StagePilot tool-calling reliability gateway
- Secondary queries: StagePilot demo; StagePilot system architecture; StagePilot developer tool; tool-calling reliability gateway with regression tests, provider scorecards, and trace observability service
- Public entry point: free public benchmark/demo routes and sample traces
- Paid boundary: paid hosted regression workspace, private benchmark scenarios, and provider routing dashboard

## Conversion Boundary

The public surface stays crawlable and free. Paid value starts when a visitor wants private data, saved history, branded export packs, customer-specific connectors, recurring reports, or implementation support.

## Deployment Notes

- Keep the sitemap and robots file aligned with the final production domain.
- Submit the canonical URL and sitemap in Google Search Console after the domain is connected.
- The lead-capture path is the central Cloudflare D1 private inquiry form at https://kim3310-doeon-kim-portfolio.pages.dev/?offer=stage-pilot&inquiry=agent-reliability-audit#private-inquiry; public GitHub issues are not used for confidential or commercial scoping.
- Keep exact free-tier quotas out of public promises because provider limits change.
