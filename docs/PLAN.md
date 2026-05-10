# Implementation plan — instagram-scraper

> Scrape **everything** Instagram renders for an authenticated session, with
> the same quality bar as `@ateliersam86/strava-scraper` (123 tests, validated
> end-to-end against real users). No shortcuts.

## Competitive landscape (May 2026 — recon completed)

| Project | Lang | Stars | Last push | Coverage | Verdict |
|---|---|---|---|---|---|
| [`instaloader/instaloader`](https://github.com/instaloader/instaloader) | Python | 12.3k | 2026-04 | Profile, posts, carousels, reels, stories, highlights, hashtags, saved, tagged | **Inspiration source** — port endpoint catalogue (MIT-licensed) |
| [`subzeroid/instagrapi`](https://github.com/subzeroid/instagrapi) | Python | 6.2k | 2026-05 | Quasi-all + DM + uploads | **Inspiration** for stories.py + challenge resolver |
| [`mikf/gallery-dl`](https://github.com/mikf/gallery-dl) | Python | 18.1k | 2026-05 | Posts, stories, reels, highlights | Cross-validation reference |
| `dilame/instagram-private-api` | **TS** | 6.4k | 2024-08 (**dead**) | Stories example, no highlights doc | **AVOID** — 21mo stale, v3 forked private/paid |

**Why build-from-scratch in TS, not port**: no maintained TypeScript
scraper covers stories + highlights as of May 2026. The Python references
are 15 years of `requests`+cookies edge-case scaffolding; our
Playwright-persistent-context angle eliminates ~80% of their signature/
header complexity. We map their endpoint catalogue into a typed
`src/endpoints.ts` and build the rest fresh.

**Anti-bot pattern that's emerged industry-wide**:
- Playwright + persistent context (real cookies, real localStorage, real
  fingerprint) → checkpoint-avoidance after the first manual login.
- `patchright` is a drop-in stealth replacement for Playwright that
  patches `navigator.webdriver` + headless UA + plugin shape. Consider
  if vanilla Playwright triggers checkpoints in practice.
- **XHR interception > HTML parsing** for stories. Instagram serves
  `/graphql/query` and `/api/v1/feed/reels_media/` as clean JSON — capture
  via `page.on("response")` instead of trying to recreate the URL.
- Human-like jitter: 1-3 s between requests (instagrapi), 8-15 s between
  profiles (instaloader).

**Legal (May 2026)**:
- hiQ v. LinkedIn settlement (2022) → CFAA doesn't cover scraping public
  data, but breach-of-contract claims under platform TOS remain actionable.
- Meta v. Bright Data (2024) → logged-in scraping is the dangerous one.
- Our scope = personal archive of own account + accounts we follow → TOS
  violation in theory, **ban-risk in practice, no individual-user
  jurisprudence**. Mitigations: rate-limit aggressively, never SaaS-ify,
  never redistribute scraped data.

## Scope

Two consumer profiles share the same auth model:

1. **Self** — Sam's own account. Full archive of own posts, reels, stories,
   tagged media, saved collections, highlights, and (eventually) DMs.
2. **Followed accounts** — public OR private (Sam follows them). Same
   pattern Strava's session uses for the reference account's data. Captures profile
   info, posts, reels, active stories, highlights.

**Out of scope** (deliberate):
- Mass scraping of unfollowed accounts (TOS violation, account-ban risk)
- DMs (too sensitive; deferred indefinitely)
- Buying/spamming/posting (read-only library)

## Surface inventory

Every Instagram URL type and the data we extract from it:

### `/{username}/` — Profile page
**Source**: `<meta property="og:*">` tags + `<script type="application/json">`
blob containing the React/Apollo bootstrap.

**Fields captured**:
- `username`, `id` (numeric), `fullName`, `biography`, `externalUrl`
- `avatarUrl` (HD), `category`, `pronouns`
- `followerCount`, `followingCount`, `postCount`, `reelCount`, `taggedCount`
- `isVerified`, `isPrivate`, `isBusinessAccount`, `businessCategory`
- `email`, `phoneNumber`, `address` (business accounts only)
- `recentPostShortcodes[]` (last 12 visible)
- `highlightsTrayIds[]` (links to highlights endpoint)
- `mutualFollowsPreview[]` (small preview of mutual follows)

**Auth requirement**: cookie required for full data on private accounts;
public accounts return everything publicly visible without auth.

### `/p/{shortcode}/` — Single post
**Source**: `<script type="application/json">` with
`xdt_api__v1__media__shortcode__web_info` field. Confirmed via real recon.

**Fields captured**:
- `shortcode`, `id`, `pk` (legacy id)
- `takenAt` (ISO 8601), `mediaType` (1=photo, 2=video, 8=carousel)
- `caption` (with hashtags + mentions parsed out)
- `likeCount`, `commentsCount`
- `imageVersions[]` — multiple resolution candidates (we pick highest)
- `videoVersions[]` (when video) — HD MP4 + thumbnail
- `coauthorProducers[]` (collabs)
- `accessibilityCaption` (Instagram's auto-alt text)
- `location` (id + name + slug + coords when present)
- `taggedUsers[]` (people tagged in the photo)
- `usersInPhoto[]` (with x,y coordinates on the image)
- `commentsDisabled`, `likeAndViewCountsDisabled`
- `audio` (track + artist + cover) for reels
- `effects[]` (AR filter info for reels)
- `viewCount` (reels only)
- `playCount` (reels only)
- `firstPageComments[]` (paginated by IG; we capture page 1 + cursor)

**Carousel**: post.media is an array — each carousel item has its own
imageVersions/videoVersions.

### `/reel/{shortcode}/` — Reel (video post)
Same fields as `/p/`, with `isReel: true` and reel-specific fields:
audio source, play count, video duration, thumbnail.

### `/stories/{username}/` — Active stories ring
**Source**: GraphQL endpoint loaded after page-render. The HTML alone is
insufficient — we need to capture an XHR call OR use Playwright's
`waitForResponse` to grab the JSON.

**Fields captured per story item**:
- `id`, `takenAt`, `expiresAt` (taken + 24h)
- `mediaType`, HD `imageUrl` and `videoUrl` (if video)
- `durationSeconds`
- `mentions[]`, `hashtags[]`, `links[]` (from stickers)
- `music` (track + artist + clip start/end timestamp)
- `polls[]` — question + options + counts (visible to followers)
- `questions[]` — Q&A stickers
- `quizzes[]` — quiz stickers + answers
- `sliders[]` — emoji sliders
- `countdowns[]`
- `productTags[]` (shopping)
- `mentionsOverlay[]` — usernames tagged with positioning
- `viewerCount` (own stories only — privacy)

**Auth**: required. Stories of private accounts require follow-status.

### `/stories/highlights/{id}/` — Highlight album
Same shape as stories ring + a stable id (highlights don't expire).

### `/explore/tags/{tag}/` — Hashtag page
- `tagName`, `mediaCount`
- `topPosts[]` (9 most-engaged), `recentPosts[]` (paginated)
- Sub-fields: shortcode, owner username, like/comment counts, media URL

### `/explore/locations/{id}/{slug}/` — Location page
- `id`, `name`, `slug`, `coords{lat,lng}`
- `topPosts[]`, `recentPosts[]`

### `/{username}/saved/{collection}/` — Saved collections (self only)
- Collection name, id, postCount, postShortcodes[]

### `/{username}/tagged/` — Tagged media (where user is tagged in others' posts)
- postShortcodes[], paginated

## Architecture (mirror of strava-scraper)

```
packages/
├── core/
│   ├── auth/             ✓ Phase 1 (CookieImport + PersistentContext)
│   ├── http/             Phase 2 — fetch wrapper, jitter, captcha detection
│   ├── parse/            Phases 3–6 — one parser per surface
│   │   ├── apolloCache.ts         shared __bbox extractor
│   │   ├── profile.ts             /{username}/
│   │   ├── post.ts                /p/{shortcode}/
│   │   ├── reel.ts                /reel/{shortcode}/
│   │   ├── stories.ts             /stories/{username}/  (XHR-driven)
│   │   ├── highlight.ts           /stories/highlights/{id}/
│   │   ├── hashtag.ts             /explore/tags/{tag}/
│   │   └── location.ts            /explore/locations/{id}/
│   ├── api/              Phase 7 — internal mobile API (fallback for stories)
│   ├── download/         Phase 8 — photo + video + audio streamers
│   └── types/            ✓ Phase 1 base types extended per phase
├── cli/                  Phase 10 — commander wrappers
└── storage-adapters/     Phase 11 — FS atomic writes (mirror strava-scraper)
```

## Phase plan — 12 shippable phases

| # | Phase | Outcome | Tests | Quality gate |
| - | ----- | ------- | ----- | ------------ |
| 0 | Bootstrap | ✓ Repo, monorepo, CI, Phase 1 auth | 5 | Pushed to GH |
| 1 | Auth | ✓ CookieImport + PersistentContext | 5 | Already shipped |
| 2 | HTTP client | Fetch wrapper, per-request jitter, captcha/checkpoint detection, rate-limit headers | +6 | Live test against strava.com (rate-limit headers parsed) |
| 3 | Apollo cache extractor | Shared `extractApolloCache(html)` — finds the `__bbox` payload, parses through escaped-string layers | +5 | Validated against real Sam profile + post HTML |
| 4 | Profile parser | `parseProfileHtml(html, username)` returns full `InstagramProfile` | +8 | Validated against Sam (own) + a public account + a followed-private account |
| 5 | Post parser | `parsePostHtml(html, shortcode)` — handles photo, video, carousel | +10 | Validated against Sam's own + carousel + reel |
| 6 | Reel parser | `parseReelHtml` (delegates to post parser + reel-specific fields) | +5 | Validated against a real reel with audio sticker |
| 7 | Stories scraper | Playwright-driven (intercepts XHR), returns full `InstagramStoryItem[]` | +6 | Validated against Sam's own stories + a followed account's stories |
| 8 | Media downloader | `downloadPhoto`, `downloadVideo`, `downloadAudio` — streaming | +5 | Round-trip test (download + size match expected) |
| 9 | Highlight + hashtag + location parsers | One file each, same Apollo extractor | +6 | Validated against real pages |
| 10 | CLI | `auth login/status`, `profile`, `post`, `reel`, `stories`, `highlights`, `sync` | +0 (smoke) | Manually tested every command against real account |
| 11 | FilesystemAdapter | Layout: `out/profiles/{username}/`, `out/posts/{shortcode}/`, etc. atomic writes | +6 | Round-trip test write + read |
| 12 | atelier-web-travels integration | `enrichTripDayFromInstagramStories(stories)` → trip-day journal blocks | +5 | Validated against `example-trip` cache |

**Total**: ~85 tests planned. Mirror of strava-scraper's 123-test bar
adjusted to Instagram's narrower schema variation.

## Anti-bot strategy

Instagram is more aggressive than Strava. Our defaults:

1. **Always Playwright real-browser fingerprint** when scraping authenticated
   surfaces (stories, private profiles). Avoid `fetch` with cookies —
   Instagram detects header anomalies.
2. **Per-request jitter**: 1-3 seconds between page loads, exponential
   backoff on 429.
3. **Per-day cap**: configurable, default **50 requests / 24h** per session
   (well under the threshold that triggers checkpoints).
4. **Surface checkpoint errors clearly**: parse `/challenge/` and
   `/checkpoint/` redirects, throw `CheckpointRequiredError` so the user
   stops and reauthenticates manually. Never automate captcha-solving.
5. **No multi-account**: one session per machine. Never round-robin.
6. **Document the sustainable workflow**: README explains "scrape your
   stories ring once a day, mirror posts as they're created — not bulk
   backfills".

## Validation strategy

For each parser phase, we capture real HTML from Sam's logged-in browse
session, save it to `scripts/_validation/` (gitignored), and:

1. Run the parser against the HTML
2. Compare extracted fields against the visible UI values
3. Add field-level tests using SYNTHETIC fixtures (same shape, anonymized)
4. Commit only the synthetic fixtures + test code

Real HTML never enters the public repo. This matches the strava-scraper
discipline.

## CLI surface (Phase 10)

```bash
# Auth
instagram-scraper auth login                  # Playwright headed
instagram-scraper auth status                 # validate session

# Self
instagram-scraper profile                     # own profile (no arg = self)
instagram-scraper sync                        # backup own posts + stories + highlights

# Specific account
instagram-scraper profile <username>
instagram-scraper post <shortcode>
instagram-scraper reel <shortcode>
instagram-scraper stories <username>          # active 24h ring
instagram-scraper highlights <username>       # all permanent collections
instagram-scraper highlight <id>              # one collection by id

# Discovery
instagram-scraper hashtag <tag>
instagram-scraper location <id>

# Bulk
instagram-scraper sync <username> --posts --stories --highlights --since 2025-01-01
```

## Atelier-web-travels integration (Phase 12)

The "Phase 4.3c — Scraper Stories 24h" task in atelier-web-travels has been
pending since 2024. This unblocks it:

1. Scheduled cron (e.g., every 6h) calls
   `instagram-scraper stories <username>` for each followed athlete in
   `example-trip`.
2. New `scripts/enrich-instagram-stories.mjs` mirrors the existing
   `enrich-strava-streams.mjs` — fetches stories, maps each story item to
   a trip-day journal block (timestamped video/photo + caption).
3. `StoryJournalV2` already has an `IgStoriesBlock` widget (see
   `components/travel/storyLayoutV2/IgStoriesBlock.tsx`) — we just feed it
   real data instead of the existing `yt-dlp`-only path that doesn't cover
   stories.

## Timeline

This is a multi-session project. Each phase is one focused session.
Prioritization order (subject to user input):

1. **Phase 4 — Profile parser** (next) — biggest value: enables everything
2. **Phase 5 — Post parser** — second-biggest, completes the `/p/` URL flow
3. **Phase 7 — Stories scraper** — the marquee feature for atelier-web-travels
4. **Phase 11 — FilesystemAdapter + Phase 10 CLI** — lets the user actually use it
5. **Phases 6, 8, 9, 12** — fill out coverage in any order

Phases 2 + 3 (HTTP + Apollo) are foundational and ship before/alongside
Phase 4.

## Honest acknowledgments

- **Instagram changes** field names occasionally. Like Strava 2025+ broke
  parsers based on `__INITIAL_STATE__`, IG could break our Apollo-cache
  approach. We mitigate with: real-HTML-validated fixtures, lenient parsers
  that skip unknown fields, defensive null-handling everywhere.
- **Stories require Playwright** (we couldn't grab them via plain
  `fetch` in the recon — they load lazily via XHR). This adds dependency
  weight and slows down the Stories phase.
- **No npm publish until Phase 12** — same path as strava-scraper. Install
  via `bun add github:ateliersam86/instagram-scraper#v0.1.0`.
