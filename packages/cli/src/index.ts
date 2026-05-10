#!/usr/bin/env node
/**
 * @atelier/instagram-scraper-cli
 *
 * Commands:
 *   instagram-scraper auth login          interactive login (Playwright headed)
 *   instagram-scraper auth status         validate the stored session
 *   instagram-scraper profile <username>  scrape one profile
 *   instagram-scraper post <shortcode>    scrape one post / reel
 *   instagram-scraper stories <username>  scrape active 24h stories ring
 *
 * Session lives in `$IG_STATE` or `~/.config/instagram-scraper/storage-state.json`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  HttpClient,
  PersistentContextAuth,
  parsePostFromHtml,
  parseProfileFromHtml,
  scrapeStoriesForUser,
} from "@atelier/instagram-scraper-core";
import { Command } from "commander";

const DEFAULT_STATE = join(homedir(), ".config", "instagram-scraper", "storage-state.json");
const STATE_PATH = process.env["IG_STATE"] ?? DEFAULT_STATE;

const program = new Command();
program
  .name("instagram-scraper")
  .description(
    "Scrape Instagram profiles, posts, reels, and stories from an authenticated session.",
  )
  .version("0.1.0");

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

program
  .command("profile <username>")
  .description("Scrape a single Instagram profile (og:* + meta).")
  .option("-o, --out <path>", "Write JSON to a file (default: stdout)")
  .action(async (username: string, options: { out?: string }) => {
    const http = await openHttp();
    try {
      const html = await http.fetchHtml(
        `https://www.instagram.com/${encodeURIComponent(username)}/`,
      );
      const profile = parseProfileFromHtml(html, username);
      if (!profile) throw new Error(`No profile data found for ${username}`);
      await emit(profile, options.out);
    } finally {
      await http.dispose();
    }
  });

program
  .command("post <shortcode>")
  .description("Scrape a single post or reel by shortcode.")
  .option("-o, --out <path>", "Write JSON to a file (default: stdout)")
  .action(async (shortcode: string, options: { out?: string }) => {
    const http = await openHttp();
    try {
      const html = await http.fetchHtml(
        `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`,
      );
      const post = parsePostFromHtml(html, shortcode);
      if (!post) throw new Error(`No post data found for ${shortcode}`);
      await emit(post, options.out);
    } finally {
      await http.dispose();
    }
  });

program
  .command("stories <username>")
  .description("Scrape the 24h stories ring of a user (Playwright XHR capture).")
  .option("-o, --out <path>", "Write JSON to a file (default: stdout)")
  .action(async (username: string, options: { out?: string }) => {
    const http = await openHttp();
    try {
      const items = await scrapeStoriesForUser(http, username);
      await emit(items, options.out);
    } finally {
      await http.dispose();
    }
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

async function openHttp(): Promise<HttpClient> {
  const http = new HttpClient();
  await http.initWithStorageState(STATE_PATH);
  return http;
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
