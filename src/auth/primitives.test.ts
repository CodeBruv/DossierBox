import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashPassword, verifyPassword } from "./password";
import { digestLimiterKey, getRateLimitWindow } from "./rate-limit";
import { digestToken, generateOpaqueToken } from "./tokens";
import { normalizeEmail, validatePassword } from "./validation";

describe("authentication validation", () => {
  it("normalizes valid email addresses canonically", () => {
    expect(normalizeEmail("  Person.Name+tag@Example.COM  ")).toBe(
      "person.name+tag@example.com",
    );
  });

  it("rejects malformed, empty, and non-string email values", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("accepts password boundaries without composition rules", () => {
    expect(validatePassword("a".repeat(12)).success).toBe(true);
    expect(validatePassword("x".repeat(128)).success).toBe(true);
    expect(validatePassword("correct horse battery staple").success).toBe(true);
  });

  it("rejects passwords outside the length policy and non-strings", () => {
    expect(validatePassword("a".repeat(11)).success).toBe(false);
    expect(validatePassword("x".repeat(129)).success).toBe(false);
    expect(validatePassword(null).success).toBe(false);
  });
});

describe("Argon2id passwords", () => {
  it("creates salted Argon2id hashes and verifies only the correct password", async () => {
    const password = "correct horse battery staple";
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).toMatch(/^\$argon2id\$/);
    expect(firstHash).not.toBe(password);
    expect(secondHash).not.toBe(firstHash);
    await expect(verifyPassword(firstHash, password)).resolves.toBe(true);
    await expect(verifyPassword(firstHash, "incorrect password")).resolves.toBe(
      false,
    );
  });

  it("fails closed for malformed hashes", async () => {
    await expect(verifyPassword("not-an-argon-hash", "password")).resolves.toBe(
      false,
    );
  });
});

describe("opaque authentication tokens", () => {
  it("generates distinct 256-bit URL-safe values", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("digests tokens deterministically without retaining the raw value", () => {
    const token = generateOpaqueToken();
    const digest = digestToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(digestToken(token));
    expect(digest).not.toBe(token);
    expect(digestToken(generateOpaqueToken())).not.toBe(digest);
  });
});

describe("rate-limit derivation", () => {
  it("uses a keyed deterministic digest without retaining the identifier", () => {
    const identifier = "person@example.com";
    const digest = digestLimiterKey(identifier, "test-secret");

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(digestLimiterKey(identifier, "test-secret"));
    expect(digest).not.toContain(identifier);
    expect(digestLimiterKey(identifier, "other-secret")).not.toBe(digest);
  });

  it("calculates stable fixed windows", () => {
    const now = new Date("2026-08-18T04:38:45.000Z");
    const window = getRateLimitWindow(now, 60_000);

    expect(window.windowStart.toISOString()).toBe("2026-08-18T04:38:00.000Z");
    expect(window.resetAt.toISOString()).toBe("2026-08-18T04:39:00.000Z");
  });

  it("rejects invalid window durations", () => {
    expect(() => getRateLimitWindow(new Date(), 0)).toThrow(RangeError);
    expect(() => getRateLimitWindow(new Date(), 1.5)).toThrow(RangeError);
  });
});
