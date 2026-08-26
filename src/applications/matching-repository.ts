import { and, asc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { applications } from "./schema";
import { evidence, matchingResults, type MatchingStatus } from "./planning-schema";
import { requirements } from "./opportunity-schema";
import { getOwnedEvidence } from "./evidence-repository";

export type DeterministicMatchInput = {
  requirementId: string;
  requirementText: string;
  category: string;
  evidenceId: string;
  sourceType: string;
  searchableText: string;
};

export type DeterministicMatch = {
  requirementId: string;
  evidenceId: string;
  status: "candidate" | "suggested";
  strength: number;
  explanation: string;
};

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string) => new Set(normalize(value).split(/\s+/).filter((token) => token.length >= 3));

/** Pure, bounded matching: an advisory relationship, never a satisfaction assertion. */
export function deterministicallyMatch(input: DeterministicMatchInput): DeterministicMatch | null {
  const requirement = tokens(input.requirementText);
  const evidenceTokens = tokens(input.searchableText);
  const overlap = [...requirement].filter((token) => evidenceTokens.has(token));
  const compatible = input.category === "skill" ? input.sourceType === "skills" : true;
  if (!compatible || overlap.length === 0) return null;

  const strength = Math.min(1, overlap.length / Math.max(1, requirement.size));
  return {
    requirementId: input.requirementId,
    evidenceId: input.evidenceId,
    status: strength >= 0.5 ? "suggested" : "candidate",
    strength,
    explanation: `Structured text overlap found for ${input.sourceType}; review is required before acceptance.`,
  };
}

async function ownedRequirementWithApplication(userId: string, requirementId: string) {
  const [row] = await db.select({ requirement: requirements, applicationUserId: applications.userId }).from(requirements)
    .innerJoin(applications, eq(applications.id, requirements.applicationId))
    .where(and(eq(requirements.id, requirementId), eq(applications.userId, userId))).limit(1);
  return row ?? null;
}

async function ownedMatching(userId: string, matchingId: string) {
  const [row] = await db.select({ result: matchingResults, applicationId: requirements.applicationId, userId: applications.userId })
    .from(matchingResults).innerJoin(requirements, eq(requirements.id, matchingResults.requirementId))
    .innerJoin(applications, eq(applications.id, requirements.applicationId))
    .where(and(eq(matchingResults.id, matchingId), eq(applications.userId, userId))).limit(1);
  return row ?? null;
}

export async function createMatchingResult(userId: string, input: Omit<typeof matchingResults.$inferInsert, "id" | "createdAt" | "updatedAt">) {
  const requirement = await ownedRequirementWithApplication(userId, input.requirementId);
  const source = await getOwnedEvidence(userId, input.evidenceId);
  if (!requirement || !source || requirement.requirement.applicationId !== source.applicationId) return null;
  const [created] = await db.insert(matchingResults).values(input).returning();
  return created ?? null;
}

export async function getOwnedMatchingResult(userId: string, matchingId: string) {
  return (await ownedMatching(userId, matchingId))?.result ?? null;
}

export async function listRequirementMatchingResults(userId: string, requirementId: string) {
  if (!(await ownedRequirementWithApplication(userId, requirementId))) return [];
  return db.select().from(matchingResults).where(eq(matchingResults.requirementId, requirementId)).orderBy(asc(matchingResults.createdAt));
}

export async function updateOwnedMatchingResult(userId: string, matchingId: string, input: Partial<Pick<typeof matchingResults.$inferInsert, "status" | "strength" | "explanation" | "provenance" | "reviewState">>) {
  if (!(await ownedMatching(userId, matchingId))) return null;
  const [updated] = await db.update(matchingResults).set({ ...input, updatedAt: new Date() }).where(eq(matchingResults.id, matchingId)).returning();
  return updated ?? null;
}

export async function deleteOwnedMatchingResult(userId: string, matchingId: string) {
  if (!(await ownedMatching(userId, matchingId))) return false;
  return (await db.delete(matchingResults).where(eq(matchingResults.id, matchingId)).returning({ id: matchingResults.id })).length > 0;
}

export type MatchingResultState = MatchingStatus;

export async function suggestMatchesForEvidence(userId: string, applicationId: string, evidenceId: string) {
  const source = await getOwnedEvidence(userId, evidenceId);
  if (!source || source.applicationId !== applicationId) return [];
  const requirementRows = await db.select().from(requirements).where(eq(requirements.applicationId, applicationId)).orderBy(asc(requirements.createdAt));
  const resolved = await import("./evidence-repository").then(({ resolveOwnedDossierSource }) => resolveOwnedDossierSource(userId, source.sourceType, source.sourceRecordId));
  if (!resolved) return [];
  return requirementRows.map((requirement) => deterministicallyMatch({ requirementId: requirement.id, requirementText: [requirement.text, requirement.normalizedInterpretation].filter(Boolean).join(" "), category: requirement.category, evidenceId: source.id, sourceType: source.sourceType, searchableText: [resolved.searchableText, source.excerpt].filter(Boolean).join(" ") })).filter((match): match is DeterministicMatch => match !== null);
}
