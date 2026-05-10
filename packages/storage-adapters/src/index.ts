/**
 * Storage adapters for instagram-scraper.
 *
 * `FilesystemAdapter` writes JSON + media to a local directory tree:
 *
 *   <root>/profiles/{username}/profile.json
 *                              /avatar.jpg
 *   <root>/posts/{username}/{shortcode}/post.json
 *                                       /media-01.jpg
 *                                       /media-02.jpg
 *                                       /media-01.mp4   (when videoUrl)
 *   <root>/stories/{username}/{YYYY-MM-DD}/{storyId}.json
 *                                          /{storyId}.jpg
 *                                          /{storyId}.mp4
 *
 * All writes are atomic: bytes go to `<path>.partial` then rename to
 * the final filename. Concurrent writers to the same path race on the
 * rename, which is safe on POSIX (last writer wins).
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InstagramPost, InstagramProfile, InstagramStoryItem } from "../../core/src/index.ts";

export interface StorageAdapter {
  writeProfile(profile: InstagramProfile): Promise<string>;
  writePost(post: InstagramPost): Promise<string>;
  writeStory(username: string, story: InstagramStoryItem): Promise<string>;
  pathForProfileAsset(username: string, filename: string): string;
  pathForPostAsset(username: string, shortcode: string, filename: string): string;
  pathForStoryAsset(
    username: string,
    storyId: string,
    takenAtIso: string,
    filename: string,
  ): string;
}

export class FilesystemAdapter implements StorageAdapter {
  constructor(public readonly root: string) {}

  async writeProfile(profile: InstagramProfile): Promise<string> {
    const path = join(this.profileDir(profile.username), "profile.json");
    await atomicWriteJson(path, profile);
    return path;
  }

  async writePost(post: InstagramPost): Promise<string> {
    const username = post.authorUsername ?? "_unknown";
    const path = join(this.postDir(username, post.shortcode), "post.json");
    await atomicWriteJson(path, post);
    return path;
  }

  async writeStory(username: string, story: InstagramStoryItem): Promise<string> {
    const path = join(this.storyDir(username, story.takenAt), `${story.id}.json`);
    await atomicWriteJson(path, story);
    return path;
  }

  pathForProfileAsset(username: string, filename: string): string {
    return join(this.profileDir(username), filename);
  }

  pathForPostAsset(username: string, shortcode: string, filename: string): string {
    return join(this.postDir(username, shortcode), filename);
  }

  pathForStoryAsset(
    username: string,
    _storyId: string,
    takenAtIso: string,
    filename: string,
  ): string {
    return join(this.storyDir(username, takenAtIso), filename);
  }

  private profileDir(username: string): string {
    return join(this.root, "profiles", sanitize(username));
  }

  private postDir(username: string, shortcode: string): string {
    return join(this.root, "posts", sanitize(username), sanitize(shortcode));
  }

  private storyDir(username: string, takenAtIso: string): string {
    const day = takenAtIso.slice(0, 10);
    return join(this.root, "stories", sanitize(username), day);
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.partial`;
  await writeFile(tmp, json, "utf-8");
  await rename(tmp, path);
}

function sanitize(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, "_");
}
