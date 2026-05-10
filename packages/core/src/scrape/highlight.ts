/**
 * High-level: scrape a permanent Highlights album by id.
 *
 * URL: `https://www.instagram.com/stories/highlights/{id}/`. Same SSR
 * embed shape as the 24h ring — the `reels_media` payload is in the
 * HTML under `xdt_api__v1__feed__reels_media`. We reuse the stories
 * parser; the only difference is that the items don't expire.
 */

import type { HttpClient } from "../http/client.ts";
import { extractApolloCache } from "../parse/apolloCache.ts";
import { parseStoriesFromReelsResponse } from "../parse/stories.ts";
import type { InstagramStoryItem } from "../types/post.ts";

const FIELD = "xdt_api__v1__feed__reels_media";

export async function scrapeHighlightById(
  http: HttpClient,
  highlightId: string,
): Promise<InstagramStoryItem[]> {
  const url = `https://www.instagram.com/stories/highlights/${encodeURIComponent(highlightId)}/`;
  const html = await http.fetchHtml(url);
  const payload = extractApolloCache<Parameters<typeof parseStoriesFromReelsResponse>[0]>(
    html,
    FIELD,
  );
  if (!payload) return [];
  return parseStoriesFromReelsResponse(payload);
}
