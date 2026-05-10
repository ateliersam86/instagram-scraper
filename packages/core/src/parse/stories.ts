/**
 * Stories parser.
 *
 * Stories don't appear in HTML — they load via XHR to
 * `/api/v1/feed/reels_media/?reel_ids=...`. The {@link HttpClient}'s
 * `captureXhr` grabs the JSON; this module maps it to
 * {@link InstagramStoryItem}.
 *
 * Reels-media response shape (verified against IG web client May 2026):
 *
 *   {
 *     reels: { "<userPk>": { id, user, items: [StoryItem, ...] } },
 *     reels_media: [{ id, user, items: [...] }]   // alternate shape
 *   }
 *
 * Each StoryItem carries:
 *   - id, taken_at, expiring_at
 *   - media_type (1=image, 2=video)
 *   - image_versions2.candidates[], video_versions[]
 *   - story_hashtags[], story_mentions[], story_link_stickers[]
 *   - story_music_stickers[] (clip + artist + start/end)
 *
 * We extract every story for every user in the payload — the same XHR
 * sometimes returns multiple users' rings when a feed renders a tray.
 */

import type { InstagramStoryItem } from "../types/post.ts";

interface ReelsMediaResponse {
  reels?: Record<string, Reel>;
  reels_media?: ReadonlyArray<Reel>;
}

interface Reel {
  id?: string | number;
  user?: { pk?: string | number; username?: string };
  items?: ReadonlyArray<StoryRaw>;
}

interface StoryRaw {
  pk?: string | number;
  id?: string;
  taken_at?: number;
  expiring_at?: number;
  media_type?: number;
  video_duration?: number;
  image_versions2?: {
    candidates?: ReadonlyArray<{ url?: string; width?: number; height?: number }>;
  };
  video_versions?: ReadonlyArray<{ url?: string; width?: number; height?: number; type?: number }>;
  story_hashtags?: ReadonlyArray<{ hashtag?: { name?: string } }>;
  story_mentions?: ReadonlyArray<{ user?: { username?: string } }>;
  reel_mentions?: ReadonlyArray<{ user?: { username?: string } }>;
  story_link_stickers?: ReadonlyArray<{ story_link?: { url?: string } }>;
  story_music_stickers?: ReadonlyArray<{
    music_asset_info?: { title?: string; display_artist?: string };
  }>;
}

/**
 * Maps a full reels_media XHR payload to a flat list of stories. When
 * multiple reels are present (e.g. a tray), all items are returned in
 * insertion order.
 *
 * Returns `[]` when the payload has no items — never throws on shape.
 */
export function parseStoriesFromReelsResponse(payload: ReelsMediaResponse): InstagramStoryItem[] {
  const reels = collectReels(payload);
  const out: InstagramStoryItem[] = [];
  for (const reel of reels) {
    for (const raw of reel.items ?? []) {
      const item = mapStory(raw);
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * Same as {@link parseStoriesFromReelsResponse} but groups by username,
 * which is what callers typically want when feeding multiple rings into
 * a single XHR.
 */
export function parseStoriesByUser(payload: ReelsMediaResponse): Map<string, InstagramStoryItem[]> {
  const reels = collectReels(payload);
  const out = new Map<string, InstagramStoryItem[]>();
  for (const reel of reels) {
    const username = reel.user?.username ?? String(reel.user?.pk ?? reel.id ?? "");
    if (!username) continue;
    const items: InstagramStoryItem[] = [];
    for (const raw of reel.items ?? []) {
      const item = mapStory(raw);
      if (item) items.push(item);
    }
    if (items.length > 0) out.set(username, items);
  }
  return out;
}

function collectReels(payload: ReelsMediaResponse): Reel[] {
  const reels: Reel[] = [];
  if (payload.reels) {
    for (const reel of Object.values(payload.reels)) {
      if (reel) reels.push(reel);
    }
  }
  if (payload.reels_media) {
    for (const reel of payload.reels_media) {
      if (reel) reels.push(reel);
    }
  }
  return reels;
}

function mapStory(raw: StoryRaw): InstagramStoryItem | null {
  if (typeof raw.taken_at !== "number") return null;
  const id = String(raw.id ?? raw.pk ?? "");
  if (!id) return null;
  const takenAtMs = raw.taken_at * 1000;
  const expiresAtMs =
    typeof raw.expiring_at === "number" ? raw.expiring_at * 1000 : takenAtMs + 24 * 3600 * 1000;
  const isVideo = raw.media_type === 2;
  const cover = pickHighest(raw.image_versions2?.candidates);
  if (!cover?.url) return null;

  const item: InstagramStoryItem = {
    id,
    takenAt: new Date(takenAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    isVideo,
    imageUrl: cover.url,
  };

  if (isVideo) {
    const v = pickHighest(raw.video_versions);
    if (v?.url) item.videoUrl = v.url;
    if (typeof raw.video_duration === "number") item.durationSeconds = raw.video_duration;
  }

  const mentions = collectMentions(raw);
  if (mentions.length > 0) item.mentions = mentions;
  const hashtags = collectHashtags(raw);
  if (hashtags.length > 0) item.hashtags = hashtags;

  const music = raw.story_music_stickers?.[0]?.music_asset_info;
  if (music?.title) {
    item.music = music.display_artist
      ? { title: music.title, artist: music.display_artist }
      : { title: music.title };
  }

  return item;
}

function collectMentions(raw: StoryRaw): string[] {
  const set = new Set<string>();
  for (const m of raw.story_mentions ?? []) {
    const u = m.user?.username;
    if (u) set.add(u);
  }
  for (const m of raw.reel_mentions ?? []) {
    const u = m.user?.username;
    if (u) set.add(u);
  }
  return [...set];
}

function collectHashtags(raw: StoryRaw): string[] {
  const set = new Set<string>();
  for (const h of raw.story_hashtags ?? []) {
    const name = h.hashtag?.name;
    if (name) set.add(name);
  }
  return [...set];
}

function pickHighest<T extends { width?: number; height?: number }>(
  list: ReadonlyArray<T> | undefined,
): T | undefined {
  if (!list || list.length === 0) return undefined;
  let best = list[0];
  let bestArea = area(best);
  for (let i = 1; i < list.length; i++) {
    const c = list[i];
    if (!c) continue;
    const a = area(c);
    if (a > bestArea) {
      best = c;
      bestArea = a;
    }
  }
  return best;
}

function area(c: { width?: number; height?: number } | undefined): number {
  if (!c) return 0;
  return (c.width ?? 0) * (c.height ?? 0);
}
