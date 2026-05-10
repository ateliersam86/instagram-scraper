/**
 * Storage adapters for instagram-scraper. Phase 7 deliverable; the
 * interface is defined here so downstream packages can depend on it
 * without waiting for a concrete implementation.
 */

import type { InstagramPost, InstagramProfile, InstagramStoryItem } from "../../core/src/index.ts";

export interface StorageAdapter {
  writeProfile(profile: InstagramProfile): Promise<void>;
  writePost(post: InstagramPost): Promise<void>;
  writeStory(username: string, story: InstagramStoryItem): Promise<void>;
  writeFile(
    bucket: "profiles" | "posts" | "stories",
    relativePath: string,
    body: ReadableStream<Uint8Array>,
    metadata?: { contentType?: string },
  ): Promise<void>;
}
