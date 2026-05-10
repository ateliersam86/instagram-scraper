/**
 * Playwright persistent-context auth — the recommended path for Instagram.
 *
 * On first run, opens a Chromium window for the user to log in (handles
 * 2FA + the "Save login info?" prompt + any captchas). The browser
 * context is saved to disk via Playwright's `storageState` so subsequent
 * runs are headless and reuse the session.
 *
 * Survives much longer than naked cookies — Instagram sessions in
 * persistent contexts seem to stay alive for months when the same
 * fingerprint connects.
 */

import {
  AuthError,
  CheckpointRequiredError,
  type InstagramSessionCookies,
  LoginRequiredError,
} from "../types/auth.ts";
import type { AuthStrategy } from "./strategy.ts";

export type PersistentContextAuthOptions = {
  /** Path to the Playwright `storageState` JSON. Default: `.auth/instagram-storage-state.json`. */
  storageStatePath?: string;
  forceLogin?: boolean;
  /** Time to wait (ms) for the user to complete login. Default 5 min. */
  loginTimeoutMs?: number;
  /** Show the browser on first run. Default true. */
  headedOnFirstRun?: boolean;
  userAgent?: string;
};

const INSTAGRAM_LOGIN_URL = "https://www.instagram.com/accounts/login/";
const INSTAGRAM_HOME_URL = "https://www.instagram.com/";
const INSTAGRAM_CHECKPOINT_REGEX = /\/(challenge|checkpoint)\//;

export class PersistentContextAuth implements AuthStrategy {
  private readonly options: Required<PersistentContextAuthOptions>;
  private cookies: InstagramSessionCookies | null = null;
  private userId: string | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Playwright's Browser type is loaded dynamically
  private browser: any = null;

  constructor(options: PersistentContextAuthOptions = {}) {
    this.options = {
      storageStatePath: options.storageStatePath ?? "./.auth/instagram-storage-state.json",
      forceLogin: options.forceLogin ?? false,
      loginTimeoutMs: options.loginTimeoutMs ?? 5 * 60_000,
      headedOnFirstRun: options.headedOnFirstRun ?? true,
      userAgent:
        options.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    };
  }

  async prepare(): Promise<void> {
    const { chromium } = await import("playwright");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const stateDir = path.dirname(this.options.storageStatePath);
    await fs.mkdir(stateDir, { recursive: true });

    const stateExists =
      !this.options.forceLogin && (await fileExists(this.options.storageStatePath));

    this.browser = await chromium.launch({
      headless: !this.options.headedOnFirstRun || stateExists,
    });

    const contextOptions: Record<string, unknown> = { userAgent: this.options.userAgent };
    if (stateExists) contextOptions.storageState = this.options.storageStatePath;

    // biome-ignore lint/suspicious/noExplicitAny: Playwright's BrowserContext type loaded dynamically
    const context: any = await this.browser.newContext(contextOptions);
    const page = await context.newPage();

    let needsLogin = !stateExists;
    if (stateExists) {
      await page.goto(INSTAGRAM_HOME_URL, { waitUntil: "domcontentloaded" });
      const url = page.url();
      if (INSTAGRAM_CHECKPOINT_REGEX.test(url)) {
        await context.close();
        await this.browser.close();
        this.browser = null;
        throw new CheckpointRequiredError();
      }
      if (url.includes("/accounts/login")) needsLogin = true;
    }

    if (needsLogin) {
      if (!this.options.headedOnFirstRun) {
        await context.close();
        await this.browser.close();
        this.browser = null;
        throw new LoginRequiredError(
          "No saved session and headedOnFirstRun is false — cannot prompt user for login",
        );
      }
      await page.goto(INSTAGRAM_LOGIN_URL, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForURL((url: URL) => !url.pathname.startsWith("/accounts/login"), {
          timeout: this.options.loginTimeoutMs,
        });
      } catch (err) {
        await context.close();
        await this.browser.close();
        this.browser = null;
        throw new AuthError(`Login did not complete within ${this.options.loginTimeoutMs}ms`, err);
      }
      // Sanity: avoid checkpoint after login
      if (INSTAGRAM_CHECKPOINT_REGEX.test(page.url())) {
        await context.close();
        await this.browser.close();
        this.browser = null;
        throw new CheckpointRequiredError();
      }
      await context.storageState({ path: this.options.storageStatePath });
    }

    const allCookies = (await context.cookies("https://www.instagram.com")) as Array<{
      name: string;
      value: string;
    }>;
    const find = (name: string) => allCookies.find((c) => c.name === name)?.value;

    const sessionid = find("sessionid");
    if (!sessionid) {
      await context.close();
      await this.browser.close();
      this.browser = null;
      throw new AuthError("Could not extract `sessionid` cookie after login");
    }

    this.cookies = {
      sessionid,
      ...(find("csrftoken") ? { csrftoken: find("csrftoken") as string } : {}),
      ...(find("ds_user_id") ? { ds_user_id: find("ds_user_id") as string } : {}),
      ...(find("ig_did") ? { ig_did: find("ig_did") as string } : {}),
      ...(find("mid") ? { mid: find("mid") as string } : {}),
    };
    this.userId = find("ds_user_id");

    await context.close();
  }

  getCookies(): InstagramSessionCookies {
    if (!this.cookies) throw new AuthError("Call prepare() before getCookies()");
    return this.cookies;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

async function fileExists(path: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
