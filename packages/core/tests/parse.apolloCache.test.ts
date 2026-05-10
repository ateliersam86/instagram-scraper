import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractApolloCache, extractApolloCacheAll } from "../src/parse/apolloCache.ts";

const FIELD = "xdt_api__v1__media__shortcode__web_info";

function wrapBbox(payload: unknown): string {
  return JSON.stringify({
    require: [
      [
        "ScheduledServerJS",
        "handle",
        null,
        [
          {
            __bbox: {
              require: [
                [
                  "RelayPrefetchedStreamCache",
                  "next",
                  [],
                  [
                    "adp_PolarisPostRootQueryRelayPreloader_anon",
                    {
                      __bbox: {
                        complete: true,
                        result: { data: { [FIELD]: payload } },
                      },
                    },
                  ],
                ],
              ],
            },
          },
        ],
      ],
    ],
  });
}

function htmlWith(...scripts: string[]): string {
  const tags = scripts.map((s) => `<script type="application/json">${s}</script>`).join("\n");
  return `<!doctype html><html><body>${tags}</body></html>`;
}

describe("extractApolloCache", () => {
  it("returns the payload nested inside __bbox.result.data[field]", () => {
    const html = htmlWith(wrapBbox({ items: [{ code: "ABC123" }] }));
    const result = extractApolloCache<{ items: { code: string }[] }>(html, FIELD);
    expect(result?.items[0]?.code).toBe("ABC123");
  });

  it("returns null when no script contains the field", () => {
    const html = htmlWith('{"unrelated":"payload"}', '{"another":{"thing":1}}');
    expect(extractApolloCache(html, FIELD)).toBeNull();
  });

  it("skips scripts that don't include the field keyword (pre-filter)", () => {
    const noise = '{"items":[{"x":1}]}'; // contains "items" but not FIELD
    const html = htmlWith(noise, wrapBbox({ items: [{ code: "REAL" }] }));
    const result = extractApolloCache<{ items: { code: string }[] }>(html, FIELD);
    expect(result?.items[0]?.code).toBe("REAL");
  });

  it("survives an unparseable script before the real one", () => {
    const broken = '{"oops": missing-quote }';
    const html = htmlWith(broken, wrapBbox({ items: [{ code: "OK" }] }));
    const result = extractApolloCache<{ items: { code: string }[] }>(html, FIELD);
    expect(result?.items[0]?.code).toBe("OK");
  });

  it("walks deep nesting without explicit __bbox.require chains", () => {
    // Surface drops bbox wrapper occasionally — just result.data.<field>
    const flat = JSON.stringify({
      whatever: { result: { data: { [FIELD]: { items: [{ code: "FLAT" }] } } } },
    });
    const html = htmlWith(flat);
    const result = extractApolloCache<{ items: { code: string }[] }>(html, FIELD);
    expect(result?.items[0]?.code).toBe("FLAT");
  });

  it("extractApolloCacheAll returns every match across multiple scripts", () => {
    const html = htmlWith(
      wrapBbox({ items: [{ code: "A" }] }),
      wrapBbox({ items: [{ code: "B" }] }),
      wrapBbox({ items: [{ code: "C" }] }),
    );
    const results = extractApolloCacheAll<{ items: { code: string }[] }>(html, FIELD);
    expect(results.map((r) => r.items[0]?.code)).toEqual(["A", "B", "C"]);
  });

  it("extracts the post web_info from the anonymized real-shape fixture", () => {
    const blob = readFileSync(new URL("./fixtures/post-bbox-anon.json", import.meta.url), "utf-8");
    const html = htmlWith(blob);
    type WebInfo = { items: Array<{ code: string; pk: string }> };
    const result = extractApolloCache<WebInfo>(html, FIELD);
    expect(result).not.toBeNull();
    expect(result?.items[0]?.code).toBe("FIXTUREcAR1");
    expect(result?.items[0]?.pk).toBe("3000000000000000001");
  });

  it("handles HTML where the script tag has extra attributes (data-*)", () => {
    const html = `<script data-sjs type="application/json" data-content-len="42">${wrapBbox({
      items: [{ code: "ATTR" }],
    })}</script>`;
    const result = extractApolloCache<{ items: { code: string }[] }>(html, FIELD);
    expect(result?.items[0]?.code).toBe("ATTR");
  });
});
