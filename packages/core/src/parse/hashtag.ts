/**
 * Hashtag parser.
 *
 * Reads `/explore/tags/{tag}/` pages. Instagram embeds the hashtag
 * payload in the same Apollo cache shape as posts, under the field
 * `xdt_api__v1__tags__web_info` (verified 2026-05).
 *
 * Returns:
 *   - `tagName`, `mediaCount`
 *   - `topPosts[]` / `recentPosts[]`: arrays of `{ shortcode, ownerUsername,
 *     thumbnailUrl, likeCount, commentCount, takenAt }`.
 *
 * Pagination cursor (for deeper scrapes) isn't extracted here yet — the
 * first-page (~30-70 posts) is typically what callers need for archival.
 */

import { extractApolloCache } from "./apolloCache.ts";

const HASHTAG_FIELD = "xdt_api__v1__tags__web_info";

export interface HashtagPostSummary {
  shortcode: string;
  ownerUsername?: string;
  thumbnailUrl?: string;
  likeCount?: number;
  commentCount?: number;
  takenAt?: string;
  isVideo?: boolean;
}

export interface InstagramHashtag {
  tagName: string;
  mediaCount?: number;
  topPosts: HashtagPostSummary[];
  recentPosts: HashtagPostSummary[];
}

interface HashtagWebInfo {
  name?: string;
  media_count?: number;
  top?: { sections?: ReadonlyArray<HashtagSection> };
  recent?: { sections?: ReadonlyArray<HashtagSection> };
}

interface HashtagSection {
  layout_content?: { medias?: ReadonlyArray<{ media?: PostNode }> };
}

interface PostNode {
  code?: string;
  pk?: string;
  taken_at?: number;
  media_type?: number;
  like_count?: number;
  comment_count?: number;
  user?: { username?: string };
  image_versions2?: {
    candidates?: ReadonlyArray<{ url?: string; width?: number; height?: number }>;
  };
}

export function parseHashtagFromHtml(html: string, tagHint?: string): InstagramHashtag | null {
  const payload = extractApolloCache<HashtagWebInfo>(html, HASHTAG_FIELD);
  if (!payload) return null;
  const tagName = payload.name ?? tagHint;
  if (!tagName) return null;

  return {
    tagName,
    ...(typeof payload.media_count === "number" ? { mediaCount: payload.media_count } : {}),
    topPosts: collectPosts(payload.top?.sections),
    recentPosts: collectPosts(payload.recent?.sections),
  };
}

function collectPosts(sections: ReadonlyArray<HashtagSection> | undefined): HashtagPostSummary[] {
  const out: HashtagPostSummary[] = [];
  for (const section of sections ?? []) {
    for (const m of section.layout_content?.medias ?? []) {
      const node = m.media;
      if (!node?.code) continue;
      const summary: HashtagPostSummary = { shortcode: node.code };
      if (node.user?.username) summary.ownerUsername = node.user.username;
      if (typeof node.like_count === "number") summary.likeCount = node.like_count;
      if (typeof node.comment_count === "number") summary.commentCount = node.comment_count;
      if (typeof node.taken_at === "number") {
        summary.takenAt = new Date(node.taken_at * 1000).toISOString();
      }
      if (node.media_type === 2) summary.isVideo = true;
      const thumb = node.image_versions2?.candidates?.[0]?.url;
      if (thumb) summary.thumbnailUrl = thumb;
      out.push(summary);
    }
  }
  return out;
}
