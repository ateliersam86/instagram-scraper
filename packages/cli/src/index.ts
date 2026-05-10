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
 *   instagram-scraper highlights <id>             scrape a permanent highlight album
 *   instagram-scraper hashtag <tag>               scrape /explore/tags/{tag}/
 *   instagram-scraper location <id>               scrape /explore/locations/{id}/
 *
 * Every scraping command accepts:
 *   -o <path>       write JSON to a file (default: stdout)
 *   --download      also download HD media to the FilesystemAdapter tree
 *   --root <dir>    archive root (default: ~/.local/share/instagram-scraper)
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
  scrapeHighlightById,
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
  .version("0.2.0");

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
