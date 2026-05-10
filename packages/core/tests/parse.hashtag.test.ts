import { describe, expect, it } from "vitest";
import { parseHashtagFromHtml } from "../src/parse/hashtag.ts";

const FIELD = "xdt_api__v1__tags__web_info";

function wrap(payload: unknown): string {
  return `<!doctype html><script type="application/json">${JSON.stringify({
    require: [
      [
        "ScheduledServerJS",
        "handle",
        null,
        [{ __bbox: { complete: true, result: { data: { [FIELD]: payload } } } }],
      ],
    ],
  })}</script>`;
}

const sample = {
  name: "running",
  media_count: 42_000_000,
  top: {
    sections: [
      {
        layout_content: {
          medias: [
            {
              media: {
                code: "ABC1",
                pk: "1",
                taken_at: 1_700_000_000,
                like_count: 100,
                comment_count: 5,
                media_type: 1,
                user: { username: "runner_top" },
                image_versions2: { candidates: [{ url: "https://thumb-1.jpg" }] },
              },
            },
          ],
        },
      },
    ],
  },
  recent: {
    sections: [
      {
        layout_content: {
          medias: [
            {
              media: {
                code: "REC1",
                media_type: 2,
                user: { username: "runner_recent" },
                image_versions2: { candidates: [{ url: "https://thumb-rec.jpg" }] },
              },
            },
          ],
        },
      },
    ],
  },
};

describe("parseHashtagFromHtml", () => {
  it("returns tag name + counts + top + recent posts", () => {
    const result = parseHashtagFromHtml(wrap(sample));
    expect(result).not.toBeNull();
    expect(result?.tagName).toBe("running");
    expect(result?.mediaCount).toBe(42_000_000);
    expect(result?.topPosts).toHaveLength(1);
    expect(result?.recentPosts).toHaveLength(1);
    expect(result?.topPosts[0]).toMatchObject({
      shortcode: "ABC1",
      ownerUsername: "runner_top",
      likeCount: 100,
      commentCount: 5,
      thumbnailUrl: "https://thumb-1.jpg",
      takenAt: "2023-11-14T22:13:20.000Z",
    });
    expect(result?.topPosts[0]?.isVideo).toBeUndefined();
    expect(result?.recentPosts[0]?.isVideo).toBe(true);
  });

  it("returns null when no Apollo blob is present", () => {
    expect(parseHashtagFromHtml("<html></html>")).toBeNull();
  });

  it("uses fallback tag name when payload lacks `name`", () => {
    const noName = { ...sample, name: undefined };
    const result = parseHashtagFromHtml(wrap(noName), "fallback_tag");
    expect(result?.tagName).toBe("fallback_tag");
  });
});
