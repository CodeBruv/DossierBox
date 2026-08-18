import "server-only";

import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./database";
import { authRateLimits } from "./schema";

export type RateLimitResult = {
  allowed: boolean;
  attemptCount: number;
  limit: number;
  windowStart: Date;
  resetAt: Date;
};

export function digestLimiterKey(identifier: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(identifier, "utf8")
    .digest("hex");
}

export function getRateLimitWindow(now: Date, windowMs: number): {
  windowStart: Date;
  resetAt: Date;
} {
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new RangeError("Rate-limit window must be a positive integer.");
  }

  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);

  return {
    windowStart,
    resetAt: new Date(windowStartMs + windowMs),
  };
}

export async function consumeRateLimit(input: {
  action: string;
  identifier: string;
  maxAttempts: number;
  windowMs: number;
  now?: Date;
}): Promise<RateLimitResult> {
  if (!input.action || !input.identifier) {
    throw new TypeError("Rate-limit action and identifier are required.");
  }

  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
    throw new RangeError("Rate-limit maximum attempts must be a positive integer.");
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Authentication secret is not configured.");
  }

  const now = input.now ?? new Date();
  const { windowStart, resetAt } = getRateLimitWindow(now, input.windowMs);
  const limiterKey = digestLimiterKey(input.identifier, secret);

  const [record] = await db
    .insert(authRateLimits)
    .values({
      action: input.action,
      limiterKey,
      windowStart,
      expiresAt: resetAt,
      attemptCount: 1,
    })
    .onConflictDoUpdate({
      target: [
        authRateLimits.action,
        authRateLimits.limiterKey,
        authRateLimits.windowStart,
      ],
      set: {
        attemptCount: sql`${authRateLimits.attemptCount} + 1`,
      },
    })
    .returning({
      attemptCount: authRateLimits.attemptCount,
      expiresAt: authRateLimits.expiresAt,
    });

  if (!record) {
    throw new Error("Rate-limit counter was not recorded.");
  }

  return {
    allowed: record.attemptCount <= input.maxAttempts,
    attemptCount: record.attemptCount,
    limit: input.maxAttempts,
    windowStart,
    resetAt: record.expiresAt,
  };
}
