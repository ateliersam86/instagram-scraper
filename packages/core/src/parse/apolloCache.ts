/**
 * Apollo cache extractor.
 *
 * Instagram embeds GraphQL responses in `<script type="application/json">`
 * blobs in the page HTML. The payload is wrapped in `__bbox.result.data.<field>`
 * — sometimes multiple levels deep. We pre-filter scripts by checking that the
 * raw text contains the field name (cheap), then parse + walk to find the
 * matching node.
 *
 * Why a walker and not a fixed path: the bbox layout shifts (different surfaces
 * nest at different depths, and Instagram occasionally reshuffles). Walking is
 * O(N) over the parsed JSON which is fine here — these blobs are at most a few
 * hundred KB.
 */

const SCRIPT_TAG_REGEX = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;

export interface ApolloExtractOptions {
  /**
   * If true, return every match instead of the first one. Useful when a page
   * has multiple bbox blocks for the same field (e.g. paginated feeds where
   * each page chunk arrives in its own script tag).
   */
  all?: boolean;
}

/**
 * Extract the first node at `__bbox.result.data[fieldName]` from any
 * `<script type="application/json">` blob in the HTML.
 *
 * Returns null when no script contains the field.
 */
export function extractApolloCache<T = unknown>(html: string, fieldName: string): T | null {
  for (const candidate of iterateCandidateScripts(html, fieldName)) {
    const found = walkForField<T>(candidate, fieldName);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Same as {@link extractApolloCache} but returns every match across scripts.
 * Order matches the script tag order in the HTML.
 */
export function extractApolloCacheAll<T = unknown>(html: string, fieldName: string): T[] {
  const out: T[] = [];
  for (const candidate of iterateCandidateScripts(html, fieldName)) {
    walkCollectField<T>(candidate, fieldName, out);
  }
  return out;
}

/**
 * Lower-level helper: iterate over every `<script type="application/json">`
 * blob in the HTML, returning the parsed JSON. Skips scripts that don't
 * contain the keyword (cheap pre-filter) and silently skips ones that fail
 * to parse — Instagram occasionally serves blobs with custom escapes we
 * haven't seen yet, and we'd rather miss one than throw.
 */
function* iterateCandidateScripts(html: string, keyword: string): Generator<unknown> {
  SCRIPT_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = SCRIPT_TAG_REGEX.exec(html);
  while (match !== null) {
    const raw = match[1];
    if (raw?.includes(keyword)) {
      try {
        yield JSON.parse(raw) as unknown;
      } catch {
        // Unparseable blob — skip silently.
      }
    }
    match = SCRIPT_TAG_REGEX.exec(html);
  }
}

/**
 * Recursively walks `node`, returning the first value at
 * `__bbox.result.data[fieldName]` (or directly at `data[fieldName]` if a
 * `result.data` is found at any depth).
 */
function walkForField<T>(node: unknown, fieldName: string): T | undefined {
  const stack: unknown[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== "object") continue;

    const data = getResultData(current);
    if (data && Object.hasOwn(data, fieldName)) {
      const value = (data as Record<string, unknown>)[fieldName];
      if (value !== undefined && value !== null) return value as T;
    }

    // Don't descend into a node we just inspected as a bbox/result wrapper —
    // the inner `result.data` would otherwise re-match via the bbox-less
    // fallback in getResultData, double-counting the same payload.
    if (data) continue;

    if (Array.isArray(current)) {
      for (const child of current) stack.push(child);
    } else {
      for (const child of Object.values(current as Record<string, unknown>)) {
        stack.push(child);
      }
    }
  }
  return undefined;
}

/**
 * Like {@link walkForField} but pushes every match into `out` instead of
 * stopping at the first.
 */
function walkCollectField<T>(node: unknown, fieldName: string, out: T[]): void {
  const stack: unknown[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== "object") continue;

    const data = getResultData(current);
    if (data && Object.hasOwn(data, fieldName)) {
      const value = (data as Record<string, unknown>)[fieldName];
      if (value !== undefined && value !== null) out.push(value as T);
    }

    if (data) continue;

    if (Array.isArray(current)) {
      for (const child of current) stack.push(child);
    } else {
      for (const child of Object.values(current as Record<string, unknown>)) {
        stack.push(child);
      }
    }
  }
}

/**
 * Returns `node.__bbox.result.data` when the node is a bbox wrapper, or
 * `node.result.data` for the bbox-less variant (some surfaces drop the
 * wrapper), or null otherwise.
 */
function getResultData(node: unknown): unknown {
  if (node === null || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;

  const bbox = obj["__bbox"];
  if (bbox && typeof bbox === "object") {
    const result = (bbox as Record<string, unknown>)["result"];
    if (result && typeof result === "object") {
      const data = (result as Record<string, unknown>)["data"];
      if (data && typeof data === "object") return data;
    }
  }

  // Defensive: some surfaces include `result.data` without the bbox wrapper.
  const result = obj["result"];
  if (result && typeof result === "object") {
    const data = (result as Record<string, unknown>)["data"];
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  }

  return null;
}
