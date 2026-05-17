/**
 * Highlights-tray parser.
 *
 * The tray — the row of permanent "Story Highlights" albums under a
 * profile bio — is NOT in the profile SSR HTML. Instagram loads it via
 * a GraphQL XHR (`PolarisProfileStoryHighlightsTrayContentQuery` against
 * `/graphql/query`, verified 2026-05 live recon). Capture that response
 * with {@link HttpClient.captureXhr}, then parse it here.
 *
 * Response shape:
 *   { data: { highlights: { edges: [ { node: {
 *       id: "highlight:18362962996224276", title: "Italia",
 *       cover_media: { cropped_image_version: { url } },
 *       user: { username, id }, __typename: "XDTReelDict"
 *   } } ] } } }
 *
 * Pair with {@link scrapeHighlightById} to pull each album's items.
 */

export interface HighlightAlbum {
  /** Numeric id, ready to drop into `/stories/highlights/{id}/`. */
  id: string;
  /** Raw id as Instagram returns it, e.g. "highlight:18362962996224276". */
  rawId: string;
  /** Album title shown under the cover bubble. */
  title: string;
  /** Cover thumbnail URL, when present. */
  coverUrl?: string;
}

interface TrayNode {
  id?: string;
  title?: string;
  cover_media?: { cropped_image_version?: { url?: string } };
}

interface TrayResponse {
  data?: { highlights?: { edges?: ReadonlyArray<{ node?: TrayNode }> } };
}

export function parseHighlightsTray(payload: TrayResponse | null | undefined): HighlightAlbum[] {
  const edges = payload?.data?.highlights?.edges;
  if (!Array.isArray(edges)) return [];

  const albums: HighlightAlbum[] = [];
  for (const edge of edges) {
    const node = edge?.node;
    const rawId = node?.id;
    if (typeof rawId !== "string" || rawId.length === 0) continue;
    albums.push({
      id: rawId.replace(/^highlight:/, ""),
      rawId,
      title: typeof node?.title === "string" ? node.title : "",
      coverUrl: node?.cover_media?.cropped_image_version?.url,
    });
  }
  return albums;
}
