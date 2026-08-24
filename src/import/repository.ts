import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import type { ImportResult } from "./candidates";
import { documentImports } from "./schema";

/**
 * Storage for an upload between reading it and confirming it.
 *
 * Every function here is scoped by `userId` in the statement itself rather than checked
 * afterwards. An import holds someone's entire career history in a single JSONB column, and
 * its id travels in a URL, so "fetch by id, then compare the owner" is one forgotten
 * comparison away from handing one user another's document. Written this way, the query
 * cannot return a row the caller is not entitled to.
 *
 * `db.select`/`insert`/`delete` are used rather than the relational `db.query` API because
 * this table is not registered in the Drizzle schema — it has no relations worth traversing,
 * and registering it only to read one row back would put a user's uploaded career data into
 * the schema surface of every other query in the application.
 */

export type StoredDocumentImport = {
  readonly id: string;
  readonly filename: string;
  readonly format: string;
  readonly result: ImportResult;
  readonly createdAt: Date;
};

/**
 * Stores a reading, replacing any the same user left unconfirmed.
 *
 * One pending import per person, deliberately. An abandoned import is a full copy of
 * somebody's career document sitting in a table, so the useful lifetime of the previous one
 * ends the moment they upload another — and a product that quietly accumulated them would be
 * holding data it has no use for. It also removes a question the interface would otherwise
 * have to answer: there is never a list of imports to choose between.
 *
 * Both statements run in one transaction, so a failure cannot leave the user with neither
 * the old reading nor the new one.
 */
export async function createDocumentImport(input: {
  userId: string;
  filename: string;
  format: string;
  result: ImportResult;
}): Promise<string> {
  return db.transaction(async (transaction) => {
    await transaction.delete(documentImports).where(eq(documentImports.userId, input.userId));

    const [created] = await transaction
      .insert(documentImports)
      .values({
        userId: input.userId,
        filename: input.filename,
        format: input.format,
        result: input.result,
      })
      .returning({ id: documentImports.id });

    if (!created) {
      throw new Error("The scanned document could not be stored.");
    }

    return created.id;
  });
}

export async function getOwnedDocumentImport(
  userId: string,
  importId: string,
): Promise<StoredDocumentImport | undefined> {
  const [row] = await db
    .select({
      id: documentImports.id,
      filename: documentImports.filename,
      format: documentImports.format,
      result: documentImports.result,
      createdAt: documentImports.createdAt,
    })
    .from(documentImports)
    .where(and(eq(documentImports.id, importId), eq(documentImports.userId, userId)))
    .limit(1);

  return row;
}

/**
 * The user's pending import, if they have one.
 *
 * The upload screen asks this so it can offer to resume rather than silently discarding a
 * reading the person is halfway through checking. Ordered newest first for the same reason
 * the table has that index: there should only ever be one, and relying on that being true is
 * how a stray row becomes a wrong answer.
 */
export async function getPendingDocumentImport(
  userId: string,
): Promise<{ id: string; filename: string; createdAt: Date } | undefined> {
  const [row] = await db
    .select({
      id: documentImports.id,
      filename: documentImports.filename,
      createdAt: documentImports.createdAt,
    })
    .from(documentImports)
    .where(eq(documentImports.userId, userId))
    .orderBy(desc(documentImports.createdAt))
    .limit(1);

  return row;
}

export async function deleteOwnedDocumentImport(
  userId: string,
  importId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(documentImports)
    .where(and(eq(documentImports.id, importId), eq(documentImports.userId, userId)))
    .returning({ id: documentImports.id });

  return deleted.length > 0;
}
