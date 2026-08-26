import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import {
  achievements,
  credentials,
  education,
  experiences,
  languages,
  memberships,
  profileLinks,
  profiles,
  projects,
  publications,
  skills,
} from "@/profile/schema";
import { findOwnedApplication } from "./ownership";
import { evidence, type EvidenceLifecycle, type EvidenceSourceType } from "./planning-schema";

export const evidenceExcerptLimit = 1_000;

export type CreateEvidenceInput = {
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  excerpt?: string | null;
  provenance?: Record<string, unknown> | null;
  confirmation?: "unreviewed" | "confirmed" | "rejected";
  relevance?: number | null;
};

export type UpdateEvidenceInput = Partial<Pick<CreateEvidenceInput, "excerpt" | "provenance" | "confirmation" | "relevance">> & {
  lifecycle?: EvidenceLifecycle;
};

export type ResolvedDossierSource = {
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  searchableText: string;
};

function validateBoundedValues(input: { excerpt?: string | null; relevance?: number | null }) {
  if (input.excerpt && input.excerpt.length > evidenceExcerptLimit) {
    throw new Error(`Evidence excerpts must not exceed ${evidenceExcerptLimit} characters.`);
  }
  if (input.relevance !== undefined && input.relevance !== null && (input.relevance < 0 || input.relevance > 1)) {
    throw new Error("Evidence relevance must be between 0 and 1.");
  }
}

/** Resolves one real canonical Dossier row through its authenticated owner. */
export async function resolveOwnedDossierSource(
  userId: string,
  sourceType: EvidenceSourceType,
  sourceRecordId: string,
): Promise<ResolvedDossierSource | null> {
  if (sourceType === "identity") {
    const [row] = await db.select().from(profiles).where(and(eq(profiles.id, sourceRecordId), eq(profiles.userId, userId))).limit(1);
    return row ? { sourceType, sourceRecordId, searchableText: [row.displayName, row.headline, row.careerDirection].filter(Boolean).join(" ") } : null;
  }

  const ownerPredicate = eq(profiles.userId, userId);
  switch (sourceType) {
    case "experience": {
      const [row] = await db.select({ row: experiences }).from(experiences).innerJoin(profiles, eq(profiles.id, experiences.profileId)).where(and(eq(experiences.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.role, row.row.organization, row.row.description].filter(Boolean).join(" ") } : null;
    }
    case "education": {
      const [row] = await db.select({ row: education }).from(education).innerJoin(profiles, eq(profiles.id, education.profileId)).where(and(eq(education.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.qualification, row.row.field, row.row.institution, row.row.description].filter(Boolean).join(" ") } : null;
    }
    case "projects": {
      const [row] = await db.select({ row: projects }).from(projects).innerJoin(profiles, eq(profiles.id, projects.profileId)).where(and(eq(projects.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.name, row.row.role, row.row.context, row.row.description].filter(Boolean).join(" ") } : null;
    }
    case "skills": {
      const [row] = await db.select({ row: skills }).from(skills).innerJoin(profiles, eq(profiles.id, skills.profileId)).where(and(eq(skills.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.name, row.row.notes].filter(Boolean).join(" ") } : null;
    }
    case "credentials": {
      const [row] = await db.select({ row: credentials }).from(credentials).innerJoin(profiles, eq(profiles.id, credentials.profileId)).where(and(eq(credentials.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.name, row.row.issuer, row.row.description].filter(Boolean).join(" ") } : null;
    }
    case "achievements": {
      const [row] = await db.select({ row: achievements }).from(achievements).innerJoin(profiles, eq(profiles.id, achievements.profileId)).where(and(eq(achievements.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.title, row.row.issuer, row.row.description].filter(Boolean).join(" ") } : null;
    }
    case "languages": {
      const [row] = await db.select({ row: languages }).from(languages).innerJoin(profiles, eq(profiles.id, languages.profileId)).where(and(eq(languages.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.language, row.row.proficiency, row.row.notes].filter(Boolean).join(" ") } : null;
    }
    case "publications": {
      const [row] = await db.select({ row: publications }).from(publications).innerJoin(profiles, eq(profiles.id, publications.profileId)).where(and(eq(publications.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.title, row.row.publisher, row.row.description].filter(Boolean).join(" ") } : null;
    }
    case "memberships": {
      const [row] = await db.select({ row: memberships }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.organization, row.row.role, row.row.description].filter(Boolean).join(" ") } : null;
    }
    case "links": {
      const [row] = await db.select({ row: profileLinks }).from(profileLinks).innerJoin(profiles, eq(profiles.id, profileLinks.profileId)).where(and(eq(profileLinks.id, sourceRecordId), ownerPredicate)).limit(1);
      return row ? { sourceType, sourceRecordId, searchableText: [row.row.label, row.row.type].join(" ") } : null;
    }
  }
}

export async function createEvidence(userId: string, applicationId: string, input: CreateEvidenceInput) {
  validateBoundedValues(input);
  if (!(await findOwnedApplication(userId, applicationId))) return null;
  if (!(await resolveOwnedDossierSource(userId, input.sourceType, input.sourceRecordId))) return null;

  const [created] = await db.insert(evidence).values({ applicationId, ...input }).returning();
  return created ?? null;
}

async function ownedEvidence(userId: string, evidenceId: string) {
  const [row] = await db.select({ evidence }).from(evidence).innerJoin(
    // Ownership remains Application-based even though the source is also owner-validated.
    applicationsForEvidence,
    eq(applicationsForEvidence.id, evidence.applicationId),
  ).where(and(eq(evidence.id, evidenceId), eq(applicationsForEvidence.userId, userId))).limit(1);
  return row?.evidence ?? null;
}

// Local alias avoids exporting or weakening the Application ownership predicate.
import { applications as applicationsForEvidence } from "./schema";

async function refreshAvailability(userId: string, row: typeof evidence.$inferSelect) {
  if (row.lifecycle !== "active") return row;
  if (await resolveOwnedDossierSource(userId, row.sourceType, row.sourceRecordId)) return row;
  const [updated] = await db.update(evidence).set({ lifecycle: "unavailable", updatedAt: new Date() }).where(eq(evidence.id, row.id)).returning();
  return updated ?? { ...row, lifecycle: "unavailable" as const };
}

export async function getOwnedEvidence(userId: string, evidenceId: string) {
  const row = await ownedEvidence(userId, evidenceId);
  return row ? refreshAvailability(userId, row) : null;
}

export async function listApplicationEvidence(userId: string, applicationId: string) {
  if (!(await findOwnedApplication(userId, applicationId))) return [];
  const rows = await db.select().from(evidence).where(eq(evidence.applicationId, applicationId)).orderBy(asc(evidence.createdAt));
  return Promise.all(rows.map((row) => refreshAvailability(userId, row)));
}

export async function updateOwnedEvidence(userId: string, evidenceId: string, input: UpdateEvidenceInput) {
  validateBoundedValues(input);
  if (!(await ownedEvidence(userId, evidenceId))) return null;
  const [updated] = await db.update(evidence).set({ ...input, updatedAt: new Date() }).where(eq(evidence.id, evidenceId)).returning();
  return updated ?? null;
}

export async function deleteOwnedEvidence(userId: string, evidenceId: string) {
  if (!(await ownedEvidence(userId, evidenceId))) return false;
  const deleted = await db.delete(evidence).where(eq(evidence.id, evidenceId)).returning({ id: evidence.id });
  return deleted.length > 0;
}
