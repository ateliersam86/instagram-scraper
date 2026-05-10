/**
 * High-level: scrape the 24h stories ring of a username.
 *
 * Composes {@link HttpClient.captureXhr} with the stories XHR pattern and
 * delegates to the parser. Caller owns the HttpClient lifecycle (init +
 * dispose) so multiple scrapes can share an authenticated context.
 */

import type { HttpClient } from "../http/client.ts";
import { parseStoriesFromReelsResponse } from "../parse/stories.ts";
import type { InstagramStoryItem } from "../types/post.ts";

const STORIES_XHR_PATTERN = /\/api\/v1\/feed\/reels_media\//;

export async function scrapeStoriesForUser(
  http: HttpClient,
  username: string,
): Promise<InstagramStoryItem[]> {
  const url = `https://www.instagram.com/stories/${encodeURIComponent(username)}/`;
  const captured = await http.captureXhr<unknown>(url, STORIES_XHR_PATTERN);
  return parseStoriesFromReelsResponse(
    captured.body as Parameters<typeof parseStoriesFromReelsResponse>[0],
  );
}
