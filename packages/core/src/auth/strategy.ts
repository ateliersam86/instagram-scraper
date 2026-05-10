import type { InstagramSessionCookies } from "../types/auth.ts";

/**
 * Authentication strategy. Implementations:
 * - {@link CookieImportAuth} — reads cookies from a JSON file or env vars.
 * - {@link PersistentContextAuth} — Playwright headed-on-first-run with a
 *   persistent storage state directory.
 */
export interface AuthStrategy {
  prepare(): Promise<void>;
  getCookies(): InstagramSessionCookies;
  /** ds_user_id from the session, when available. */
  getUserId(): string | undefined;
  dispose(): Promise<void>;
}
