import { describe, expect, it } from "vitest";
import { parseHighlightsTray } from "../src/parse/highlightsTray.ts";

// Shape verified against the real PolarisProfileStoryHighlightsTrayContentQuery
// response (2026-05 live recon on @example_user).
const SAMPLE = {
  data: {
    highlights: {
      edges: [
        {
          node: {
            id: "highlight:18362962996224276",
            title: "Italia",
            cover_media: { cropped_image_version: { url: "https://cdn/italia.jpg" } },
            user: { username: "example_user", id: "1111111111" },
            __typename: "XDTReelDict",
          },
          cursor: "",
        },
        {
          node: {
            id: "highlight:17899369110431929",
            title: "Étapes",
            cover_media: { cropped_image_version: { url: "https://cdn/etapes.jpg" } },
          },
          cursor: "",
        },
      ],
    },
  },
};

describe("parseHighlightsTray", () => {
  it("extracts albums and strips the highlight: prefix", () => {
    const albums = parseHighlightsTray(SAMPLE);
    expect(albums).toHaveLength(2);
    expect(albums[0]).toEqual({
      id: "18362962996224276",
      rawId: "highlight:18362962996224276",
      title: "Italia",
      coverUrl: "https://cdn/italia.jpg",
    });
    expect(albums[1]?.id).toBe("17899369110431929");
    expect(albums[1]?.title).toBe("Étapes");
  });

  it("returns [] for an empty or malformed payload", () => {
    expect(parseHighlightsTray(null)).toEqual([]);
    expect(parseHighlightsTray(undefined)).toEqual([]);
    expect(parseHighlightsTray({})).toEqual([]);
    expect(parseHighlightsTray({ data: { highlights: { edges: [] } } })).toEqual([]);
  });

  it("skips nodes without an id and tolerates missing title/cover", () => {
    const albums = parseHighlightsTray({
      data: {
        highlights: {
          edges: [{ node: { title: "no id" } }, { node: { id: "highlight:42" } }],
        },
      },
    });
    expect(albums).toHaveLength(1);
    expect(albums[0]).toEqual({
      id: "42",
      rawId: "highlight:42",
      title: "",
      coverUrl: undefined,
    });
  });
});
