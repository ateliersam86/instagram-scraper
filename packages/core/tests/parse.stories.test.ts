import { describe, expect, it } from "vitest";
import { parseStoriesByUser, parseStoriesFromReelsResponse } from "../src/parse/stories.ts";

function makeStoryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "3000000000000000_111",
    pk: "3000000000000000",
    taken_at: 1_700_000_000,
    expiring_at: 1_700_086_400,
    media_type: 1,
    image_versions2: {
      candidates: [
        { url: "https://cdn/small", width: 320, height: 568 },
        { url: "https://cdn/hd", width: 1080, height: 1920 },
      ],
    },
    ...overrides,
  };
}

describe("parseStoriesFromReelsResponse", () => {
  it("returns ISO timestamps + picks HD cover", () => {
    const stories = parseStoriesFromReelsResponse({
      reels: { "1234": { items: [makeStoryItem()] } },
    });
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({
      id: "3000000000000000_111",
      takenAt: "2023-11-14T22:13:20.000Z",
      expiresAt: "2023-11-15T22:13:20.000Z",
      isVideo: false,
      imageUrl: "https://cdn/hd",
    });
  });

  it("emits video URL + duration for media_type=2", () => {
    const stories = parseStoriesFromReelsResponse({
      reels: {
        "1": {
          items: [
            makeStoryItem({
              media_type: 2,
              video_duration: 8.4,
              video_versions: [{ url: "https://cdn/hd.mp4", width: 1080, height: 1920 }],
            }),
          ],
        },
      },
    });
    expect(stories[0]?.isVideo).toBe(true);
    expect(stories[0]?.videoUrl).toBe("https://cdn/hd.mp4");
    expect(stories[0]?.durationSeconds).toBe(8.4);
  });

  it("collects mentions from story_mentions + reel_mentions, deduped", () => {
    const stories = parseStoriesFromReelsResponse({
      reels: {
        "1": {
          items: [
            makeStoryItem({
              story_mentions: [{ user: { username: "alice" } }, { user: { username: "bob" } }],
              reel_mentions: [{ user: { username: "alice" } }],
            }),
          ],
        },
      },
    });
    expect(stories[0]?.mentions).toEqual(["alice", "bob"]);
  });

  it("collects hashtags from story_hashtags", () => {
    const stories = parseStoriesFromReelsResponse({
      reels: {
        "1": {
          items: [
            makeStoryItem({
              story_hashtags: [{ hashtag: { name: "sunset" } }, { hashtag: { name: "beach" } }],
            }),
          ],
        },
      },
    });
    expect(stories[0]?.hashtags).toEqual(["sunset", "beach"]);
  });

  it("extracts music sticker (title + artist)", () => {
    const stories = parseStoriesFromReelsResponse({
      reels: {
        "1": {
          items: [
            makeStoryItem({
              story_music_stickers: [
                {
                  music_asset_info: {
                    title: "Levitating",
                    display_artist: "Dua Lipa",
                  },
                },
              ],
            }),
          ],
        },
      },
    });
    expect(stories[0]?.music).toEqual({ title: "Levitating", artist: "Dua Lipa" });
  });

  it("handles reels_media[] alternate shape", () => {
    const stories = parseStoriesFromReelsResponse({
      reels_media: [{ items: [makeStoryItem(), makeStoryItem({ id: "x", pk: "x" })] }],
    });
    expect(stories).toHaveLength(2);
  });

  it("computes expiresAt = takenAt + 24h when expiring_at is missing", () => {
    const { expiring_at: _drop, ...rest } = makeStoryItem();
    void _drop;
    const stories = parseStoriesFromReelsResponse({ reels: { "1": { items: [rest] } } });
    expect(stories[0]?.expiresAt).toBe("2023-11-15T22:13:20.000Z");
  });

  it("returns empty list for an empty payload", () => {
    expect(parseStoriesFromReelsResponse({})).toEqual([]);
    expect(parseStoriesFromReelsResponse({ reels: {} })).toEqual([]);
  });

  it("skips story items missing cover URL", () => {
    const stories = parseStoriesFromReelsResponse({
      reels: {
        "1": {
          items: [
            { id: "no-cover", pk: "x", taken_at: 1_700_000_000, media_type: 1 },
            makeStoryItem(),
          ],
        },
      },
    });
    expect(stories).toHaveLength(1);
  });
});

describe("parseStoriesByUser", () => {
  it("groups stories by username", () => {
    const grouped = parseStoriesByUser({
      reels: {
        "1": { user: { username: "alice", pk: "1" }, items: [makeStoryItem()] },
        "2": {
          user: { username: "bob", pk: "2" },
          items: [makeStoryItem({ id: "y", pk: "y" })],
        },
      },
    });
    expect(grouped.get("alice")).toHaveLength(1);
    expect(grouped.get("bob")).toHaveLength(1);
  });
});
