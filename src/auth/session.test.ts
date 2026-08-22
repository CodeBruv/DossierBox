import { describe, expect, it } from "vitest";
import { isSessionCookieName } from "./session";

/**
 * These names are not arbitrary — they are Auth.js's own cookie names, taken from
 * @auth/core's cookie defaults. If the library changes them, these tests are the
 * place that should fail, because the symptom in the product would otherwise be
 * signed-in users silently appearing signed out.
 */
describe("isSessionCookieName", () => {
  it("recognises the development cookie", () => {
    expect(isSessionCookieName("authjs.session-token")).toBe(true);
  });

  it("recognises the secure cookie used on deployed environments", () => {
    expect(isSessionCookieName("__Secure-authjs.session-token")).toBe(true);
  });

  it("recognises the chunks of a large session cookie", () => {
    // Auth.js splits oversized cookies by appending .0, .1, ... An equality-only
    // check would treat a chunked session as no session at all.
    expect(isSessionCookieName("authjs.session-token.0")).toBe(true);
    expect(isSessionCookieName("authjs.session-token.1")).toBe(true);
    expect(isSessionCookieName("__Secure-authjs.session-token.0")).toBe(true);
  });

  it("ignores the other Auth.js cookies", () => {
    // These accompany a sign-in attempt but do not indicate an active session, so
    // matching them would reintroduce the database read for anonymous visitors
    // part-way through the OAuth flow.
    expect(isSessionCookieName("authjs.csrf-token")).toBe(false);
    expect(isSessionCookieName("authjs.callback-url")).toBe(false);
    expect(isSessionCookieName("authjs.pkce.code_verifier")).toBe(false);
    expect(isSessionCookieName("__Host-authjs.csrf-token")).toBe(false);
  });

  it("ignores unrelated and lookalike cookies", () => {
    expect(isSessionCookieName("dossierbox-theme")).toBe(false);
    expect(isSessionCookieName("")).toBe(false);
    // A prefix match in the wrong direction would accept these.
    expect(isSessionCookieName("authjs.session-tokenized")).toBe(false);
    expect(isSessionCookieName("not-authjs.session-token")).toBe(false);
  });
});
