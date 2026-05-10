# instagram-scraper

[![CI](https://github.com/ateliersam86/instagram-scraper/actions/workflows/ci.yml/badge.svg)](https://github.com/ateliersam86/instagram-scraper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

> A TypeScript Instagram scraper. Profiles, posts, reels, stories — built on the same patterns that produced [`@ateliersam86/strava-scraper`](https://github.com/ateliersam86/strava-scraper).

## Why?

Instagram's [Graph API](https://developers.facebook.com/docs/instagram-platform) is enterprise-only — it gates personal-archive use cases that don't justify a Meta partnership. This scraper does what `yt-dlp` doesn't cover: **stories** (24-hour expiring), **post captions / metadata in bulk**, and **profile snapshots** for archival.

Targets:
- Personal archive of your own account
- Following an athlete / artist whose feed you legitimately follow
- Atelier-web-travels integration: embedding stories alongside trip activities

## Status

🚧 **Pre-alpha — Phase 0–1 shipped, parsers in design**

**Detailed plan**: [`docs/PLAN.md`](docs/PLAN.md) covers the 12-phase
roadmap, competitive landscape (instaloader / instagrapi / gallery-dl),
anti-bot strategy, and per-phase quality gates.

**Surface research**: [`docs/SURFACES.md`](docs/SURFACES.md) documents the
real Instagram HTML structure (May 2026 recon) — Apollo cache `__bbox`
wrappers, structural keywords per surface, XHR-only stories endpoint.

| Phase | Status |
| ----- | ------ |
| 0. Monorepo bootstrap | ✅ |
| 1. Auth (Playwright persistent + cookie import) | 📋 planned |
| 2. Profile parser (`/{username}`) | 📋 planned |
| 3. Post parser (`/p/{shortcode}/`) | 📋 planned |
| 4. Reel parser (`/reel/{shortcode}/`) | 📋 planned |
| 5. Stories scraper (`/stories/{username}/`) | 📋 planned |
| 6. Photos / videos download | 📋 planned |
| 7. Storage adapters (FS / DB / S3) | 📋 planned |
| 8. CLI | 📋 planned |
| 9. atelier-web-travels integration | 📋 planned |

## Legal & ethics

⚠️ **Personal use only, your own data and what you legitimately follow.**

Instagram's [Terms of Use](https://help.instagram.com/581066165581870) and [Platform Terms](https://developers.facebook.com/terms/) prohibit:

- Automated scraping at scale
- Sharing scraped data with third parties
- Using scraped data for AI / ML training
- Aggregating other users' content

This tool is built for **archival of your own account** + **mirroring stories you follow** to your trip log. Anything beyond personal use risks account suspension. The maintainers do not endorse rate-limit-busting workflows.

## Architecture (mirror of strava-scraper)

```
instagram-scraper/
├── packages/
│   ├── core/              # Scraping logic, types, parsers
│   │   ├── src/auth/      # Playwright persistent context + cookie import
│   │   ├── src/http/      # Fetch wrapper, CSRF, rate limiting
│   │   ├── src/parse/     # HTML → typed JSON parsers
│   │   ├── src/api/       # Internal mobile API helper (limited)
│   │   ├── src/download/  # Photo / video / audio file downloads
│   │   └── src/types/     # Shared types
│   ├── cli/               # `instagram-scraper` CLI commands
│   └── storage-adapters/  # Pluggable: filesystem / MariaDB / S3
└── docs/                  # Architecture, rate limits, anti-bot strategy
```

## Why same patterns as strava-scraper

The strava-scraper project established:
- ✅ Bun + TS strict + Vitest + Biome → fast feedback loop
- ✅ Auth: Playwright persistent context survives 2FA + captchas
- ✅ React-component HTML parsing (Strava 2025+ migrated to React; Instagram has been React for years)
- ✅ Atomic FilesystemAdapter writes
- ✅ Locale-aware (FR + EN) parsing
- ✅ Synthetic fixtures only (never commit real-user HTML)

123 tests, validated end-to-end against real Strava. Same discipline applies here.

## Credits

- [`@ateliersam86/strava-scraper`](https://github.com/ateliersam86/strava-scraper) — sister project with shared infra patterns

## License

MIT — see [LICENSE](LICENSE)
