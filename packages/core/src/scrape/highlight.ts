/**
 * High-level: scrape a permanent Highlights album by id.
 *
 * URL: `https://www.instagram.com/stories/highlights/{id}/`. The reel is
 * embedded in the SSR Apollo cache under
 * `xdt_api__v1__feed__reels_media__connection` — a GraphQL connection
 * `{ edges: [{ node }] }` (verified 2026-05 live recon; the field was
 * previously the un-suffixed `xdt_api__v1__feed__reels_media`, kept as
 * a fallback). We reuse the stories parser, which handles both shapes.
 * Unlike the 24h ring, highlight items don't expire and keep their real
 * `takenAt` — the canonical source for back-dating an archive.
 */

import type { HttpClient } from "../http/client.ts";
import { extractApolloCache } from "../parse/apolloCache.ts";
import { parseStoriesFromReelsResponse } from "../parse/stories.ts";
import type { InstagramStoryItem } from "../types/post.ts";

const FIELDS = [
  "xdt_api__v1__feed__reels_media__connection",
  "xdt_api__v1__feed__reels_media",
] as const;

export async function scrapeHighlightById(
  http: HttpClient,
  highlightId: string,
): Promise<InstagramStoryItem[]> {
  const url = `https://www.instagram.com/stories/highlights/${encodeURIComponent(highlightId)}/`;
  const html = await http.fetchHtml(url);
  for (const field of FIELDS) {
    const payload = extractApolloCache<Parameters<typeof parseStoriesFromReelsResponse>[0]>(
      html,
      field,
    );
    if (payload) return parseStoriesFromReelsResponse(payload);
  }
  return [];
}
