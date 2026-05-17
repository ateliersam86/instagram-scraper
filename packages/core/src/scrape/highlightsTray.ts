/**
 * High-level: discover a profile's permanent Highlights albums.
 *
 * The tray loads via a GraphQL XHR after the profile page renders — it
 * is not in the SSR HTML (see {@link parseHighlightsTray}). We navigate
 * the profile and intercept the `PolarisProfileStoryHighlightsTrayContentQuery`
 * response, matched on the GraphQL friendly name in the request body
 * (every query shares the `/graphql/query` URL).
 *
 * Pair with {@link scrapeHighlightById} to pull each album's items —
 * unlike the 24h ring, highlight items never expire and keep their real
 * `takenAt`, which makes them the canonical source for back-dating an
 * archive.
 */

import type { HttpClient } from "../http/client.ts";
import { type HighlightAlbum, parseHighlightsTray } from "../parse/highlightsTray.ts";

const TRAY_FRIENDLY_NAME = "PolarisProfileStoryHighlightsTrayContentQuery";

export async function scrapeHighlightsTray(
  http: HttpClient,
  username: string,
): Promise<HighlightAlbum[]> {
  const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;
  const captured = await http.captureXhr<Parameters<typeof parseHighlightsTray>[0]>(
    url,
    "/graphql/query",
    TRAY_FRIENDLY_NAME,
  );
  return parseHighlightsTray(captured.body);
}
