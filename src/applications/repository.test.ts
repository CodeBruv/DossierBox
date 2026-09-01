import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyApplicationObjective } from "@/applications";
import { db } from "@/auth/database";
import { users } from "@/auth/schema";
import { createDocument } from "@/documents/repository";
import { documents } from "@/documents/schema";
import {
  associateDocumentWithApplication,
  createApplication,
  getOwnedApplication,
  getOwnedApplicationWithDocuments,
  listOwnedApplications,
} from "./repository";
import { applicationIntents, applications } from "./schema";

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeDatabase = databaseConfigured ? describe : describe.skip;

function objective() {
  return {
    ...emptyApplicationObjective("employment"),
    targetRole: "Systems Engineer",
    organisation: "Example Org",
    requestedDocuments: ["Curriculum Vitae"],
  };
}

async function createUser(prefix: string) {
  const id = `${prefix}-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email: `${id}@example.invalid` });
  return id;
}

describeDatabase("Application persistence boundary", () => {
  it("creates owned Applications with normalized Intent", async () => {
    const userId = await createUser("application-owner");
    try {
      const created = await createApplication(userId, { objective: objective() });
      expect(created.userId).toBe(userId);
      expect(created.status).toBe("draft");
      expect(created.intent).toMatchObject({
        kind: "employment",
        targetRole: "Systems Engineer",
        organisation: "Example Org",
        requestedDocuments: ["Curriculum Vitae"],
      });
      expect((await listOwnedApplications(userId)).map((row) => row.id)).toContain(created.id);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("rejects cross-user Application access and association", async () => {
    const ownerId = await createUser("application-owner");
    const otherId = await createUser("application-other");
    try {
      const application = await createApplication(ownerId, { objective: objective() });
      expect(await getOwnedApplication(otherId, application.id)).toBeNull();
      expect(await associateDocumentWithApplication(otherId, "missing-document", application.id)).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, ownerId));
      await db.delete(users).where(eq(users.id, otherId));
    }
  });

  it("creates a Document from an already-persisted Application without duplicating it", async () => {
    const userId = await createUser("document-owner");
    try {
      const application = await createApplication(userId, { objective: objective() });
      const before = await listOwnedApplications(userId);
      const document = await createDocument(userId, "professional_resume", {
        applicationId: application.id,
        presentationStyle: "classic",
      });

      expect(document.applicationId).toBe(application.id);
      expect(document.objective).toEqual(objective());
      expect(document.template).toBe("classic");
      expect(await listOwnedApplications(userId)).toHaveLength(before.length);

      const resumed = await getOwnedApplicationWithDocuments(userId, application.id);
      expect(resumed?.intent).toMatchObject({ kind: "employment", targetRole: "Systems Engineer" });
      expect(resumed?.documents.map((row) => row.id)).toEqual([document.id]);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("does not create a Document against another user's Application", async () => {
    const ownerId = await createUser("document-application-owner");
    const otherId = await createUser("document-application-other");
    try {
      const application = await createApplication(ownerId, { objective: objective() });
      await expect(createDocument(otherId, "professional_resume", {
        applicationId: application.id,
      })).rejects.toThrow("Document could not be created.");
      expect((await getOwnedApplicationWithDocuments(ownerId, application.id))?.documents).toHaveLength(0);
    } finally {
      await db.delete(users).where(eq(users.id, ownerId));
      await db.delete(users).where(eq(users.id, otherId));
    }
  });

  it("keeps the legacy document-led repository call compatible", async () => {
    const userId = await createUser("legacy-create-owner");
    try {
      const document = await createDocument(userId, "professional_resume", {
        objective: objective(),
      });
      expect(document.applicationId).toBeTruthy();
      expect(document.objective).toEqual(objective());
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("keeps legacy standalone Documents valid", async () => {
    const userId = await createUser("legacy-owner");
    const documentId = `legacy-${crypto.randomUUID()}`;
    try {
      await db.insert(documents).values({
        id: documentId,
        userId,
        type: "professional_cv",
        title: "Legacy draft",
        status: "draft",
        objective: null,
      });
      const loaded = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
      expect(loaded[0]?.applicationId).toBeNull();
      expect(loaded[0]?.template).toBe("classic");
      expect((await getOwnedApplicationWithDocuments(userId, "missing-application"))?.documents).toBeUndefined();
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("preserves one-to-one Intent persistence", async () => {
    const userId = await createUser("intent-owner");
    try {
      const application = await createApplication(userId, { objective: objective() });
      const rows = await db
        .select()
        .from(applicationIntents)
        .where(eq(applicationIntents.applicationId, application.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.pageLimit).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("uses the persisted Application aggregate with the expected status", async () => {
    const userId = await createUser("status-owner");
    try {
      const application = await createApplication(userId, { objective: objective() });
      const rows = await db.select().from(applications).where(eq(applications.id, application.id));
      expect(rows[0]?.status).toBe("draft");
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
