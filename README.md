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

🟢 **Alpha — 49 tests green, validated against real Instagram HTML (May 2026 recon)**

**Detailed plan**: [`docs/PLAN.md`](docs/PLAN.md) covers the 12-phase
roadmap, competitive landscape (instaloader / instagrapi / gallery-dl),
anti-bot strategy, and per-phase quality gates.

**Surface research**: [`docs/SURFACES.md`](docs/SURFACES.md) documents the
real Instagram HTML structure (May 2026 recon) — Apollo cache `__bbox`
wrappers, structural keywords per surface, XHR-only stories endpoint.

| Phase | Status |
| ----- | ------ |
| 0. Monorepo bootstrap | ✅ |
| 1. Auth (Playwright persistent + cookie import) | ✅ |
| 2. HTTP client + jitter + checkpoint detection | ✅ |
| 3. Apollo cache extractor | ✅ |
| 4. Profile parser (`/{username}`) | ✅ |
| 5. Post parser (`/p/{shortcode}/` + `/reel/`) | ✅ |
| 6. Stories scraper (XHR-captured `reels_media`) | ✅ |
| 7. CLI (`auth`, `profile`, `post`, `stories`) | ✅ |
| 8. Highlight + hashtag + location parsers | 📋 |
| 9. Media downloader (photo + video) | 📋 |
| 10. FilesystemAdapter (atomic writes) | 📋 |
| 11. atelier-web-travels integration | 📋 |

## Quick start

```bash
# install (no npm publish yet — installs straight from GitHub)
bun add github:ateliersam86/instagram-scraper#main

# or clone for development
git clone https://github.com/ateliersam86/instagram-scraper.git
cd instagram-scraper && bun install
bun run test           # 49 tests
bun run typecheck
```

## CLI

```bash
# One-time: open a real Chromium, log in (handles 2FA), save the session
bunx instagram-scraper auth login

# Verify the session still works
bunx instagram-scraper auth status

# Scrape a profile (og:* meta — works for public + followed-private accounts)
bunx instagram-scraper profile example_user

# Scrape a single post or reel by shortcode
bunx instagram-scraper post DYKbk_gCFm6

# Scrape the 24h stories ring (Playwright captures the reels_media XHR)
bunx instagram-scraper stories example_user
```

All commands support `-o <path>` to write JSON to disk instead of stdout.
The session lives in `~/.config/instagram-scraper/storage-state.json`
(override with `IG_STATE=/some/path`).

## Programmatic API

```ts
import {
  HttpClient,
  parseProfileFromHtml,
  parsePostFromHtml,
  scrapeStoriesForUser,
} from "@atelier/instagram-scraper-core";

const http = new HttpClient();
await http.initWithStorageState("/path/to/storage-state.json");

const html = await http.fetchHtml("https://www.instagram.com/example_user/");
const profile = parseProfileFromHtml(html);
// → { username, fullName, avatarUrl, followerCount, followingCount, postCount }

const postHtml = await http.fetchHtml("https://www.instagram.com/p/DYKbk_gCFm6/");
const post = parsePostFromHtml(postHtml);
// → { shortcode, authorUsername, caption, likeCount, media[], hashtags, mentions }

const stories = await scrapeStoriesForUser(http, "example_user");
// → InstagramStoryItem[] with HD imageUrl/videoUrl, mentions, hashtags, music sticker

await http.dispose();
```

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
