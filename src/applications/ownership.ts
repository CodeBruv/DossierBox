import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { applications } from "./schema";

export async function findOwnedApplication(userId: string, applicationId: string) {
  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);

  return application ?? null;
}
