/**
 * High-level: scrape the 24h stories ring of a username.
 *
 * Instagram embeds the `reels_media` payload directly inside the HTML on
 * `/stories/{username}/` pages (verified 2026-05-11 live recon), under
 * the Apollo cache field `xdt_api__v1__feed__reels_media`. We fetch the
 * HTML, walk the bbox, parse.
 *
 * Historical note: earlier reconnaissance assumed stories were XHR-only
 * (via `/api/v1/feed/reels_media/`). Instagram migrated the payload into
 * the SSR HTML, so a plain `fetchHtml` is now enough — no Playwright
 * page interaction required. {@link HttpClient} still uses Playwright
 * under the hood for the cookies and fingerprint, but we don't have to
 * intercept anything.
 *
 * If a future migration pushes stories back to XHR-only, fall back to
 * {@link HttpClient.captureXhr} with the appropriate pattern.
 */

import type { HttpClient } from "../http/client.ts";
import { extractApolloCache } from "../parse/apolloCache.ts";
import { parseStoriesFromReelsResponse } from "../parse/stories.ts";
import type { InstagramStoryItem } from "../types/post.ts";

const STORIES_APOLLO_FIELD = "xdt_api__v1__feed__reels_media";

export async function scrapeStoriesForUser(
  http: HttpClient,
  username: string,
): Promise<InstagramStoryItem[]> {
  const url = `https://www.instagram.com/stories/${encodeURIComponent(username)}/`;
  const html = await http.fetchHtml(url);
  const payload = extractApolloCache<Parameters<typeof parseStoriesFromReelsResponse>[0]>(
    html,
    STORIES_APOLLO_FIELD,
  );
  if (!payload) return [];
  return parseStoriesFromReelsResponse(payload);
}
