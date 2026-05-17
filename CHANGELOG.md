# Changelog

All notable changes to `instagram-scraper`. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are shared
across the monorepo packages.

## 0.2.0 — 2026-05-17

### Added
- **Highlights-tray discovery** — `scrapeHighlightsTray(http, username)`
  lists every permanent Highlights album of a profile. The tray is not
  in the profile SSR; it loads via the
  `PolarisProfileStoryHighlightsTrayContentQuery` GraphQL XHR, which the
  scraper intercepts.
- CLI `highlights <username>` — discovers and scrapes all of a profile's
  highlight albums in a single pass.
- `HttpClient.captureXhr` accepts an optional `requestPattern` that
  matches the request body — required to disambiguate the shared
  `/graphql/query` endpoint by GraphQL friendly name.

### Fixed
- `scrapeHighlightById` returned nothing: Instagram renamed the album
  SSR field to `xdt_api__v1__feed__reels_media__connection` (a GraphQL
  connection). The stories parser now reads both the connection
  (`edges[].node`) shape and the legacy field.
- `captureXhr` navigates with `domcontentloaded` instead of
  `networkidle`, which never settles on Instagram and caused spurious
  navigation timeouts.

## 0.1.0

Initial monorepo: Playwright auth (persistent context + cookie import),
HTTP client with jitter and checkpoint detection, Apollo-cache extractor,
parsers (profile / post / reel / stories / highlight / hashtag /
location), media downloader with atomic writes, the `instagram-scraper`
CLI, and the FilesystemAdapter storage tree.
