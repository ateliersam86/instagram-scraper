/**
 * Cookie-import auth — cheaper alternative to Playwright when you can paste
 * the `sessionid` from a logged-in browser. Less reliable long-term: the
 * cookie can rotate when Instagram detects unusual activity.
 */

import { AuthError, type InstagramSessionCookies } from "../types/auth.ts";
import type { AuthStrategy } from "./strategy.ts";

export type CookieImportAuthOptions = {
  /** `sessionid` cookie value. */
  sessionid: string;
  csrftoken?: string;
  ds_user_id?: string;
};

export class CookieImportAuth implements AuthStrategy {
  private readonly cookies: InstagramSessionCookies;
  private prepared = false;

  constructor(options: CookieImportAuthOptions) {
    if (!options.sessionid) {
      throw new AuthError("CookieImportAuth requires a `sessionid` value");
    }
    this.cookies = {
      sessionid: options.sessionid.trim(),
      ...(options.csrftoken ? { csrftoken: options.csrftoken.trim() } : {}),
      ...(options.ds_user_id ? { ds_user_id: options.ds_user_id.trim() } : {}),
    };
  }

  async prepare(): Promise<void> {
    // No async work — just validate shape. (Network validation could be
    // added later via GET /accounts/edit/ but we want this strategy cheap.)
    this.prepared = true;
  }

  getCookies(): InstagramSessionCookies {
    if (!this.prepared) throw new AuthError("Call prepare() before getCookies()");
    return this.cookies;
  }

  getUserId(): string | undefined {
    return this.cookies.ds_user_id;
  }

  async dispose(): Promise<void> {
    // stateless
  }
}

/** Build a cookie header string from session cookies. */
export function serializeCookies(cookies: InstagramSessionCookies): string {
  return Object.entries(cookies)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
