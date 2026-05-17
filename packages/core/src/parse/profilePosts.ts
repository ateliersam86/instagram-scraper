/**
 * Profile grid → recent shortcodes.
 *
 * Instagram profile pages embed the user's first ~12 posts (mix of posts
 * and reels) in the rendered HTML. The robust signal is `<a href="/p/X/">`
 * and `<a href="/reel/X/">` tags inside the grid section.
 *
 * For a more complete enumeration (scrolling), use the GraphQL endpoint
 * `xdt_api__v1__feed__user_timeline_graphql_connection` with a session
 * cookie + LSD token — out of scope for this v0.
 */

export type ProfilePostRef = {
  /** 11-character Instagram shortcode. */
  shortcode: string;
  /** Whether the URL pattern is `/p/` (post) or `/reel/`. */
  type: "post" | "reel";
};

const SHORTCODE_RE = /\/(p|reel)\/([A-Za-z0-9_-]{11})\/?/g;

export function parseProfilePostsFromHtml(html: string, limit = 12): ProfilePostRef[] {
  const seen = new Map<string, ProfilePostRef>();
  for (const match of html.matchAll(SHORTCODE_RE)) {
    const type = match[1] === "reel" ? "reel" : "post";
    const shortcode = match[2];
    // Le groupe 2 est garanti par la regex ; le garde satisfait
    // `noUncheckedIndexedAccess` (match[2] typé string | undefined).
    if (!shortcode) continue;
    if (!seen.has(shortcode)) {
      seen.set(shortcode, { shortcode, type });
      if (seen.size >= limit) break;
    }
  }
  return [...seen.values()];
}
