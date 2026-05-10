import { describe, expect, it } from "vitest";
import { HttpClient } from "../src/http/client.ts";

describe("HttpClient (constructor + dispose without browser)", () => {
  it("constructs without crashing", () => {
    const client = new HttpClient({ minJitterMs: 50, maxJitterMs: 100 });
    expect(client).toBeDefined();
  });

  it("dispose() is idempotent when no browser is open", async () => {
    const client = new HttpClient();
    await client.dispose();
    await client.dispose(); // second call must not throw
  });

  it("throws when goto() is called before init", async () => {
    const client = new HttpClient();
    await expect(client.goto("https://www.instagram.com/")).rejects.toThrow(/not initialized/);
  });

  it("throws when captureXhr() is called before init", async () => {
    const client = new HttpClient();
    await expect(
      client.captureXhr("https://www.instagram.com/stories/x/", "/api/v1/feed/reels_media/"),
    ).rejects.toThrow(/not initialized/);
  });
});

describe("HttpClient — jitter behavior", () => {
  it("waits for the configured jitter window between requests", async () => {
    const client = new HttpClient({ minJitterMs: 100, maxJitterMs: 100 });
    // Fake an internal state — use any-cast since we test private behavior
    // biome-ignore lint/suspicious/noExplicitAny: testing private state intentionally
    (client as any).lastRequestAt = Date.now();
    const t0 = Date.now();
    // biome-ignore lint/suspicious/noExplicitAny: invoke private method
    await (client as any).sleepForJitter();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(80); // allow timer jitter
    expect(elapsed).toBeLessThan(200);
  });

  it("does not wait when lastRequestAt is in the distant past", async () => {
    const client = new HttpClient({ minJitterMs: 500, maxJitterMs: 500 });
    // biome-ignore lint/suspicious/noExplicitAny: testing private state
    (client as any).lastRequestAt = Date.now() - 10_000;
    const t0 = Date.now();
    // biome-ignore lint/suspicious/noExplicitAny: invoke private method
    await (client as any).sleepForJitter();
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
