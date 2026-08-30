import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/auth/database";
import { users } from "@/auth/schema";
import { profiles, skills } from "@/profile/schema";
import { emptyApplicationObjective } from "./objective";
import { createApplication } from "./repository";
import { createRequirement } from "./opportunity-repository";
import { createEvidence, getOwnedEvidence, listApplicationEvidence, listSelectableDossierEvidence } from "./evidence-repository";
import { createMatchingResult, getOwnedMatchingResult } from "./matching-repository";
import { createGap, getOwnedGap, updateOwnedGap } from "./gaps-repository";
import { createApplicationPlan, getOwnedApplicationPlan } from "./plans-repository";
import { createApplicationPackage, createPackageMember, getOwnedApplicationPackage, listApplicationPackages, listPackageMembers } from "./packages-repository";

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeDatabase = databaseConfigured ? describe : describe.skip;

async function createUser(prefix: string) {
  const id = `${prefix}-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email: `${id}@example.invalid` });
  const [profile] = await db.insert(profiles).values({ userId: id }).returning();
  return { id, profile: profile! };
}

async function createOwnedSkill(profileId: string, name = "TypeScript") {
  const [skill] = await db.insert(skills).values({ profileId, name, type: "technical" }).returning();
  return skill!;
}

describeDatabase("Evidence, matching, gaps, plans, and packages", () => {
  it("references a real owned Dossier fact without copying or creating it", async () => {
    const owner = await createUser("evidence-owner");
    const other = await createUser("evidence-other");
    try {
      const application = await createApplication(owner.id, { objective: emptyApplicationObjective("employment") });
      const skill = await createOwnedSkill(owner.profile.id);
      const foreignSkill = await createOwnedSkill(other.profile.id, "Rust");
      const before = await db.select().from(skills).where(eq(skills.profileId, owner.profile.id));

      const created = await createEvidence(owner.id, application.id, { sourceType: "skills", sourceRecordId: skill.id, excerpt: "TypeScript" });
      expect(created).toMatchObject({ applicationId: application.id, sourceType: "skills", sourceRecordId: skill.id });
      expect(await createEvidence(owner.id, application.id, { sourceType: "skills", sourceRecordId: foreignSkill.id })).toBeNull();
      expect(await getOwnedEvidence(other.id, created!.id)).toBeNull();
      expect(await listApplicationEvidence(other.id, application.id)).toEqual([]);
      expect(await db.select().from(skills).where(eq(skills.profileId, owner.profile.id))).toEqual(before);
      expect(await listSelectableDossierEvidence(owner.id)).toContainEqual(expect.objectContaining({ sourceType: "skills", sourceRecordId: skill.id, label: "TypeScript" }));
      expect(await listSelectableDossierEvidence(other.id)).not.toContainEqual(expect.objectContaining({ sourceRecordId: skill.id }));
    } finally {
      await db.delete(users).where(eq(users.id, owner.id));
      await db.delete(users).where(eq(users.id, other.id));
    }
  });

  it("persists matching and explicit gaps without changing requirement truth", async () => {
    const owner = await createUser("matching-owner");
    const other = await createUser("matching-other");
    try {
      const application = await createApplication(owner.id, { objective: emptyApplicationObjective("employment") });
      const requirement = await createRequirement(owner.id, application.id, { text: "TypeScript experience", category: "skill", interpretationStatus: "user_confirmed" });
      const skill = await createOwnedSkill(owner.profile.id);
      const evidence = await createEvidence(owner.id, application.id, { sourceType: "skills", sourceRecordId: skill.id });
      const result = await createMatchingResult(owner.id, { requirementId: requirement!.id, evidenceId: evidence!.id, status: "suggested", strength: 0.8, reviewState: "unreviewed" });
      const gap = await createGap(owner.id, application.id, { requirementId: requirement!.id, type: "confirmation_required", description: "Review the candidate evidence." });

      expect(result?.status).toBe("suggested");
      expect(await getOwnedMatchingResult(other.id, result!.id)).toBeNull();
      expect(await getOwnedGap(other.id, gap!.id)).toBeNull();
      expect((await updateOwnedGap(owner.id, gap!.id, "acknowledged"))?.status).toBe("acknowledged");
      expect(requirement?.interpretationStatus).toBe("user_confirmed");
    } finally {
      await db.delete(users).where(eq(users.id, owner.id));
      await db.delete(users).where(eq(users.id, other.id));
    }
  });

  it("persists a versioned plan and catalogue-keyed package with nested ownership", async () => {
    const owner = await createUser("plan-owner");
    const other = await createUser("plan-other");
    try {
      const application = await createApplication(owner.id, { objective: emptyApplicationObjective("employment") });
      const plan = await createApplicationPlan(owner.id, application.id, { status: "proposed", resolutionSource: "deterministic", confirmation: "unconfirmed", recommendedDocuments: ["professional_resume", "cover_letter"], requirementCoverage: { total: 0 }, evidenceCoverage: { total: 0 }, gapsSummary: { open: 0 } });
      const secondPlan = await createApplicationPlan(owner.id, application.id, { status: "draft", resolutionSource: "user_adjusted", confirmation: "unconfirmed", recommendedDocuments: [], requirementCoverage: {}, evidenceCoverage: {}, gapsSummary: {} });
      const packageRow = await createApplicationPackage(owner.id, plan!.id);
      const member = await createPackageMember(owner.id, packageRow!.id, { documentType: "professional_resume", role: "primary", position: 0, availability: "available", specificationStatus: "not_started", completion: "planned" });
      const plannedMember = await createPackageMember(owner.id, packageRow!.id, { documentType: "cover_letter", role: "supporting", position: 1, availability: "unavailable", specificationStatus: "not_started", completion: "planned" });

      expect(plan?.version).toBe(1);
      expect(secondPlan?.version).toBe(2);
      expect(await getOwnedApplicationPlan(other.id, plan!.id)).toBeNull();
      expect(await getOwnedApplicationPackage(other.id, packageRow!.id)).toBeNull();
      expect(await listApplicationPackages(other.id, plan!.id)).toEqual([]);
      expect((await listApplicationPackages(owner.id, plan!.id)).map((row) => row.id)).toEqual([packageRow!.id]);
      expect((await listPackageMembers(owner.id, packageRow!.id)).map((row) => [row.documentType, row.role, row.position])).toEqual([["professional_resume", "primary", 0], ["cover_letter", "supporting", 1]]);
      expect(member).not.toHaveProperty("label");
      expect(plannedMember?.availability).toBe("unavailable");
    } finally {
      await db.delete(users).where(eq(users.id, owner.id));
      await db.delete(users).where(eq(users.id, other.id));
    }
  });
});
