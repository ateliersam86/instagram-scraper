import { describe, expect, it } from "vitest";
import { CookieImportAuth, serializeCookies } from "../src/auth/cookieImport.ts";
import { AuthError } from "../src/types/auth.ts";

describe("CookieImportAuth", () => {
  it("requires sessionid", () => {
    expect(() => new CookieImportAuth({ sessionid: "" })).toThrow(AuthError);
  });

  it("returns cookies after prepare()", async () => {
    const auth = new CookieImportAuth({
      sessionid: "abc123",
      csrftoken: "csrf-xyz",
      ds_user_id: "12345",
    });
    await auth.prepare();
    expect(auth.getCookies()).toEqual({
      sessionid: "abc123",
      csrftoken: "csrf-xyz",
      ds_user_id: "12345",
    });
    expect(auth.getUserId()).toBe("12345");
  });

  it("throws if getCookies called before prepare()", () => {
    const auth = new CookieImportAuth({ sessionid: "abc" });
    expect(() => auth.getCookies()).toThrow(AuthError);
  });
});

describe("serializeCookies", () => {
  it("builds a Cookie header string", () => {
    const header = serializeCookies({
      sessionid: "abc",
      csrftoken: "xyz",
      ds_user_id: "1",
    });
    expect(header).toBe("sessionid=abc; csrftoken=xyz; ds_user_id=1");
  });

  it("omits undefined fields", () => {
    const header = serializeCookies({ sessionid: "abc" });
    expect(header).toBe("sessionid=abc");
  });
});
