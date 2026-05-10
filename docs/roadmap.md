# Roadmap

## Phase 0: Bootstrap monorepo ✅
- [x] Bun workspaces, packages/{core,cli,storage-adapters}
- [x] TypeScript strict + Vitest + Biome
- [x] CI GitHub Actions (lint + typecheck + test on Ubuntu/macOS)
- [x] README, LICENSE (MIT), .gitignore, docs/

## Phase 1: Auth — Playwright persistent context + cookie import
- [ ] `AuthStrategy` interface (mirror strava-scraper)
- [ ] `CookieImportAuth`: reads `sessionid` + `csrftoken` + `ds_user_id` from a JSON file or env vars
- [ ] `PersistentContextAuth`: Playwright headed-on-first-run, saves storage state under `.auth/instagram-storage-state.json`
  - First run: opens visible Chromium, user does login + 2FA + dismiss "save login info" prompts
  - Subsequent runs: headless, reuses storage state
- [ ] Session validation: GET `/accounts/edit/` and check for redirect to `/accounts/login/`

## Phase 2: Profile parser — `/{username}`
- [ ] Extract athlete-style metadata: full name, username, bio, follower count, following count, post count, avatar URL, is verified, is private
- [ ] Extract recent posts grid (12 most-recent thumbnails with shortcodes, like counts, video flag)
- [ ] Extract recent reels and tagged posts when visible
- [ ] Handle private accounts gracefully (return what's available)

## Phase 3: Post parser — `/p/{shortcode}/`
- [ ] Caption (with emojis, hashtags, @mentions preserved)
- [ ] Author info (username, full name, avatar)
- [ ] Like count, comments count
- [ ] Photo URLs (HD) — handle carousels (multiple photos in one post)
- [ ] Video URL when applicable
- [ ] Location (name + Instagram location ID) when present
- [ ] Posted timestamp
- [ ] Hashtags + @mentions (extracted from caption)
- [ ] First-page comments (paginated by Instagram)

## Phase 4: Reel parser — `/reel/{shortcode}/`
- [ ] Same as post + audio info (track name + artist when sourced from a public clip)
- [ ] Video URL (HD)
- [ ] Play count when visible

## Phase 5: Stories scraper — `/stories/{username}/`
- [ ] Most ambitious: stories expire 24h, require auth + follow status
- [ ] List ALL active stories for an account (no cursor pagination — single fetch covers full ring)
- [ ] Per story: photo or video URL (HD), timestamp, mentions, hashtags, music, polls, questions
- [ ] Highlights (`/stories/highlights/{id}/`) for permanent collections
- [ ] Resolves the `atelier-web-travels` "Phase 4.3c — Scraper Stories 24h" task

## Phase 6: Media download
- [ ] Stream photo + video to disk via the download module
- [ ] Manifest JSON with all metadata for each media item
- [ ] Idempotent: skip if already downloaded (matched by shortcode)

## Phase 7: Storage adapters
- [ ] `StorageAdapter` interface
- [ ] `FilesystemAdapter`: `out/profiles/{username}/profile.json`, `out/posts/{shortcode}/{post.json,media/}`, `out/stories/{username}/{date}/`
- [ ] (deferred) `MariaDBAdapter`, `S3Adapter`

## Phase 8: CLI
- [ ] `instagram-scraper auth login` (Playwright headed)
- [ ] `instagram-scraper profile <username>`
- [ ] `instagram-scraper post <shortcode>`
- [ ] `instagram-scraper stories <username>` (24h archive)
- [ ] `instagram-scraper sync <username> --days 30` (batch download all posts within window)

## Phase 9: atelier-web-travels integration
- [ ] Story → trip-day journal block (timed media)
- [ ] Mirror Paul / followed athletes' stories alongside their Strava activities
- [ ] Trip cache enrichment script `enrich-instagram-stories.mjs` (mirror of `enrich-strava-streams.mjs`)

## Anti-bot strategy

Instagram is more aggressive than Strava:
- Rate limits per IP and per account
- Captcha walls when behavior looks scripted
- Account checkpoints if too many requests in a short window

Mitigations:
- Always use Playwright persistent context (real Chromium, real cookies, real fingerprint)
- Per-request jitter (1-3 seconds between page loads)
- Default to no batch mode beyond what a human user would do (~50 requests/day)
- Surface 401 / 403 / "checkpoint required" errors clearly so the user can stop and reauthenticate manually
