import { describe, expect, it } from "vitest";
import { parseLocationFromHtml } from "../src/parse/location.ts";

const FIELD = "xdt_api__v1__locations__web_info";

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
  location_info: {
    pk: 264617522,
    name: "Cheverny",
    slug: "cheverny",
    lat: 47.5,
    lng: 1.45,
    media_count: 12345,
  },
  top: {
    sections: [
      {
        layout_content: {
          medias: [
            {
              media: {
                code: "TOPC1",
                user: { username: "alice" },
                like_count: 9,
                comment_count: 1,
                taken_at: 1_700_000_000,
                media_type: 1,
                image_versions2: { candidates: [{ url: "https://t.jpg" }] },
              },
            },
          ],
        },
      },
    ],
  },
  recent: { sections: [] },
};

describe("parseLocationFromHtml", () => {
  it("extracts location info + coerces pk to string", () => {
    const result = parseLocationFromHtml(wrap(sample));
    expect(result?.id).toBe("264617522");
    expect(result?.name).toBe("Cheverny");
    expect(result?.slug).toBe("cheverny");
    expect(result?.lat).toBe(47.5);
    expect(result?.lng).toBe(1.45);
    expect(result?.mediaCount).toBe(12345);
    expect(result?.topPosts).toHaveLength(1);
    expect(result?.topPosts[0]?.shortcode).toBe("TOPC1");
  });

  it("returns null when location_info is missing", () => {
    expect(parseLocationFromHtml(wrap({}))).toBeNull();
  });
});
