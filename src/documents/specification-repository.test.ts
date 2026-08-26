import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/auth/database";
import { users } from "@/auth/schema";
import { profiles, skills } from "@/profile/schema";
import type { DocumentTypeKey } from "./catalogue";
import { documents } from "./schema";
import {
  createDocumentSpecification,
  getOwnedDocumentSpecification,
  listApplicationDocumentSpecifications,
  listDocumentSpecifications,
  transitionDocumentSpecification,
  updateDocumentSpecification,
} from "./specification-repository";
import { emptyApplicationObjective } from "@/applications/objective";
import { createApplication } from "@/applications/repository";
import { createApplicationPlan } from "@/applications/plans-repository";
import {
  createApplicationPackage,
  createPackageMember,
} from "@/applications/packages-repository";
import { createEvidence } from "@/applications/evidence-repository";
import {
  applicationPackageMembers,
  applicationPackages,
  applicationPlans,
  evidence,
} from "@/applications/planning-schema";
import { applications } from "@/applications/schema";
import { opportunities, requirements } from "@/applications/opportunity-schema";
import { documentSpecifications } from "./specification-schema";

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeDatabase = databaseConfigured ? describe : describe.skip;

async function createUser(prefix: string) {
  const id = `${prefix}-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email: `${id}@example.invalid` });
  const [profile] = await db.insert(profiles).values({ userId: id }).returning();
  return { id, profile: profile! };
}

async function deleteUserFixture(userId: string) {
  const members = await db
    .select({ id: applicationPackageMembers.id })
    .from(applicationPackageMembers)
    .innerJoin(
      applicationPackages,
      eq(applicationPackages.id, applicationPackageMembers.packageId),
    )
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(eq(applications.userId, userId));

  if (members.length > 0) {
    await db
      .delete(documentSpecifications)
      .where(inArray(documentSpecifications.packageMemberId, members.map((member) => member.id)));
  }
  await db.delete(users).where(eq(users.id, userId));
}

async function createPackageFixture(
  userId: string,
  documentType: DocumentTypeKey = "professional_resume",
) {
  const application = await createApplication(userId, {
    objective: emptyApplicationObjective("employment"),
  });
  const plan = await createApplicationPlan(userId, application.id, {
    status: "draft",
    resolutionSource: "deterministic",
    confirmation: "unconfirmed",
    recommendedDocuments: [documentType],
    requirementCoverage: {},
    evidenceCoverage: {},
    gapsSummary: {},
  });
  const applicationPackage = await createApplicationPackage(userId, plan!.id);
  const member = await createPackageMember(userId, applicationPackage!.id, {
    documentType,
    role: "primary",
    position: 0,
    availability: "available",
    specificationStatus: "not_started",
    completion: "planned",
  });
  return { application, plan: plan!, package: applicationPackage!, member: member! };
}

describeDatabase("Document Specification persistence boundary", () => {
  it("persists semantic intent, references, revisions, and lifecycle without changing Dossier facts", async () => {
    const owner = await createUser("spec-owner");
    try {
      const fixture = await createPackageFixture(owner.id);
      const [skill] = await db
        .insert(skills)
        .values({ profileId: owner.profile.id, name: "TypeScript", type: "technical" })
        .returning();
      const beforeSkill = await db.select().from(skills).where(eq(skills.id, skill!.id));
      const selectedEvidence = await createEvidence(owner.id, fixture.application.id, {
        sourceType: "skills",
        sourceRecordId: skill!.id,
        excerpt: "TypeScript",
      });
      const [requirement] = await db
        .insert(requirements)
        .values({
          applicationId: fixture.application.id,
          text: "Demonstrated TypeScript experience",
          category: "skill",
          priority: "required",
        })
        .returning();

      const first = await createDocumentSpecification(owner.id, fixture.member.id, {
        documentType: "professional_resume",
        purpose: "Present the strongest evidence for this role.",
        requirementIds: [requirement!.id],
        evidenceIds: [selectedEvidence!.id],
        constraints: { pages: 2 },
        sectionExpectations: { experience: "prioritise relevant work" },
        outputCharacteristics: { tone: "direct" },
      });
      expect(first).toMatchObject({
        packageMemberId: fixture.member.id,
        documentType: "professional_resume",
        revision: 1,
        purpose: "Present the strongest evidence for this role.",
        requirementIds: [requirement!.id],
        evidenceIds: [selectedEvidence!.id],
      });

      const second = await updateDocumentSpecification(owner.id, first!.id, {
        purpose: "Lead with evidence relevant to the role.",
        constraints: { pages: 2, spacing: "compact" },
      });
      expect(second).toMatchObject({ revision: 2, purpose: "Lead with evidence relevant to the role.", requirementIds: [requirement!.id] });
      expect(await getOwnedDocumentSpecification(owner.id, first!.id)).toMatchObject({ revision: 1 });
      expect(await listDocumentSpecifications(owner.id, fixture.member.id)).toHaveLength(2);
      expect(await listApplicationDocumentSpecifications(owner.id, fixture.application.id)).toHaveLength(2);

      expect(await transitionDocumentSpecification(owner.id, second!.id, "approved")).toBeNull();
      const reviewed = await transitionDocumentSpecification(owner.id, second!.id, "ready_for_review");
      expect(reviewed?.status).toBe("ready_for_review");
      const approved = await transitionDocumentSpecification(owner.id, second!.id, "approved");
      expect(approved?.status).toBe("approved");

      const afterSkill = await db.select().from(skills).where(eq(skills.id, skill!.id));
      expect(afterSkill).toEqual(beforeSkill);
      const [member] = await db
        .select()
        .from(applicationPackageMembers)
        .where(eq(applicationPackageMembers.id, fixture.member.id));
      expect(member?.specificationStatus).toBe("placeholder");
    } finally {
      await deleteUserFixture(owner.id);
    }
  }, 120_000);

  it("rejects cross-user, cross-Application, foreign-reference, invalid-type, and malformed-document access", async () => {
    const owner = await createUser("spec-boundary-owner");
    const other = await createUser("spec-boundary-other");
    try {
      const fixture = await createPackageFixture(owner.id);
      const foreignFixture = await createPackageFixture(owner.id, "professional_cv");
      const otherFixture = await createPackageFixture(other.id);
      const [foreignOpportunity] = await db
        .insert(opportunities)
        .values({ applicationId: foreignFixture.application.id, title: "Foreign role" })
        .returning();
      const [foreignRequirement] = await db
        .insert(requirements)
        .values({
          applicationId: foreignFixture.application.id,
          opportunityId: foreignOpportunity!.id,
          text: "Foreign requirement",
          category: "skill",
          priority: "required",
        })
        .returning();
      const [ownerForeignSkill] = await db
        .insert(skills)
        .values({ profileId: owner.profile.id, name: "Go", type: "technical" })
        .returning();
      const ownerForeignEvidence = await createEvidence(owner.id, foreignFixture.application.id, {
        sourceType: "skills",
        sourceRecordId: ownerForeignSkill!.id,
      });
      const [foreignSkill] = await db
        .insert(skills)
        .values({ profileId: other.profile.id, name: "Rust", type: "technical" })
        .returning();
      const foreignEvidence = await createEvidence(other.id, otherFixture.application.id, {
        sourceType: "skills",
        sourceRecordId: foreignSkill!.id,
      });

      expect(await createDocumentSpecification(other.id, fixture.member.id, {
        documentType: "professional_resume",
        purpose: "Should not be visible to another user.",
      })).toBeNull();
      expect(await createDocumentSpecification(owner.id, fixture.member.id, {
        documentType: "professional_resume",
        purpose: "Foreign references must be rejected.",
        opportunityId: foreignOpportunity!.id,
        requirementIds: [foreignRequirement!.id],
        evidenceIds: [ownerForeignEvidence!.id],
      })).toBeNull();
      expect(await createDocumentSpecification(owner.id, fixture.member.id, {
        documentType: "professional_resume",
        purpose: "Cross-user evidence must be rejected.",
        evidenceIds: [foreignEvidence!.id],
      })).toBeNull();
      expect(await createDocumentSpecification(owner.id, fixture.member.id, {
        documentType: "professional_cv",
        purpose: "Type must agree with package membership.",
      })).toBeNull();
      expect(await getOwnedDocumentSpecification(other.id, "missing-specification")).toBeNull();
      expect(await listDocumentSpecifications(other.id, fixture.member.id)).toEqual([]);
      expect(await listApplicationDocumentSpecifications(other.id, fixture.application.id)).toEqual([]);

      const created = await createDocumentSpecification(owner.id, fixture.member.id, {
        documentType: "professional_resume",
        purpose: "Valid specification.",
      });
      expect(await updateDocumentSpecification(other.id, created!.id, { purpose: "No access." })).toBeNull();
      expect(await transitionDocumentSpecification(other.id, created!.id, "ready_for_review")).toBeNull();

      const standalone = await db
        .insert(documents)
        .values({
          userId: owner.id,
          applicationId: null,
          type: "professional_resume",
          title: "Legacy standalone resume",
          objective: { kind: "employment", targetRole: "Engineer" },
        })
        .returning();
      expect(standalone[0]?.applicationId).toBeNull();
      expect(standalone[0]?.objective).toEqual({ kind: "employment", targetRole: "Engineer" });
      await db
        .update(applicationPackageMembers)
        .set({ documentId: standalone[0]!.id })
        .where(eq(applicationPackageMembers.id, fixture.member.id));
      expect(await createDocumentSpecification(owner.id, fixture.member.id, {
        documentType: "professional_resume",
        purpose: "Malformed produced-document ownership must be rejected.",
      })).toBeNull();
      expect(foreignFixture.member.id).not.toBe(fixture.member.id);
    } finally {
      await deleteUserFixture(owner.id);
      await deleteUserFixture(other.id);
    }
  }, 120_000);

  it("does not mutate Evidence source rows or create generated or presentation data", async () => {
    const owner = await createUser("spec-noninterference");
    try {
      const fixture = await createPackageFixture(owner.id);
      const [skill] = await db
        .insert(skills)
        .values({ profileId: owner.profile.id, name: "SQL", type: "technical" })
        .returning();
      const selectedEvidence = await createEvidence(owner.id, fixture.application.id, {
        sourceType: "skills",
        sourceRecordId: skill!.id,
        excerpt: "SQL",
      });
      const beforeEvidence = await db.select().from(evidence).where(eq(evidence.id, selectedEvidence!.id));
      const beforeDocuments = await db.select().from(documents).where(eq(documents.userId, owner.id));

      await createDocumentSpecification(owner.id, fixture.member.id, {
        documentType: "professional_resume",
        purpose: "Keep semantic intent independent from production.",
        evidenceIds: [selectedEvidence!.id],
      });

      expect(await db.select().from(evidence).where(eq(evidence.id, selectedEvidence!.id))).toEqual(beforeEvidence);
      expect(await db.select().from(documents).where(eq(documents.userId, owner.id))).toEqual(beforeDocuments);
    } finally {
      await deleteUserFixture(owner.id);
    }
  }, 120_000);
});
