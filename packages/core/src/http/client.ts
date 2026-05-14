/**
 * Playwright-backed HTTP client for Instagram.
 *
 * Why Playwright over plain `fetch`:
 *  1. Instagram's web client is a SPA — most useful data loads via XHR
 *     **after** the initial HTML. Plain fetch only gets the shell.
 *  2. Instagram fingerprints TLS + HTTP/2 + browser headers. Plain
 *     `fetch` triggers checkpoints within a few requests.
 *  3. Stories specifically are XHR-only (no HTML representation), so a
 *     real browser is mandatory.
 *
 * What this client provides:
 *  - `page()` returns a Playwright Page bound to the authenticated context.
 *  - `goto(url)` navigates with per-request jitter + checkpoint detection.
 *  - `captureXhr(url, urlPattern)` navigates + records the first response
 *    whose URL matches `urlPattern`. Critical for stories.
 *
 * Per-request jitter defaults to 1-3 s (instagrapi-style). Configurable.
 *
 * Throws {@link CheckpointRequiredError} when Instagram redirects to
 * /challenge/ or /checkpoint/ — the user must reauthenticate via
 * `auth login` before retrying.
 */

import { CheckpointRequiredError, LoginRequiredError } from "../types/auth.ts";

const INSTAGRAM_BASE = "https://www.instagram.com";
const CHECKPOINT_PATTERN = /\/(challenge|checkpoint)\//;
const LOGIN_PATTERN = /\/accounts\/login/;

export type HttpClientOptions = {
  /** Min jitter delay in ms between consecutive requests. Default 1000. */
  minJitterMs?: number;
  /** Max jitter delay in ms. Default 3000. */
  maxJitterMs?: number;
  /** Timeout for individual page navigations. Default 30000. */
  navigationTimeoutMs?: number;
  /** Override the Playwright Browser used. If absent, the http client opens its own. */
  // biome-ignore lint/suspicious/noExplicitAny: Playwright's Browser type loaded at runtime
  browser?: any;
  /** Same for Playwright BrowserContext. Useful when sharing auth context. */
  // biome-ignore lint/suspicious/noExplicitAny: Playwright type loaded at runtime
  context?: any;
};

/**
 * Captured XHR response: status code, URL that matched, and parsed JSON body.
 */
export type CapturedResponse<T = unknown> = {
  url: string;
  status: number;
  body: T;
};

export class HttpClient {
  private readonly minJitterMs: number;
  private readonly maxJitterMs: number;
  private readonly navigationTimeoutMs: number;
  // biome-ignore lint/suspicious/noExplicitAny: Playwright dynamic
  private context: any;
  // biome-ignore lint/suspicious/noExplicitAny: Playwright dynamic
  private browser: any = null;
  private lastRequestAt = 0;

  constructor(options: HttpClientOptions = {}) {
    this.minJitterMs = options.minJitterMs ?? 1000;
    this.maxJitterMs = options.maxJitterMs ?? 3000;
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000;
    if (options.context) this.context = options.context;
    if (options.browser) this.browser = options.browser;
  }

