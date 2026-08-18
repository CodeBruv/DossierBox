import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./database";
import { authTokens } from "./schema";

export const authTokenPurposes = [
  "email_verification",
  "password_reset",
] as const;

export type AuthTokenPurpose = (typeof authTokenPurposes)[number];

export type TokenStatus =
  | "valid"
  | "not_found"
  | "expired"
  | "consumed"
  | "wrong_purpose";

export type TokenInspection = {
  status: TokenStatus;
  tokenId?: string;
  userId?: string;
};

export type IssuedToken = {
  token: string;
  expiresAt: Date;
};

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function issueAuthToken(input: {
  userId: string;
  purpose: AuthTokenPurpose;
  expiresAt: Date;
  now?: Date;
}): Promise<IssuedToken> {
  const now = input.now ?? new Date();
  const token = generateOpaqueToken();
  const tokenHash = digestToken(token);

  await db.transaction(async (transaction) => {
    await transaction
      .update(authTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authTokens.userId, input.userId),
          eq(authTokens.purpose, input.purpose),
          isNull(authTokens.consumedAt),
        ),
      );

    await transaction.insert(authTokens).values({
      userId: input.userId,
      purpose: input.purpose,
      tokenHash,
      expiresAt: input.expiresAt,
      createdAt: now,
    });
  });

  return { token, expiresAt: input.expiresAt };
}

export async function inspectAuthToken(
  token: string,
  purpose: AuthTokenPurpose,
  now = new Date(),
): Promise<TokenInspection> {
  const [record] = await db
    .select({
      id: authTokens.id,
      userId: authTokens.userId,
      purpose: authTokens.purpose,
      expiresAt: authTokens.expiresAt,
      consumedAt: authTokens.consumedAt,
    })
    .from(authTokens)
    .where(eq(authTokens.tokenHash, digestToken(token)))
    .limit(1);

  if (!record) {
    return { status: "not_found" };
  }

  const identity = { tokenId: record.id, userId: record.userId };

  if (record.purpose !== purpose) {
    return { status: "wrong_purpose", ...identity };
  }

  if (record.consumedAt) {
    return { status: "consumed", ...identity };
  }

  if (record.expiresAt <= now) {
    return { status: "expired", ...identity };
  }

  return { status: "valid", ...identity };
}

export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose,
  now = new Date(),
): Promise<TokenInspection> {
  const tokenHash = digestToken(token);

  const [consumed] = await db
    .update(authTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ id: authTokens.id, userId: authTokens.userId });

  if (consumed) {
    return {
      status: "valid",
      tokenId: consumed.id,
      userId: consumed.userId,
    };
  }

  return inspectAuthToken(token, purpose, now);
}
