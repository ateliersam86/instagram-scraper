/**
 * Media downloader.
 *
 * Streams photo / video / audio files from the Instagram CDN to disk
 * via the authenticated Playwright context, so signed-URL cookies and
 * the right user-agent are sent. Plain `fetch` against
 * `scontent-*.cdninstagram.com` works for most assets but occasionally
 * hits a 403 when the signature scheme tightens — going through the
 * context's `request` fixture stays consistent with the page's view.
 *
 * Atomic writes: data goes to `<path>.partial`, then `rename` into the
 * final filename. A partial download leaves a `.partial` file the next
 * run can resume against (we just overwrite for now; resume support is
 * an easy follow-up if a CDN ever sends `Accept-Ranges`).
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HttpClient } from "../http/client.ts";

export interface DownloadResult {
  path: string;
  bytes: number;
  contentType?: string;
}

/**
 * Download a single URL to disk. Creates parent directories as needed.
 * Returns the absolute path + size of the written file.
 *
 * The HttpClient must already be initialized — we go through its
 * Playwright context to inherit cookies + fingerprint.
 */
export async function downloadMediaToFile(
  http: HttpClient,
  url: string,
  destPath: string,
): Promise<DownloadResult> {
  // Reach into the http client's context.request — cleaner than exposing
  // a generic GET on the HttpClient surface (which would also need
  // streaming primitives we don't otherwise want to expose).
  // biome-ignore lint/suspicious/noExplicitAny: Playwright dynamic context
  const context: any = (http as unknown as { context: unknown }).context;
  if (!context) {
    throw new Error("HttpClient not initialized — call initWithStorageState() first");
  }

  const response = await context.request.get(url, { timeout: 60_000 });
  if (response.status() >= 400) {
    throw new Error(`HTTP ${response.status()} on GET ${url}`);
  }
  const buf = Buffer.from(await response.body());
  const contentType = response.headers()["content-type"];

  await mkdir(dirname(destPath), { recursive: true });
  const tmp = `${destPath}.partial`;
  await writeFile(tmp, buf);
  await rename(tmp, destPath);

  return {
    path: destPath,
    bytes: buf.length,
    ...(contentType ? { contentType } : {}),
  };
}

/**
 * Download every media slot of a post/reel/story to a directory.
 * Naming: `{prefix}-{index}.{ext}` where ext is inferred from the URL
 * (`.jpg`, `.mp4`, `.webp`). Carousel slots produce one file per slot;
 * video stories produce one cover .jpg + one .mp4.
 */
export async function downloadMediaSlots(
  http: HttpClient,
  slots: ReadonlyArray<{ url: string; videoUrl?: string }>,
  dir: string,
  prefix: string,
): Promise<DownloadResult[]> {
  const out: DownloadResult[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) continue;
    const indexLabel = slots.length > 1 ? `-${String(i + 1).padStart(2, "0")}` : "";
    const coverPath = `${dir}/${prefix}${indexLabel}.${guessImageExt(slot.url)}`;
    out.push(await downloadMediaToFile(http, slot.url, coverPath));
    if (slot.videoUrl) {
      const videoPath = `${dir}/${prefix}${indexLabel}.${guessVideoExt(slot.videoUrl)}`;
      out.push(await downloadMediaToFile(http, slot.videoUrl, videoPath));
    }
  }
  return out;
}

function guessImageExt(url: string): string {
  const m = url.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i);
  return m?.[1]?.toLowerCase() ?? "jpg";
}

function guessVideoExt(url: string): string {
  const m = url.match(/\.(mp4|mov|m3u8)(?:\?|$)/i);
  return m?.[1]?.toLowerCase() ?? "mp4";
}