  /**
   * Open the Playwright browser + context if not already initialized.
   * Caller passes the storage state file path from auth.
   */
  async initWithStorageState(storageStatePath: string): Promise<void> {
    if (this.context) return;
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      storageState: storageStatePath,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    });
  }

  /**
   * Navigate to a URL with jitter + checkpoint detection.
   * Returns the page so the caller can extract data.
   *
   * biome-ignore lint/suspicious/noExplicitAny: returns Playwright Page (typed at runtime).
   */
  // biome-ignore lint/suspicious/noExplicitAny: Playwright Page type
  async goto(url: string): Promise<any> {
    if (!this.context) {
      throw new Error("HttpClient not initialized — call initWithStorageState() first");
    }
    await this.sleepForJitter();
    const page = await this.context.newPage();
    await page.goto(url, {
      timeout: this.navigationTimeoutMs,
      waitUntil: "domcontentloaded",
    });
    this.lastRequestAt = Date.now();
    this.detectAuthFailure(page.url());
    return page;
  }

  /**
   * Navigate + capture the first XHR response matching a URL substring.
   * Essential for stories (which load via /api/v1/feed/reels_media/).
   *
   * Example:
   *   const reels = await http.captureXhr(
   *     "https://www.instagram.com/stories/loic__beau/",
   *     "/api/v1/feed/reels_media/"
   *   );
   */
  async captureXhr<T = unknown>(
    navigateUrl: string,
    urlPattern: string | RegExp,
  ): Promise<CapturedResponse<T>> {
    if (!this.context) {
      throw new Error("HttpClient not initialized — call initWithStorageState() first");
    }
    await this.sleepForJitter();
    const page = await this.context.newPage();
    const matchFn =
      typeof urlPattern === "string"
        ? (u: string) => u.includes(urlPattern)
        : (u: string) => urlPattern.test(u);

    const responsePromise = new Promise<CapturedResponse<T>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for XHR matching ${String(urlPattern)}`)),
        this.navigationTimeoutMs,
      );
      // biome-ignore lint/suspicious/noExplicitAny: Playwright Response type
      page.on("response", async (response: any) => {
        const u = String(response.url());
        if (!matchFn(u)) return;
        clearTimeout(timer);
        try {
          const body = (await response.json()) as T;
          resolve({ url: u, status: response.status(), body });
        } catch (err) {
          // Fall back to text if not JSON
          const text = await response.text().catch(() => "");
          reject(
            new Error(
              `Captured response from ${u} (${response.status()}) but body is not JSON: ${(err as Error).message}. Body[0..200]: ${text.slice(0, 200)}`,
            ),
          );
        }
      });
    });

    await page.goto(navigateUrl, {
      timeout: this.navigationTimeoutMs,
      waitUntil: "networkidle",
    });
    this.lastRequestAt = Date.now();
    this.detectAuthFailure(page.url());
    const result = await responsePromise;
    await page.close().catch(() => undefined);
    return result;
  }

  /**
   * Fetch the SSR HTML of a URL by navigating with a real Playwright Page.
   *
   * Instagram only embeds the Apollo bbox payload (`xdt_api__v1__*`
   * fields) when the request looks like a browser navigation; the
   * lighter `context.request.get` path receives the SPA shell with no
   * server-rendered data. So we open a Page, navigate, read HTML, close.
   *
   * Costs one extra ~1s page-open + close vs a plain request, but it's
   * the only path that returns the bbox we need to parse.
   */
  async fetchHtml(url: string): Promise<string> {
    if (!this.context) {
      throw new Error("HttpClient not initialized — call initWithStorageState() first");
    }
    await this.sleepForJitter();
    const page = await this.context.newPage();
    try {
      const response = await page.goto(url, {
        timeout: this.navigationTimeoutMs,
        waitUntil: "domcontentloaded",
      });
      this.lastRequestAt = Date.now();
      this.detectAuthFailure(page.url());
      if (response && response.status() >= 400) {
        throw new Error(`HTTP ${response.status()} on GET ${url}`);
      }
      return await page.content();
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * Fetch HTML and wait for at least one element matching `selector` to
   * be present (e.g. a grid card on a React-rendered profile page).
   * Falls back to `fetchHtml` semantics if the selector times out — we
   * still return whatever HTML is loaded.
   */
  async fetchHtmlWaitFor(
    url: string,
    selector: string,
    options?: { selectorTimeoutMs?: number; networkIdle?: boolean },
  ): Promise<string> {
    if (!this.context) {
      throw new Error("HttpClient not initialized — call initWithStorageState() first");
    }
    await this.sleepForJitter();
    const page = await this.context.newPage();
    try {
      const response = await page.goto(url, {
        timeout: this.navigationTimeoutMs,
        waitUntil: options?.networkIdle ? "networkidle" : "domcontentloaded",
      });
      this.lastRequestAt = Date.now();
      this.detectAuthFailure(page.url());
      if (response && response.status() >= 400) {
        throw new Error(`HTTP ${response.status()} on GET ${url}`);
      }
      try {
        await page.waitForSelector(selector, {
          timeout: options?.selectorTimeoutMs ?? 8_000,
        });
      } catch {
        // Selector didn't show — non-fatal, caller gets whatever rendered.
      }
      return await page.content();
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  /** Throws CheckpointRequiredError / LoginRequiredError when the URL indicates a failure. */
  private detectAuthFailure(finalUrl: string): void {
    if (CHECKPOINT_PATTERN.test(finalUrl)) {
      throw new CheckpointRequiredError();
    }
    if (LOGIN_PATTERN.test(finalUrl)) {
      throw new LoginRequiredError();
    }
  }

  private async sleepForJitter(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const target = randomBetween(this.minJitterMs, this.maxJitterMs);
    const wait = Math.max(0, target - elapsed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

export { INSTAGRAM_BASE };
