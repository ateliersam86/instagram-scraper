/**
 * @atelier/instagram-scraper-core
 *
 * Public API barrel. Phase 0 bootstrap — only auth + types are wired up.
 * Parsers (profile / post / reel / story) land in subsequent phases.
 */

export type { AuthStrategy } from "./auth/strategy.ts";
export {
  CookieImportAuth,
  serializeCookies,
} from "./auth/cookieImport.ts";
export type { CookieImportAuthOptions } from "./auth/cookieImport.ts";
export { PersistentContextAuth } from "./auth/persistentContext.ts";
export type { PersistentContextAuthOptions } from "./auth/persistentContext.ts";

export {
  AuthError,
  CheckpointRequiredError,
  LoginRequiredError,
} from "./types/auth.ts";
export type { InstagramSessionCookies } from "./types/auth.ts";
export type { InstagramProfile } from "./types/profile.ts";
export type {
  InstagramLocation,
  InstagramPost,
  InstagramPostMedia,
  InstagramStoryItem,
} from "./types/post.ts";
