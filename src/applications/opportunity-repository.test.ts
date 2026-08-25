import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emptyApplicationObjective } from "@/applications";
import { createApplication } from "@/applications/repository";
import {
  createOpportunity,
  createOpportunitySource,
  createRequirement,
  deleteOwnedOpportunity,
  getOwnedOpportunity,
  getOwnedOpportunitySource,
  getOwnedRequirement,
  listApplicationOpportunities,
  listApplicationRequirements,
  listOpportunityRequirements,
  updateOwnedOpportunity,
  updateOwnedRequirement,
} from "@/applications/opportunity-repository";
import { db } from "@/auth/database";
import { users } from "@/auth/schema";

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeDatabase = databaseConfigured ? describe : describe.skip;

function objective() {
  return emptyApplicationObjective("employment");
}

async function createUser(prefix: string) {
  const id = `${prefix}-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email: `${id}@example.invalid` });
  return id;
}

describeDatabase("Opportunity and Requirement persistence boundary", () => {
  it("creates, retrieves, lists, updates, and deletes an owned Opportunity", async () => {
    const userId = await createUser("opportunity-owner");
    try {
      const application = await createApplication(userId, { objective: objective() });
      const created = await createOpportunity(userId, application.id, {
        title: "Senior Platform Engineer",
        role: "Senior Platform Engineer",
        organisation: "Example Org",
        location: "Remote",
        country: "Nigeria",
        sourceType: "manual",
        interpretationStatus: "uninterpreted",
      });

      expect(created?.applicationId).toBe(application.id);
      expect(await getOwnedOpportunity(userId, created!.id)).toMatchObject({
        title: "Senior Platform Engineer",
        organisation: "Example Org",
      });
      expect((await listApplicationOpportunities(userId, application.id)).map((row) => row.id)).toContain(
        created!.id,
      );

      const updated = await updateOwnedOpportunity(userId, created!.id, {
        instructions: "Submit a two-page resume.",
        interpretationStatus: "extracted",
      });
      expect(updated?.instructions).toBe("Submit a two-page resume.");
      expect(await deleteOwnedOpportunity(userId, created!.id)).toBe(true);
      expect(await getOwnedOpportunity(userId, created!.id)).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("rejects cross-user Opportunity access and prevents foreign Application attachment", async () => {
    const ownerId = await createUser("opportunity-owner");
    const otherId = await createUser("opportunity-other");
    try {
      const application = await createApplication(ownerId, { objective: objective() });
      const otherApplication = await createApplication(otherId, { objective: objective() });
      const opportunity = await createOpportunity(ownerId, application.id, {
        title: "Private opportunity",
        sourceType: "manual",
      });

      expect(await getOwnedOpportunity(otherId, opportunity!.id)).toBeNull();
      expect(await listApplicationOpportunities(otherId, application.id)).toEqual([]);
      expect(
        await createOpportunity(otherId, application.id, { title: "Invalid", sourceType: "manual" }),
      ).toBeNull();
      expect(
        await createOpportunity(ownerId, otherApplication.id, { title: "Invalid", sourceType: "manual" }),
      ).toBeNull();
      expect(await updateOwnedOpportunity(otherId, opportunity!.id, { title: "Tampered" })).toBeNull();
      expect(await deleteOwnedOpportunity(otherId, opportunity!.id)).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, ownerId));
      await db.delete(users).where(eq(users.id, otherId));
    }
  });

  it("persists source metadata through the owning Opportunity", async () => {
    const userId = await createUser("source-owner");
    try {
      const application = await createApplication(userId, { objective: objective() });
      const opportunity = await createOpportunity(userId, application.id, {
        title: "Source-backed opportunity",
        sourceType: "pasted_text",
      });
      const source = await createOpportunitySource(userId, opportunity!.id, {
        sourceType: "pasted_text",
        sourceReference: "user-paste-1",
        contentFingerprint: "sha256:test",
        extractedContentStatus: "available",
      });

      expect(await getOwnedOpportunitySource(userId, source!.id)).toMatchObject({
        sourceReference: "user-paste-1",
        contentFingerprint: "sha256:test",
        extractedContentStatus: "available",
      });
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("preserves Requirement provenance and allows requirements without evidence or an Opportunity", async () => {
    const userId = await createUser("requirement-owner");
    try {
      const application = await createApplication(userId, { objective: objective() });
      const opportunity = await createOpportunity(userId, application.id, {
        title: "Requirements opportunity",
        sourceType: "pasted_text",
      });
      const source = await createOpportunitySource(userId, opportunity!.id, {
        sourceType: "pasted_text",
        sourceReference: "paste-2",
      });
      const requirement = await createRequirement(userId, application.id, {
        opportunityId: opportunity!.id,
        sourceId: source!.id,
        text: "3 years of project management experience",
        category: "experience",
        priority: "required",
        sourceReference: "paste-2, paragraph 4",
        confidence: 0.91,
        interpretationStatus: "extracted",
        normalizedInterpretation: "At least three years of project management experience.",
        constraints: { minimumYears: 3 },
      });
      const manualRequirement = await createRequirement(userId, application.id, {
        text: "Submit as PDF",
        category: "format",
        interpretationStatus: "user_confirmed",
      });

      expect(await getOwnedRequirement(userId, requirement!.id)).toMatchObject({
        text: "3 years of project management experience",
        sourceId: source!.id,
        confidence: 0.91,
        interpretationStatus: "extracted",
      });
      expect((await listOpportunityRequirements(userId, opportunity!.id)).map((row) => row.id)).toEqual([
        requirement!.id,
      ]);
      expect((await listApplicationRequirements(userId, application.id)).map((row) => row.id)).toEqual([
        requirement!.id,
        manualRequirement!.id,
      ]);
      expect((await updateOwnedRequirement(userId, requirement!.id, { interpretationStatus: "user_corrected" }))?.interpretationStatus).toBe(
        "user_corrected",
      );
      expect(manualRequirement?.opportunityId).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("rejects cross-user Requirements and does not allow evidence-era statuses yet", async () => {
    const ownerId = await createUser("requirement-owner");
    const otherId = await createUser("requirement-other");
    try {
      const application = await createApplication(ownerId, { objective: objective() });
      const otherApplication = await createApplication(otherId, { objective: objective() });
      const requirement = await createRequirement(ownerId, application.id, {
        text: "A required credential",
        category: "credential",
        interpretationStatus: "user_confirmed",
      });

      expect(await getOwnedRequirement(otherId, requirement!.id)).toBeNull();
      expect(await listApplicationRequirements(otherId, application.id)).toEqual([]);
      expect(await createRequirement(otherId, application.id, { text: "Foreign", category: "other" })).toBeNull();
      expect(await createRequirement(ownerId, otherApplication.id, { text: "Foreign", category: "other" })).toBeNull();
      await expect(
        createRequirement(ownerId, application.id, {
          text: "Unmatched claim",
          category: "skill",
          interpretationStatus: "satisfied",
        }),
      ).rejects.toThrow("Evidence boundary");
      await expect(
        updateOwnedRequirement(ownerId, requirement!.id, { interpretationStatus: "gap" }),
      ).rejects.toThrow("Evidence boundary");
    } finally {
      await db.delete(users).where(eq(users.id, ownerId));
      await db.delete(users).where(eq(users.id, otherId));
    }
  });
});
