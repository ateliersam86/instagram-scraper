import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FilesystemAdapter } from "../src/index.ts";

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ig-fs-test-"));
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("FilesystemAdapter", () => {
  it("writes profile.json under profiles/{username}/", async () => {
    const fs = new FilesystemAdapter(root);
    const path = await fs.writeProfile({
      username: "alice",
      fullName: "Alice",
      followerCount: 100,
    });
    expect(path).toBe(join(root, "profiles", "alice", "profile.json"));
    const json = JSON.parse(await readFile(path, "utf-8"));
    expect(json.username).toBe("alice");
  });

  it("writes post.json under posts/{author}/{shortcode}/", async () => {
    const fs = new FilesystemAdapter(root);
    const path = await fs.writePost({
      shortcode: "ABC123",
      authorUsername: "bob",
      media: [{ url: "https://x" }],
    });
    expect(path).toBe(join(root, "posts", "bob", "ABC123", "post.json"));
  });

  it("writes story json under stories/{user}/{YYYY-MM-DD}/{id}.json", async () => {
    const fs = new FilesystemAdapter(root);
    const path = await fs.writeStory("carol", {
      id: "999_carol",
      takenAt: "2026-05-11T14:30:00.000Z",
      expiresAt: "2026-05-12T14:30:00.000Z",
      isVideo: true,
      imageUrl: "https://cover",
    });
    expect(path).toBe(join(root, "stories", "carol", "2026-05-11", "999_carol.json"));
  });

  it("sanitizes weird chars in usernames + shortcodes", async () => {
    const fs = new FilesystemAdapter(root);
    const path = await fs.writePost({
      shortcode: "../etc/passwd",
      authorUsername: "weird/user",
      media: [],
    });
    // Slashes get replaced so no real path traversal happens.
    expect(path).not.toContain("/etc/passwd");
    expect(path).toContain("weird_user");
    expect(path).toContain(".._etc_passwd");
  });

  it("pathForXxxAsset returns the right directory", () => {
    const fs = new FilesystemAdapter(root);
    expect(fs.pathForProfileAsset("alice", "avatar.jpg")).toBe(
      join(root, "profiles", "alice", "avatar.jpg"),
    );
    expect(fs.pathForPostAsset("bob", "ABC", "media-01.jpg")).toBe(
      join(root, "posts", "bob", "ABC", "media-01.jpg"),
    );
    expect(
      fs.pathForStoryAsset("carol", "999_carol", "2026-05-11T14:30:00.000Z", "999_carol.mp4"),
    ).toBe(join(root, "stories", "carol", "2026-05-11", "999_carol.mp4"));
  });
});
