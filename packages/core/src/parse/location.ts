/**
 * Location parser.
 *
 * Reads `/explore/locations/{id}/{slug}/` pages. Same Apollo cache
 * pattern as hashtag; field name is `xdt_api__v1__locations__web_info`.
 */

import { extractApolloCache } from "./apolloCache.ts";
import type { HashtagPostSummary } from "./hashtag.ts";

const LOCATION_FIELD = "xdt_api__v1__locations__web_info";

export interface InstagramLocationPage {
  id: string;
  name: string;
  slug?: string;
  lat?: number;
  lng?: number;
  mediaCount?: number;
  topPosts: HashtagPostSummary[];
  recentPosts: HashtagPostSummary[];
}

interface LocationWebInfo {
  location_info?: {
    pk?: string | number;
    name?: string;
    slug?: string;
    lat?: number;
    lng?: number;
    media_count?: number;
  };
  top?: { sections?: ReadonlyArray<Section> };
  recent?: { sections?: ReadonlyArray<Section> };
}

interface Section {
  layout_content?: { medias?: ReadonlyArray<{ media?: MediaNode }> };
}

interface MediaNode {
  code?: string;
  user?: { username?: string };
  like_count?: number;
  comment_count?: number;
  taken_at?: number;
  media_type?: number;
  image_versions2?: { candidates?: ReadonlyArray<{ url?: string }> };
}

export function parseLocationFromHtml(
  html: string,
  locationIdHint?: string,
): InstagramLocationPage | null {
  const payload = extractApolloCache<LocationWebInfo>(html, LOCATION_FIELD);
  if (!payload) return null;
  const info = payload.location_info;
  if (!info) return null;
  const id = info.pk !== undefined ? String(info.pk) : locationIdHint;
  if (!id || !info.name) return null;

  const out: InstagramLocationPage = {
    id,
    name: info.name,
    topPosts: collect(payload.top?.sections),
    recentPosts: collect(payload.recent?.sections),
  };
  if (info.slug) out.slug = info.slug;
  if (typeof info.lat === "number") out.lat = info.lat;
  if (typeof info.lng === "number") out.lng = info.lng;
  if (typeof info.media_count === "number") out.mediaCount = info.media_count;
  return out;
}

function collect(sections: ReadonlyArray<Section> | undefined): HashtagPostSummary[] {
  const out: HashtagPostSummary[] = [];
  for (const section of sections ?? []) {
    for (const m of section.layout_content?.medias ?? []) {
      const n = m.media;
      if (!n?.code) continue;
      const s: HashtagPostSummary = { shortcode: n.code };
      if (n.user?.username) s.ownerUsername = n.user.username;
      if (typeof n.like_count === "number") s.likeCount = n.like_count;
      if (typeof n.comment_count === "number") s.commentCount = n.comment_count;
      if (typeof n.taken_at === "number") s.takenAt = new Date(n.taken_at * 1000).toISOString();
      if (n.media_type === 2) s.isVideo = true;
      const thumb = n.image_versions2?.candidates?.[0]?.url;
      if (thumb) s.thumbnailUrl = thumb;
      out.push(s);
    }
  }
  return out;
}
