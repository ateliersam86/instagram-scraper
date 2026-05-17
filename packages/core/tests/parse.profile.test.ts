import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProfileFromHtml } from "../src/parse/profile.ts";

function htmlWithMeta(...metas: Array<[string, string]>): string {
  const tags = metas
    .map(([prop, content]) => `<meta property="og:${prop}" content="${content}">`)
    .join("\n");
  return `<!doctype html><html><head>${tags}</head><body></body></html>`;
}

describe("parseProfileFromHtml — synthetic", () => {
  it("extracts username + full name + avatar from og:title (FR locale)", () => {
    const html = htmlWithMeta(
      ["title", "Example User (@example_user) • Photos et vidéos Instagram"],
      ["image", "https://cdn.example/avatar.jpg"],
      ["description", "399 followers, 512 suivis, 174 publications - Voir Instagram"],
    );
    const result = parseProfileFromHtml(html);
    expect(result).toEqual({
      username: "example_user",
      fullName: "Example User",
      avatarUrl: "https://cdn.example/avatar.jpg",
      followerCount: 399,
      followingCount: 512,
      postCount: 174,
    });
  });

  it("parses EN locale counts", () => {
    const html = htmlWithMeta(
      ["title", "Jane Doe (@janedoe) • Instagram photos and videos"],
      ["description", "1,234 Followers, 5,678 Following, 90 Posts - See Instagram"],
    );
    const result = parseProfileFromHtml(html);
    expect(result?.followerCount).toBe(1234);
    expect(result?.followingCount).toBe(5678);
    expect(result?.postCount).toBe(90);
  });

  it("parses ES locale counts (followers/seguidos/publicaciones)", () => {
    const html = htmlWithMeta(
      ["title", "Carlos (@carlos) • Instagram"],
      ["description", "100 followers, 200 seguidos, 50 publicaciones"],
    );
    const result = parseProfileFromHtml(html);
    expect(result?.followerCount).toBe(100);
    expect(result?.followingCount).toBe(200);
    expect(result?.postCount).toBe(50);
  });

  it("uses fallback username when og:title is missing", () => {
    const html = htmlWithMeta(["image", "https://cdn.example/x.jpg"]);
    const result = parseProfileFromHtml(html, "fallback_user");
    expect(result?.username).toBe("fallback_user");
    expect(result?.avatarUrl).toBe("https://cdn.example/x.jpg");
  });

  it("returns null when neither og:title nor fallback yields a username", () => {
    const html = "<html><head></head><body></body></html>";
    expect(parseProfileFromHtml(html)).toBeNull();
  });

  it("decodes HTML entities in og:* content (&amp; in avatar URL)", () => {
    const html = htmlWithMeta(
      ["title", "X (@x) • Instagram"],
      ["image", "https://cdn.example/a.jpg?a=1&amp;b=2"],
    );
    const result = parseProfileFromHtml(html);
    expect(result?.avatarUrl).toBe("https://cdn.example/a.jpg?a=1&b=2");
  });

  it("omits count fields cleanly when description is unparseable", () => {
    const html = htmlWithMeta(
      ["title", "Test (@test) • Instagram"],
      ["description", "Some unrelated description"],
    );
    const result = parseProfileFromHtml(html);
    expect(result).toEqual({ username: "test", fullName: "Test" });
  });
});

describe("parseProfileFromHtml — anonymized real-shape fixture", () => {
  it("parses an Instagram-shaped profile page (synthetic mirror of real HTML)", () => {
    const html = readFileSync(new URL("./fixtures/profile-anon.html", import.meta.url), "utf-8");
    const result = parseProfileFromHtml(html);
    expect(result).not.toBeNull();
    expect(result?.username).toBe("fixture_user");
    expect(result?.followerCount).toBe(412);
    expect(result?.followingCount).toBe(530);
    expect(result?.postCount).toBe(188);
    expect(result?.avatarUrl).toMatch(/^https:\/\/scontent-/);
    expect(result?.fullName).toBeDefined();
    expect(result?.fullName?.length).toBeGreaterThan(0);
  });
});
