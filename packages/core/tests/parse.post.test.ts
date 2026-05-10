import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractHashtags,
  extractMentions,
  parsePostFromHtml,
  postFromWebInfoItem,
} from "../src/parse/post.ts";

function htmlFromFixture(): string {
  const blob = readFileSync(new URL("./fixtures/post-bbox-anon.json", import.meta.url), "utf-8");
  return `<!doctype html><script type="application/json">${blob}</script>`;
}

describe("parsePostFromHtml — anonymized real-shape carousel fixture", () => {
  it("extracts shortcode, author, caption, counts, ISO timestamp", () => {
    const post = parsePostFromHtml(htmlFromFixture());
    expect(post).not.toBeNull();
    expect(post?.shortcode).toBe("FIXTUREcAR1");
    expect(post?.authorUsername).toBe("fixture_org");
    expect(post?.authorFullName).toBe("Fixture Organisation");
    expect(post?.authorId).toBe("900000001");
    expect(post?.likeCount).toBe(115);
    expect(post?.commentsCount).toBe(2);
    expect(post?.caption?.startsWith("🏊")).toBe(true);
    expect(post?.takenAt).toBe("2023-11-14T22:13:20.000Z");
    expect(post?.isVideo).toBeUndefined();
    expect(post?.hashtags).toContain("fixture");
    expect(post?.mentions).toContain("other_fixture");
  });

  it("returns one media slot per carousel entry (media_type=8)", () => {
    const post = parsePostFromHtml(htmlFromFixture());
    expect(post?.media).toHaveLength(3);
    for (const m of post?.media ?? []) {
      expect(m.url).toMatch(/^https:\/\//);
    }
  });

  it("picks the highest-resolution image candidate per slot", () => {
    const post = parsePostFromHtml(htmlFromFixture());
    const first = post?.media[0];
    expect(first?.width).toBe(1439);
    expect(first?.height).toBe(959);
    expect(first?.url).toMatch(/slot-1-fullsize/);
  });
});

describe("postFromWebInfoItem — synthetic", () => {
  it("maps a photo post", () => {
    const post = postFromWebInfoItem({
      code: "ABC",
      id: "id1",
      taken_at: 1_700_000_000,
      media_type: 1,
      caption: { text: "Hello #world @friend" },
      user: { pk: "u1", username: "alice", full_name: "Alice" },
      like_count: 42,
      comment_count: 3,
      image_versions2: {
        candidates: [
          { url: "https://small", width: 100, height: 100 },
          { url: "https://hd", width: 1080, height: 1080 },
        ],
      },
    });
    expect(post.shortcode).toBe("ABC");
    expect(post.media[0]?.url).toBe("https://hd");
    expect(post.likeCount).toBe(42);
    expect(post.hashtags).toEqual(["world"]);
    expect(post.mentions).toEqual(["friend"]);
    expect(post.takenAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("maps a video post with isVideo + videoUrl", () => {
    const post = postFromWebInfoItem({
      code: "VID",
      media_type: 2,
      video_duration: 12.5,
      video_versions: [{ url: "https://hd.mp4", width: 1080, height: 1920, type: 101 }],
      image_versions2: {
        candidates: [{ url: "https://cover", width: 1080, height: 1920 }],
      },
    });
    expect(post.isVideo).toBe(true);
    expect(post.media[0]?.videoUrl).toBe("https://hd.mp4");
    expect(post.media[0]?.durationSeconds).toBe(12.5);
    expect(post.isReel).toBeUndefined();
  });

  it("marks a clips video as reel", () => {
    const post = postFromWebInfoItem({
      code: "REEL",
      media_type: 2,
      product_type: "clips",
      video_versions: [{ url: "https://r.mp4" }],
      image_versions2: { candidates: [{ url: "https://cover" }] },
    });
    expect(post.isReel).toBe(true);
    expect(post.isVideo).toBe(true);
  });

  it("emits one media entry per carousel slot", () => {
    const post = postFromWebInfoItem({
      code: "CAR",
      media_type: 8,
      carousel_media: [
        {
          media_type: 1,
          image_versions2: {
            candidates: [{ url: "https://a", width: 1, height: 1 }],
          },
        },
        {
          media_type: 1,
          image_versions2: {
            candidates: [{ url: "https://b", width: 1, height: 1 }],
          },
        },
        {
          media_type: 1,
          image_versions2: {
            candidates: [{ url: "https://c", width: 1, height: 1 }],
          },
        },
      ],
    });
    expect(post.media.map((m) => m.url)).toEqual(["https://a", "https://b", "https://c"]);
  });

  it("maps location when present", () => {
    const post = postFromWebInfoItem({
      code: "LOC",
      media_type: 1,
      image_versions2: { candidates: [{ url: "https://x" }] },
      location: { pk: "9999", name: "Paris", slug: "paris-fr" },
    });
    expect(post.location).toEqual({ id: "9999", name: "Paris", slug: "paris-fr" });
  });

  it("falls back gracefully when fields are missing", () => {
    const post = postFromWebInfoItem({});
    expect(post.shortcode).toBe("");
    expect(post.media).toEqual([]);
    expect(post.authorUsername).toBeUndefined();
  });
});

describe("hashtag + mention parsing", () => {
  it("parses unicode hashtags", () => {
    expect(extractHashtags("riding #vélo and #españa")).toEqual(["vélo", "españa"]);
  });
  it("dedupes hashtags", () => {
    expect(extractHashtags("#run #run #ride")).toEqual(["run", "ride"]);
  });
  it("ignores @ inside email addresses", () => {
    expect(extractMentions("contact me@example.com or @sam")).toEqual(["sam"]);
  });
});
