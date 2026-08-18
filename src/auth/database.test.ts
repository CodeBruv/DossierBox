import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";
import { db } from "./database";
import {
  consumeAuthToken,
  inspectAuthToken,
  issueAuthToken,
} from "./tokens";
import { authRateLimits, users } from "./schema";
import { consumeRateLimit, digestLimiterKey } from "./rate-limit";

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeDatabase = databaseConfigured ? describe : describe.skip;

describeDatabase("authentication PostgreSQL primitives", () => {
  it("handles token issuance, superseding, lifecycle states, and one-time consumption", async () => {
    const userId = `slice-2-token-${crypto.randomUUID()}`;
    const email = `${userId}@example.invalid`;
    const now = new Date("2026-08-18T05:00:00.000Z");

    await db.insert(users).values({ id: userId, email });

    try {
      const first = await issueAuthToken({
        userId,
        purpose: "email_verification",
        expiresAt: new Date("2026-08-18T06:00:00.000Z"),
        now,
      });
      expect(await inspectAuthToken(first.token, "email_verification", now)).toMatchObject({
        status: "valid",
        userId,
      });

      const second = await issueAuthToken({
        userId,
        purpose: "email_verification",
        expiresAt: new Date("2026-08-18T07:00:00.000Z"),
        now,
      });
      expect(await inspectAuthToken(first.token, "email_verification", now)).toMatchObject({
        status: "consumed",
        userId,
      });
      expect(await inspectAuthToken(second.token, "password_reset", now)).toMatchObject({
        status: "wrong_purpose",
        userId,
      });

      const concurrentResults = await Promise.all(
        Array.from({ length: 8 }, () =>
          consumeAuthToken(second.token, "email_verification", now),
        ),
      );
      expect(concurrentResults.filter((result) => result.status === "valid")).toHaveLength(1);
      expect(concurrentResults.filter((result) => result.status === "consumed")).toHaveLength(7);

      const expired = await issueAuthToken({
        userId,
        purpose: "password_reset",
        expiresAt: new Date("2026-08-18T04:59:59.000Z"),
        now,
      });
      expect(await inspectAuthToken(expired.token, "password_reset", now)).toMatchObject({
        status: "expired",
        userId,
      });
      expect(await inspectAuthToken("missing-token", "password_reset", now)).toEqual({
        status: "not_found",
      });
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("enforces atomic counters and isolates actions, keys, and windows", async () => {
    const action = `slice-2-rate-${crypto.randomUUID()}`;
    const identifier = `person-${crypto.randomUUID()}@example.invalid`;
    const otherIdentifier = `other-${crypto.randomUUID()}@example.invalid`;
    const now = new Date("2026-08-18T05:10:30.000Z");
    const secret = process.env.NEXTAUTH_SECRET;

    if (!secret) {
      throw new Error("Authentication secret is not configured for the database test.");
    }

    const limiterKey = digestLimiterKey(identifier, secret);
    const otherLimiterKey = digestLimiterKey(otherIdentifier, secret);

    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          consumeRateLimit({
            action,
            identifier,
            maxAttempts: 3,
            windowMs: 60_000,
            now,
          }),
        ),
      );

      expect(results.filter((result) => result.allowed)).toHaveLength(3);
      expect(Math.max(...results.map((result) => result.attemptCount))).toBe(10);
      expect((await consumeRateLimit({
        action: `${action}-other-action`,
        identifier,
        maxAttempts: 1,
        windowMs: 60_000,
        now,
      })).allowed).toBe(true);
      expect((await consumeRateLimit({
        action,
        identifier: otherIdentifier,
        maxAttempts: 1,
        windowMs: 60_000,
        now,
      })).allowed).toBe(true);
      expect((await consumeRateLimit({
        action,
        identifier,
        maxAttempts: 1,
        windowMs: 60_000,
        now: new Date("2026-08-18T05:11:00.000Z"),
      })).allowed).toBe(true);
    } finally {
      await db
        .delete(authRateLimits)
        .where(
          and(
            eq(authRateLimits.action, action),
            eq(authRateLimits.limiterKey, limiterKey),
          ),
        );
      await db
        .delete(authRateLimits)
        .where(
          and(
            eq(authRateLimits.action, `${action}-other-action`),
            eq(authRateLimits.limiterKey, limiterKey),
          ),
        );
      await db
        .delete(authRateLimits)
        .where(
          and(
            eq(authRateLimits.action, action),
            eq(authRateLimits.limiterKey, otherLimiterKey),
          ),
        );
    }
  });
});
