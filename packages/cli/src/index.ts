#!/usr/bin/env node
/**
 * @atelier/instagram-scraper-cli
 *
 * Commands:
 *   instagram-scraper auth login                  interactive login (headed)
 *   instagram-scraper auth status                 validate the stored session
 *   instagram-scraper profile <username>          scrape one profile
 *   instagram-scraper post <shortcode>            scrape one post / reel
 *   instagram-scraper stories <username>          scrape active 24h stories
 *   instagram-scraper highlight <id>              scrape one permanent highlight album
 *   instagram-scraper highlights <username>       discover + scrape all of a profile's highlights
 *   instagram-scraper hashtag <tag>               scrape /explore/tags/{tag}/
 *   instagram-scraper location <id>               scrape /explore/locations/{id}/
 *
 * Every scraping command accepts:
 *   -o <path>       write JSON to a file (default: stdout)
 *   --download      also download HD media to the FilesystemAdapter tree
 *   --root <dir>    archive root (default: ~/.local/share/instagram-scraper)
 *
 * `highlights` also accepts:
 *   --album <titles>   only albums whose title matches (comma-separated)
 *   --since <date>     only items posted on/after this date
 *   --until <date>     only items posted on/before this date
 *
 * Session lives in `$IG_STATE` or `~/.config/instagram-scraper/storage-state.json`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  HttpClient,
  PersistentContextAuth,
  downloadMediaSlots,
  downloadMediaToFile,
  parseHashtagFromHtml,
  parseLocationFromHtml,
  parsePostFromHtml,
  parseProfileFromHtml,
  parseProfilePostsFromHtml,
  scrapeHighlightById,
  scrapeHighlightsTray,
  scrapeStoriesForUser,
} from "@atelier/instagram-scraper-core";
import { FilesystemAdapter } from "@atelier/instagram-scraper-storage";
import { Command } from "commander";

const DEFAULT_STATE = join(homedir(), ".config", "instagram-scraper", "storage-state.json");
const STATE_PATH = process.env["IG_STATE"] ?? DEFAULT_STATE;
const DEFAULT_ROOT = join(homedir(), ".local", "share", "instagram-scraper");

type SharedOpts = { out?: string; download?: boolean; root?: string };

const program = new Command();
program
  .name("instagram-scraper")
  .description("Scrape Instagram profiles, posts, reels, stories, highlights, hashtags, locations.")
  .version("0.3.0");

const auth = program.command("auth").description("Authentication");
auth
  .command("login")
  .description("Open a real browser, sign in to Instagram, save the session.")
  .action(async () => {
    await mkdir(dirname(STATE_PATH), { recursive: true });
    const persistent = new PersistentContextAuth({
      storageStatePath: STATE_PATH,
      headedOnFirstRun: true,
    });
    await persistent.prepare();
    await persistent.dispose();
    process.stdout.write(`Session saved to ${STATE_PATH}\n`);
  });

auth
  .command("status")
  .description("Verify the stored session still resolves the home feed.")
  .action(async () => {
    const http = await openHttp();
    try {
      const html = await http.fetchHtml("https://www.instagram.com/");
      const ok = !html.includes("/accounts/login/");
      process.stdout.write(ok ? "Session OK\n" : "Session not authenticated — run `auth login`\n");
      if (!ok) process.exitCode = 2;
    } finally {
      await http.dispose();
    }
  });

scrapingCommand("profile <username>", "Scrape a single Instagram profile.").action(
  async (username: string, options: SharedOpts) => {
    const http = await openHttp();
    try {
      const html = await http.fetchHtml(
        `https://www.instagram.com/${encodeURIComponent(username)}/`,
      );
      const profile = parseProfileFromHtml(html, username);
      if (!profile) throw new Error(`No profile data found for ${username}`);
      await emit(profile, options.out);
      if (options.download) {
        const fs = makeFs(options.root);
        await fs.writeProfile(profile);
        if (profile.avatarUrl) {
          await downloadMediaToFile(
            http,
            profile.avatarUrl,
            fs.pathForProfileAsset(profile.username, "avatar.jpg"),
          );
        }
        process.stdout.write(`Archived to ${fs.root}/profiles/${profile.username}/\n`);
      }
    } finally {
      await http.dispose();
    }
  },
);

scrapingCommand(
  "posts <username>",
  "List recent post + reel shortcodes from a profile's grid (no fetching).",
)
  .option(
    "--limit <n>",
    "Max shortcodes to extract (default 12)",
    (v) => Number.parseInt(v, 10),
    12,
  )
  .action(async (username: string, options: SharedOpts & { limit: number }) => {
    const http = await openHttp();
    try {
      // Profile grid is React-rendered → wait for at least one /p/ or /reel/
      // anchor before extracting (avoid scraping the placeholder shell).
      const html = await http.fetchHtmlWaitFor(
        `https://www.instagram.com/${encodeURIComponent(username)}/`,
        'a[href*="/p/"], a[href*="/reel/"]',
        { selectorTimeoutMs: 12_000, networkIdle: false },
      );
      const refs = parseProfilePostsFromHtml(html, options.limit ?? 12);
      await emit({ username, count: refs.length, posts: refs }, options.out);
    } finally {
      await http.dispose();
    }
  });

scrapingCommand("post <shortcode>", "Scrape a single post or reel by shortcode.").action(
  async (shortcode: string, options: SharedOpts) => {
    const http = await openHttp();
    try {
      const html = await http.fetchHtml(
        `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`,
      );
      const post = parsePostFromHtml(html, shortcode);
      if (!post) throw new Error(`No post data found for ${shortcode}`);
      await emit(post, options.out);
      if (options.download) {
        const fs = makeFs(options.root);
        await fs.writePost(post);
        const username = post.authorUsername ?? "_unknown";
        const dir = dirname(fs.pathForPostAsset(username, post.shortcode, "x"));
        await downloadMediaSlots(http, post.media, dir, "media");
        process.stdout.write(`Archived ${post.media.length} slot(s) to ${dir}\n`);
      }
    } finally {
      await http.dispose();
    }
  },
);

scrapingCommand("stories <username>", "Scrape the 24h stories ring of a user.").action(
  async (username: string, options: SharedOpts) => {
    const http = await openHttp();
    try {
      const items = await scrapeStoriesForUser(http, username);
      await emit(items, options.out);
      if (options.download) {
        const fs = makeFs(options.root);
        for (const story of items) {
          await fs.writeStory(username, story);
          const coverPath = fs.pathForStoryAsset(
            username,
            story.id,
            story.takenAt,
            `${story.id}.jpg`,
          );
          await downloadMediaToFile(http, story.imageUrl, coverPath);
          if (story.videoUrl) {
            const videoPath = fs.pathForStoryAsset(
              username,
              story.id,
              story.takenAt,
              `${story.id}.mp4`,
            );
            await downloadMediaToFile(http, story.videoUrl, videoPath);
          }
        }
        process.stdout.write(
          `Archived ${items.length} story item(s) to ${fs.root}/stories/${username}/\n`,
        );
      }
    } finally {
      await http.dispose();
    }
  },
);

scrapingCommand("highlight <id>", "Scrape a permanent Highlights album by id.").action(
  async (id: string, options: SharedOpts) => {
    const http = await openHttp();
    try {
      const items = await scrapeHighlightById(http, id);
      await emit(items, options.out);
      if (options.download) {
        const fs = makeFs(options.root);
        const username = `highlight-${id}`;
        for (const story of items) {
          await fs.writeStory(username, story);
          const coverPath = fs.pathForStoryAsset(
            username,
            story.id,
            story.takenAt,
            `${story.id}.jpg`,
          );
          await downloadMediaToFile(http, story.imageUrl, coverPath);
          if (story.videoUrl) {
            const videoPath = fs.pathForStoryAsset(
              username,
              story.id,
              story.takenAt,
              `${story.id}.mp4`,
            );
            await downloadMediaToFile(http, story.videoUrl, videoPath);
          }
        }
        process.stdout.write(
          `Archived ${items.length} highlight item(s) to ${fs.root}/stories/${username}/\n`,
        );
      }
    } finally {
      await http.dispose();
    }
  },
);

scrapingCommand(
  "highlights <username>",
  "Discover and scrape ALL permanent Highlights albums of a profile.",
)
  .option(
    "--album <titles>",
    "Only albums whose title contains one of these (comma-separated, case-insensitive)",
  )
  .option("--since <date>", "Only items posted on/after this date (ISO, e.g. 2026-04-30)")
  .option(
    "--until <date>",
    "Only items posted on/before this date (ISO; a bare YYYY-MM-DD covers the whole day)",
  )
  .action(
    async (
      username: string,
      options: SharedOpts & { album?: string; since?: string; until?: string },
    ) => {
      const http = await openHttp();
      try {
        let albums = await scrapeHighlightsTray(http, username);
        process.stderr.write(`Found ${albums.length} highlight album(s) for @${username}\n`);

        // --album : keep only albums whose title matches a needle
        // (substring, case-insensitive). No flag → every album.
        const needles = (options.album ?? "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (needles.length > 0) {
          albums = albums.filter((a) => needles.some((n) => a.title.toLowerCase().includes(n)));
          process.stderr.write(`  → ${albums.length} album(s) match --album\n`);
        }

        // --since / --until : date window applied to each item's takenAt.
        const sinceMs = parseDateBound(options.since, false) ?? Number.NEGATIVE_INFINITY;
        const untilMs = parseDateBound(options.until, true) ?? Number.POSITIVE_INFINITY;
        const inWindow = (iso: string) => {
          const t = Date.parse(iso);
          return Number.isFinite(t) && t >= sinceMs && t <= untilMs;
        };

        const fs = options.download ? makeFs(options.root) : null;
        const result: Array<{ album: (typeof albums)[number]; items: unknown[] }> = [];
        for (const album of albums) {
          const all = await scrapeHighlightById(http, album.id);
          const items = all.filter((s) => inWindow(s.takenAt));
          process.stderr.write(
            `  "${album.title}" (${album.id}): ${items.length}/${all.length} item(s)\n`,
          );
          result.push({ album, items });
          if (fs) {
            const archiveName = `highlight-${album.id}`;
            for (const story of items) {
              await fs.writeStory(archiveName, story);
              const coverPath = fs.pathForStoryAsset(
                archiveName,
                story.id,
                story.takenAt,
                `${story.id}.jpg`,
              );
              await downloadMediaToFile(http, story.imageUrl, coverPath);
              if (story.videoUrl) {
                const videoPath = fs.pathForStoryAsset(
                  archiveName,
                  story.id,
                  story.takenAt,
                  `${story.id}.mp4`,
                );
                await downloadMediaToFile(http, story.videoUrl, videoPath);
              }
            }
          }
        }
        await emit(result, options.out);
        if (fs) {
          const total = result.reduce((n, r) => n + r.items.length, 0);
          process.stdout.write(
            `Archived ${total} highlight item(s) across ${result.length} album(s)\n`,
          );
        }
      } finally {
        await http.dispose();
      }
    },
  );

scrapingCommand("hashtag <tag>", "Scrape /explore/tags/{tag}/.").action(
  async (tag: string, options: SharedOpts) => {
    const http = await openHttp();
    try {
      const html = await http.fetchHtml(
        `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
      );
      const result = parseHashtagFromHtml(html, tag);
      if (!result) throw new Error(`No hashtag data found for #${tag}`);
      await emit(result, options.out);
    } finally {
      await http.dispose();
    }
  },
);

scrapingCommand("location <id>", "Scrape /explore/locations/{id}/.").action(
  async (id: string, options: SharedOpts) => {
    const http = await openHttp();
    try {
      const html = await http.fetchHtml(
        `https://www.instagram.com/explore/locations/${encodeURIComponent(id)}/`,
      );
      const result = parseLocationFromHtml(html, id);
      if (!result) throw new Error(`No location data found for id=${id}`);
      await emit(result, options.out);
    } finally {
      await http.dispose();
    }
  },
);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

function scrapingCommand(signature: string, description: string): Command {
  return program
    .command(signature)
    .description(description)
    .option("-o, --out <path>", "Write JSON to a file (default: stdout)")
    .option("--download", "Also download HD media to the FilesystemAdapter tree")
    .option("--root <dir>", `Archive root (default: ${DEFAULT_ROOT})`, DEFAULT_ROOT);
}

async function openHttp(): Promise<HttpClient> {
  const http = new HttpClient();
  await http.initWithStorageState(STATE_PATH);
  return http;
}

/**
 * Parse a `--since` / `--until` date bound to epoch ms. When `endOfDay`
 * is set, a bare `YYYY-MM-DD` is extended to 23:59:59.999 so `--until`
 * covers the whole day. Returns null when absent or unparseable.
 */
function parseDateBound(value: string | undefined, endOfDay: boolean): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return ms + 86_400_000 - 1;
  }
  return ms;
}

function makeFs(rootOpt: string | undefined): FilesystemAdapter {
  return new FilesystemAdapter(rootOpt ?? DEFAULT_ROOT);
}

async function emit(value: unknown, outPath: string | undefined): Promise<void> {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf-8");
    process.stdout.write(`Wrote ${outPath}\n`);
  } else {
    process.stdout.write(json);
  }
}
