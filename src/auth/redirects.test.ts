import { describe, expect, it } from "vitest";
import { buildSignInUrl, getSafeRedirect } from "./redirects";

describe("safe authentication redirects", () => {
  it("keeps valid internal paths", () => {
    expect(getSafeRedirect("/account?tab=identity#details")).toBe(
      "/account?tab=identity#details",
    );
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(getSafeRedirect("https://example.com/account")).toBe("/account");
    expect(getSafeRedirect("//example.com/account")).toBe("/account");
  });

  it("uses the default for missing or malformed values", () => {
    expect(getSafeRedirect(null)).toBe("/account");
    expect(getSafeRedirect("account")).toBe("/account");
  });

  it("encodes the callback URL into the sign-in route", () => {
    expect(buildSignInUrl("/account?source=header")).toBe(
      "/auth/sign-in?callbackUrl=%2Faccount%3Fsource%3Dheader",
    );
  });
});
