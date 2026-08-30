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

export type SelectableDossierEvidence = ResolvedDossierSource & {
  label: string;
};

/** Lists real owner-scoped Dossier rows for the Evidence picker without copying them. */
export async function listSelectableDossierEvidence(userId: string): Promise<SelectableDossierEvidence[]> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile) return [];
  const profileId = profile.id;
  const [experienceRows, educationRows, projectRows, skillRows, credentialRows, achievementRows, languageRows, publicationRows, membershipRows, linkRows] = await Promise.all([
    db.select().from(experiences).where(eq(experiences.profileId, profileId)).orderBy(asc(experiences.position)),
    db.select().from(education).where(eq(education.profileId, profileId)).orderBy(asc(education.position)),
    db.select().from(projects).where(eq(projects.profileId, profileId)).orderBy(asc(projects.position)),
    db.select().from(skills).where(eq(skills.profileId, profileId)).orderBy(asc(skills.position)),
    db.select().from(credentials).where(eq(credentials.profileId, profileId)).orderBy(asc(credentials.position)),
    db.select().from(achievements).where(eq(achievements.profileId, profileId)).orderBy(asc(achievements.position)),
    db.select().from(languages).where(eq(languages.profileId, profileId)).orderBy(asc(languages.position)),
    db.select().from(publications).where(eq(publications.profileId, profileId)).orderBy(asc(publications.position)),
    db.select().from(memberships).where(eq(memberships.profileId, profileId)).orderBy(asc(memberships.position)),
    db.select().from(profileLinks).where(eq(profileLinks.profileId, profileId)).orderBy(asc(profileLinks.position)),
  ]);
  const item = (sourceType: EvidenceSourceType, sourceRecordId: string, label: string, values: unknown[]): SelectableDossierEvidence => ({
    sourceType,
    sourceRecordId,
    label,
    searchableText: values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" "),
  });
  return [
    ...(profile.displayName || profile.headline ? [item("identity", profile.id, profile.displayName || "Profile identity", [profile.displayName, profile.headline, profile.careerDirection])] : []),
    ...experienceRows.map((row) => item("experience", row.id, `${row.role} · ${row.organization}`, [row.role, row.organization, row.description])),
    ...educationRows.map((row) => item("education", row.id, [row.qualification, row.field, row.institution].filter(Boolean).join(" · "), [row.qualification, row.field, row.institution, row.description])),
    ...projectRows.map((row) => item("projects", row.id, row.name, [row.name, row.role, row.context, row.description])),
    ...skillRows.map((row) => item("skills", row.id, row.name, [row.name, row.notes])),
    ...credentialRows.map((row) => item("credentials", row.id, row.name, [row.name, row.issuer, row.description])),
    ...achievementRows.map((row) => item("achievements", row.id, row.title, [row.title, row.issuer, row.description])),
    ...languageRows.map((row) => item("languages", row.id, row.language, [row.language, row.proficiency, row.notes])),
    ...publicationRows.map((row) => item("publications", row.id, row.title, [row.title, row.publisher, row.description])),
    ...membershipRows.map((row) => item("memberships", row.id, row.organization, [row.organization, row.role, row.description])),
    ...linkRows.map((row) => item("links", row.id, row.label || row.type || "Profile link", [row.label, row.type])),
  ];
}

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
