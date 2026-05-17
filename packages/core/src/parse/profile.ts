/**
 * Profile parser.
 *
 * Instagram's profile pages don't reliably embed the user payload in an
 * Apollo cache blob (recon 2026-05-10 found username + bio fragments
 * scattered across React components but no clean `xdt_api__v1__user_by_username`).
 * The most stable signal is the og:* meta block, which carries enough to
 * populate the basic profile card.
 *
 * For richer data (bio, external URL, verified/private flags), the caller
 * should follow up with the `/api/v1/users/web_profile_info/?username=X`
 * XHR — that's what the Instagram web client itself uses.
 */

import type { InstagramProfile } from "../types/profile.ts";

const META_RE = /<meta\s+property="og:(title|description|image|url)"\s+content="([^"]*)"/gi;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/**
 * Locale-aware regexes for the "N followers, M following, K posts" segment
 * in og:description. Instagram localizes both the labels and the digit
 * grouping (FR: "1 234", EN: "1,234"). The number group is permissive on
 * separators and we strip them in {@link parseCount}.
 *
 * Order matters: we try each in turn and take the first that matches all
 * three counts.
 */
const COUNT_PATTERNS: Array<{
  followers: RegExp;
  following: RegExp;
  posts: RegExp;
}> = [
  {
    followers: /([\d.,\s]+)\s+followers?/i,
    following: /([\d.,\s]+)\s+(?:following|suivis|seguidos?|seguendo|abbonati|folgt)/i,
    posts:
      /([\d.,\s]+)\s+(?:posts?|publications?|publicaciones|pubblicazioni|post|beiträge|gönderi)/i,
  },
];

export function parseProfileFromHtml(
  html: string,
  fallbackUsername?: string,
): InstagramProfile | null {
  const meta = readOgMeta(html);
  const usernameFromTitle = extractUsernameFromTitle(meta.title);
  const username = usernameFromTitle ?? fallbackUsername;
  if (!username) return null;

  const counts = parseCountsFromDescription(meta.description);
  const fullName = extractFullNameFromTitle(meta.title);

  return {
    username,
    ...(fullName !== undefined ? { fullName } : {}),
    ...(meta.image !== undefined ? { avatarUrl: meta.image } : {}),
    ...(counts.followers !== undefined ? { followerCount: counts.followers } : {}),
    ...(counts.following !== undefined ? { followingCount: counts.following } : {}),
    ...(counts.posts !== undefined ? { postCount: counts.posts } : {}),
  };
}

function readOgMeta(html: string): {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
} {
  const out: Record<string, string> = {};
  META_RE.lastIndex = 0;
  let m: RegExpExecArray | null = META_RE.exec(html);
  while (m !== null) {
    const key = m[1]?.toLowerCase();
    const value = m[2];
    if (key && value && !(key in out)) {
      out[key] = decodeHtmlEntities(value);
    }
    m = META_RE.exec(html);
  }
  return out;
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(amp|quot|#39|lt|gt);/g, (entity) => {
    return HTML_ENTITIES[entity] ?? entity;
  });
}

/**
 * Extracts "example_user" from titles like:
 *   "Example User (@example_user) • Photos et vidéos Instagram"
 *   "Some Name (@handle) on Instagram: ..."
 */
function extractUsernameFromTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const m = title.match(/\(@([A-Za-z0-9._]+)\)/);
  return m?.[1];
}

function extractFullNameFromTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const idx = title.indexOf("(@");
  if (idx <= 0) return undefined;
  const name = title.slice(0, idx).trim();
  return name.length > 0 ? name : undefined;
}

function parseCountsFromDescription(desc: string | undefined): {
  followers?: number;
  following?: number;
  posts?: number;
} {
  if (!desc) return {};
  for (const pat of COUNT_PATTERNS) {
    const f = desc.match(pat.followers);
    const g = desc.match(pat.following);
    const p = desc.match(pat.posts);
    if (f && g && p) {
      return {
        followers: parseCount(f[1] as string),
        following: parseCount(g[1] as string),
        posts: parseCount(p[1] as string),
      };
    }
  }
  return {};
}

/**
 * Strips locale-specific thousands separators (space, dot, comma) and
 * returns an integer. "1 234" / "1,234" / "1.234" all → 1234.
 *
 * Locale ambiguity caveat: in EN "1,234" is a thousands separator while
 * in FR "1,5" would be a decimal. Counts on Instagram are always whole
 * numbers, so we can safely strip every separator here without the
 * disambiguation logic the Strava parser needs.
 */
function parseCount(raw: string): number | undefined {
  const cleaned = raw.replace(/[\s., ]/g, "");
  if (!/^\d+$/.test(cleaned)) return undefined;
  return Number.parseInt(cleaned, 10);
}
