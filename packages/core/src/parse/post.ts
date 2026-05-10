/**
 * Post parser.
 *
 * Reads `xdt_api__v1__media__shortcode__web_info` (extracted via the Apollo
 * cache walker) and maps it to {@link InstagramPost}. Handles single photos,
 * single videos, and carousels — same shape served by /p/ and /reel/.
 *
 * Real-shape recon (2026-05-10) confirmed the relevant top-level keys:
 *   code, id, pk, caption, user, like_count, comment_count, taken_at,
 *   media_type (1=photo, 2=video, 8=carousel), image_versions2.candidates,
 *   video_versions, carousel_media[], coauthor_producers, location,
 *   accessibility_caption.
 *
 * Field-set is permissive: missing fields are simply omitted from the
 * returned `InstagramPost`. We never throw on unexpected payload shape —
 * Instagram occasionally adds/removes fields, and a soft parse is preferable
 * to a hard crash on a refactor.
 */

import type { InstagramLocation, InstagramPost, InstagramPostMedia } from "../types/post.ts";
import { extractApolloCache } from "./apolloCache.ts";

const POST_FIELD = "xdt_api__v1__media__shortcode__web_info";

const MEDIA_TYPE = {
  PHOTO: 1,
  VIDEO: 2,
  CAROUSEL: 8,
} as const;

interface WebInfo {
  items?: ReadonlyArray<WebInfoItem>;
}

interface WebInfoItem {
  code?: string;
  pk?: string;
  id?: string;
  taken_at?: number;
  media_type?: number;
  product_type?: string;
  caption?: { text?: string } | null;
  user?: {
    pk?: string;
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
  };
  like_count?: number;
  comment_count?: number;
  image_versions2?: { candidates?: ReadonlyArray<MediaCandidate> };
  video_versions?: ReadonlyArray<VideoCandidate>;
  video_duration?: number;
  original_width?: number;
  original_height?: number;
  carousel_media?: ReadonlyArray<WebInfoItem>;
  location?: LocationRaw | null;
  accessibility_caption?: string | null;
}

interface MediaCandidate {
  url?: string;
  width?: number;
  height?: number;
}

interface VideoCandidate {
  url?: string;
  width?: number;
  height?: number;
  type?: number;
}

interface LocationRaw {
  pk?: string;
  id?: string;
  name?: string;
  slug?: string;
  short_name?: string;
}

/**
 * Parses an `/p/{shortcode}/` or `/reel/{shortcode}/` HTML page.
 * Returns null when no web_info payload is found.
 */
export function parsePostFromHtml(html: string, shortcodeHint?: string): InstagramPost | null {
  const webInfo = extractApolloCache<WebInfo>(html, POST_FIELD);
  if (!webInfo) return null;
  const item = webInfo.items?.[0];
  if (!item) return null;
  return mapItemToPost(item, shortcodeHint);
}

/**
 * Lower-level: map a parsed web_info item directly (useful when the caller
 * already has the JSON, e.g. from an intercepted XHR).
 */
export function postFromWebInfoItem(item: WebInfoItem, shortcodeHint?: string): InstagramPost {
  return mapItemToPost(item, shortcodeHint);
}

function mapItemToPost(item: WebInfoItem, shortcodeHint: string | undefined): InstagramPost {
  const shortcode = item.code ?? shortcodeHint ?? "";
  const captionText = item.caption?.text;
  const media = collectMedia(item);
  const isVideo = item.media_type === MEDIA_TYPE.VIDEO;
  const isReel =
    isVideo && typeof item.product_type === "string" && item.product_type.toLowerCase() === "clips";

  const post: InstagramPost = { shortcode, media };

  if (item.id) post.id = item.id;
  if (item.user?.username) post.authorUsername = item.user.username;
  if (item.user?.pk) post.authorId = item.user.pk;
  if (item.user?.full_name) post.authorFullName = item.user.full_name;
  if (item.user?.profile_pic_url) post.authorAvatarUrl = item.user.profile_pic_url;
  if (captionText) post.caption = captionText;
  if (typeof item.taken_at === "number") {
    post.takenAt = new Date(item.taken_at * 1000).toISOString();
  }
  if (typeof item.like_count === "number") post.likeCount = item.like_count;
  if (typeof item.comment_count === "number") post.commentsCount = item.comment_count;
  if (isVideo) post.isVideo = true;
  if (isReel) post.isReel = true;
  if (captionText) {
    const hashtags = extractHashtags(captionText);
    const mentions = extractMentions(captionText);
    if (hashtags.length > 0) post.hashtags = hashtags;
    if (mentions.length > 0) post.mentions = mentions;
  }
  const location = mapLocation(item.location);
  if (location) post.location = location;

  return post;
}

function collectMedia(item: WebInfoItem): InstagramPostMedia[] {
  // Carousel: each child is a full WebInfoItem with its own image/video versions.
  if (item.media_type === MEDIA_TYPE.CAROUSEL && item.carousel_media?.length) {
    return item.carousel_media
      .map((child) => mediaFromItem(child))
      .filter((m): m is InstagramPostMedia => m !== null);
  }
  const single = mediaFromItem(item);
  return single ? [single] : [];
}

function mediaFromItem(item: WebInfoItem): InstagramPostMedia | null {
  const best = pickHighestCandidate(item.image_versions2?.candidates);
  if (!best?.url) return null;
  const media: InstagramPostMedia = { url: best.url };
  if (typeof best.width === "number") media.width = best.width;
  if (typeof best.height === "number") media.height = best.height;

  if (item.media_type === MEDIA_TYPE.VIDEO) {
    const bestVideo = pickHighestCandidate(item.video_versions);
    if (bestVideo?.url) {
      media.isVideo = true;
      media.videoUrl = bestVideo.url;
      if (typeof item.video_duration === "number") {
        media.durationSeconds = item.video_duration;
      }
    }
  }
  return media;
}

function pickHighestCandidate<T extends { width?: number; height?: number }>(
  candidates: ReadonlyArray<T> | undefined,
): T | undefined {
  if (!candidates || candidates.length === 0) return undefined;
  let best = candidates[0];
  let bestArea = areaOf(best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c) continue;
    const area = areaOf(c);
    if (area > bestArea) {
      best = c;
      bestArea = area;
    }
  }
  return best;
}

function areaOf(c: { width?: number; height?: number } | undefined): number {
  if (!c) return 0;
  const w = typeof c.width === "number" ? c.width : 0;
  const h = typeof c.height === "number" ? c.height : 0;
  return w * h;
}

function mapLocation(raw: LocationRaw | null | undefined): InstagramLocation | undefined {
  if (!raw) return undefined;
  const id = raw.pk ?? raw.id;
  const name = raw.name;
  if (!id || !name) return undefined;
  const loc: InstagramLocation = { id, name };
  if (raw.slug) loc.slug = raw.slug;
  return loc;
}

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9._]{1,30})/g;

export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}
