import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/auth/database";
import { applications } from "./schema";
import { requirements } from "./opportunity-schema";
import {
  applicationPackages,
  applicationPlans,
  evidence,
  evidenceSelections,
  gaps,
  matchingResults,
  type EvidenceSelectionStatus,
} from "./planning-schema";
import {
  listSelectableDossierEvidence,
  resolveOwnedDossierSource,
  type SelectableDossierEvidence,
} from "./evidence-repository";
import { fingerprintEvidence, fingerprintRequirement } from "./evidence-selection-domain";
import { deterministicallyMatch } from "./matching-repository";

export type EvidenceSelectionDecision = {
  requirementId: string;
  evidenceId: string;
  matchingResultId?: string | null;
};

async function ownedConfirmedPackage(userId: string, applicationId: string, packageId: string) {
  const [row] = await db
    .select({ package: applicationPackages, plan: applicationPlans })
    .from(applicationPackages)
    .innerJoin(applicationPlans, eq(applicationPlans.id, applicationPackages.planId))
    .innerJoin(applications, eq(applications.id, applicationPlans.applicationId))
    .where(and(
      eq(applicationPackages.id, packageId),
      eq(applicationPlans.applicationId, applicationId),
      eq(applications.userId, userId),
      eq(applicationPlans.status, "confirmed"),
      eq(applicationPlans.confirmation, "confirmed"),
      eq(applicationPackages.status, "confirmed"),
      eq(applicationPackages.confirmation, "confirmed"),
    ))
    .limit(1);
  return row ?? null;
}

function requirementFingerprint(row: typeof requirements.$inferSelect) {
  return fingerprintRequirement({
    text: row.text,
    category: row.category,
    constraints: row.constraints,
    normalizedInterpretation: row.normalizedInterpretation,
    sourceId: row.sourceId,
    sourceReference: row.sourceReference,
  });
}

async function evidenceFingerprint(userId: string, row: typeof evidence.$inferSelect) {
  const source = await resolveOwnedDossierSource(userId, row.sourceType, row.sourceRecordId);
  if (!source) return null;
  return fingerprintEvidence({
    sourceType: row.sourceType,
    sourceRecordId: row.sourceRecordId,
    searchableText: source.searchableText,
    excerpt: row.excerpt,
  });
}

/** Creates application projections and deterministic proposals; it never creates a selection. */
export async function materializeDeterministicEvidenceReview(userId: string, applicationId: string, packageId: string) {
  if (!(await ownedConfirmedPackage(userId, applicationId, packageId))) return null;
  const [requirementRows, sources] = await Promise.all([
    db.select().from(requirements).where(eq(requirements.applicationId, applicationId)).orderBy(asc(requirements.createdAt)),
    listSelectableDossierEvidence(userId),
  ]);

  const existingEvidence = await db.select().from(evidence).where(eq(evidence.applicationId, applicationId));
  const evidenceBySource = new Map(existingEvidence.map((row) => [`${row.sourceType}:${row.sourceRecordId}`, row]));
  for (const source of sources) {
    const key = `${source.sourceType}:${source.sourceRecordId}`;
    if (evidenceBySource.has(key)) continue;
    const [created] = await db.insert(evidence).values({
      applicationId,
      sourceType: source.sourceType,
      sourceRecordId: source.sourceRecordId,
      provenance: { projectedFrom: "dossier", matching: "deterministic" },
    }).returning();
    if (created) evidenceBySource.set(key, created);
  }

  const currentMatches = await db.select().from(matchingResults)
    .innerJoin(requirements, eq(requirements.id, matchingResults.requirementId))
    .where(eq(requirements.applicationId, applicationId));
  const matchKeys = new Set(currentMatches.map(({ matching_results: row }) => `${row.requirementId}:${row.evidenceId}`));

  for (const requirement of requirementRows) {
    for (const source of sources) {
      const projected = evidenceBySource.get(`${source.sourceType}:${source.sourceRecordId}`);
      if (!projected) continue;
      const key = `${requirement.id}:${projected.id}`;
      if (matchKeys.has(key)) continue;
      const match = deterministicallyMatch({
        requirementId: requirement.id,
        requirementText: [requirement.text, requirement.normalizedInterpretation].filter(Boolean).join(" "),
        category: requirement.category,
        evidenceId: projected.id,
        sourceType: projected.sourceType,
        searchableText: [source.searchableText, projected.excerpt].filter(Boolean).join(" "),
      });
      if (!match) continue;
      await db.insert(matchingResults).values({ ...match, provenance: { method: "deterministic-token-overlap" } });
      matchKeys.add(key);
    }
  }
  return getEvidenceReview(userId, applicationId, packageId, sources);
}

export async function getEvidenceReview(
  userId: string,
  applicationId: string,
  packageId: string,
  knownSources?: SelectableDossierEvidence[],
) {
  const packageContext = await ownedConfirmedPackage(userId, applicationId, packageId);
  if (!packageContext) return null;
  const [requirementRows, evidenceRows, selectionRows, matchRows, sources] = await Promise.all([
    db.select().from(requirements).where(eq(requirements.applicationId, applicationId)).orderBy(asc(requirements.createdAt)),
    db.select().from(evidence).where(eq(evidence.applicationId, applicationId)).orderBy(asc(evidence.createdAt)),
    db.select().from(evidenceSelections).where(eq(evidenceSelections.packageId, packageId)).orderBy(asc(evidenceSelections.createdAt)),
    db.select({ match: matchingResults }).from(matchingResults)
      .innerJoin(requirements, eq(requirements.id, matchingResults.requirementId))
      .where(eq(requirements.applicationId, applicationId)),
    knownSources ?? listSelectableDossierEvidence(userId),
  ]);
  const sourceMap = new Map(sources.map((source) => [`${source.sourceType}:${source.sourceRecordId}`, source]));
  const refreshedSelections = await refreshSelectionValidity(userId, selectionRows, requirementRows, evidenceRows);
  return {
    applicationId,
    package: packageContext.package,
    plan: packageContext.plan,
    availableEvidence: evidenceRows.map((evidenceRow) => ({
      evidence: evidenceRow,
      source: sourceMap.get(`${evidenceRow.sourceType}:${evidenceRow.sourceRecordId}`) ?? null,
    })),
    requirements: requirementRows.map((requirement) => ({
      ...requirement,
      matches: matchRows
        .map((row) => row.match)
        .filter((match) => match.requirementId === requirement.id)
        .flatMap((match) => {
          const evidenceRow = evidenceRows.find((item) => item.id === match.evidenceId);
          if (!evidenceRow) return [];
          const source = sourceMap.get(`${evidenceRow.sourceType}:${evidenceRow.sourceRecordId}`) ?? null;
          return [{
            ...match,
            evidence: evidenceRow,
            source,
            selection: refreshedSelections.find((selection) => selection.requirementId === requirement.id && selection.evidenceId === evidenceRow.id) ?? null,
          }];
        }),
      selections: refreshedSelections.filter((selection) => selection.requirementId === requirement.id),
    })),
  };
}

async function refreshSelectionValidity(
  userId: string,
  selectionRows: (typeof evidenceSelections.$inferSelect)[],
  requirementRows: (typeof requirements.$inferSelect)[],
  evidenceRows: (typeof evidence.$inferSelect)[],
) {
  const refreshed = [];
  for (const selection of selectionRows) {
    if (selection.status === "rejected" || selection.status === "invalidated") {
      refreshed.push(selection);
      continue;
    }
    const requirement = requirementRows.find((row) => row.id === selection.requirementId);
    const evidenceRow = evidenceRows.find((row) => row.id === selection.evidenceId);
    const currentEvidenceFingerprint = evidenceRow ? await evidenceFingerprint(userId, evidenceRow) : null;
    let status: EvidenceSelectionStatus = selection.status;
    if (!requirement || !evidenceRow || !currentEvidenceFingerprint) status = "invalidated";
    else if (requirementFingerprint(requirement) !== selection.requirementFingerprint || currentEvidenceFingerprint !== selection.evidenceFingerprint) status = "stale";
    if (status !== selection.status) {
      const [updated] = await db.update(evidenceSelections).set({
        status,
        confirmedAt: null,
        confirmedByUserId: null,
        updatedAt: new Date(),
      }).where(eq(evidenceSelections.id, selection.id)).returning();
      refreshed.push(updated ?? { ...selection, status });
      if (status === "invalidated" && evidenceRow) await db.update(evidence).set({ lifecycle: "unavailable", updatedAt: new Date() }).where(eq(evidence.id, evidenceRow.id));
    } else refreshed.push(selection);
  }
  return refreshed;
}

export async function confirmEvidenceSelections(
  userId: string,
  applicationId: string,
  packageId: string,
  decisions: readonly EvidenceSelectionDecision[],
) {
  if (!(await ownedConfirmedPackage(userId, applicationId, packageId))) return null;
  const unique = new Map(decisions.map((decision) => [`${decision.requirementId}:${decision.evidenceId}`, decision]));
  const normalized = [...unique.values()];
  const requirementIds = [...new Set(normalized.map((decision) => decision.requirementId))];
  const evidenceIds = [...new Set(normalized.map((decision) => decision.evidenceId))];
  const [requirementRows, evidenceRows] = await Promise.all([
    requirementIds.length ? db.select().from(requirements).where(and(eq(requirements.applicationId, applicationId), inArray(requirements.id, requirementIds))) : Promise.resolve([]),
    evidenceIds.length ? db.select().from(evidence).where(and(eq(evidence.applicationId, applicationId), inArray(evidence.id, evidenceIds))) : Promise.resolve([]),
  ]);
  if (requirementRows.length !== requirementIds.length || evidenceRows.length !== evidenceIds.length) return null;

  const values: (typeof evidenceSelections.$inferInsert)[] = [];
  for (const decision of normalized) {
    const requirement = requirementRows.find((row) => row.id === decision.requirementId)!;
    const evidenceRow = evidenceRows.find((row) => row.id === decision.evidenceId)!;
    if (evidenceRow.lifecycle !== "active") return null;
    const fingerprint = await evidenceFingerprint(userId, evidenceRow);
    if (!fingerprint) return null;
    if (decision.matchingResultId) {
      const [match] = await db.select().from(matchingResults).where(and(
        eq(matchingResults.id, decision.matchingResultId),
        eq(matchingResults.requirementId, requirement.id),
        eq(matchingResults.evidenceId, evidenceRow.id),
      )).limit(1);
      if (!match) return null;
    }
    values.push({
      applicationId,
      packageId,
      requirementId: requirement.id,
      evidenceId: evidenceRow.id,
      status: "confirmed" as const,
      confirmedAt: new Date(),
      confirmedByUserId: userId,
      requirementFingerprint: requirementFingerprint(requirement),
      evidenceFingerprint: fingerprint,
      matchingResultId: decision.matchingResultId ?? null,
    });
  }

  return db.transaction(async (transaction) => {
    const selectedKeys = new Set(values.map((value) => `${value.requirementId}:${value.evidenceId}`));
    const previousConfirmed = await transaction.select().from(evidenceSelections).where(and(
      eq(evidenceSelections.packageId, packageId),
      eq(evidenceSelections.status, "confirmed"),
    ));
    for (const selection of previousConfirmed) {
      if (selectedKeys.has(`${selection.requirementId}:${selection.evidenceId}`)) continue;
      await transaction.update(evidenceSelections).set({
        status: "rejected",
        confirmedAt: null,
        confirmedByUserId: null,
        updatedAt: new Date(),
      }).where(eq(evidenceSelections.id, selection.id));
    }

    for (const value of values) {
      await transaction.insert(evidenceSelections).values(value).onConflictDoUpdate({
        target: [evidenceSelections.packageId, evidenceSelections.requirementId, evidenceSelections.evidenceId],
        set: { ...value, updatedAt: new Date() },
      });
      if (value.matchingResultId) await transaction.update(matchingResults).set({ status: "accepted", reviewState: "confirmed", updatedAt: new Date() }).where(eq(matchingResults.id, value.matchingResultId));
    }

    const allRequirements = await transaction.select().from(requirements).where(eq(requirements.applicationId, applicationId));
    const confirmed = await transaction.select().from(evidenceSelections).where(and(eq(evidenceSelections.packageId, packageId), eq(evidenceSelections.status, "confirmed")));
    await transaction.delete(gaps).where(and(eq(gaps.applicationId, applicationId), eq(gaps.type, "no_evidence")));
    for (const requirement of allRequirements) {
      const covered = confirmed.some((selection) => selection.requirementId === requirement.id);
      await transaction.update(requirements).set({ interpretationStatus: covered ? "matched" : "gap", updatedAt: new Date() }).where(eq(requirements.id, requirement.id));
      if (!covered) await transaction.insert(gaps).values({ applicationId, requirementId: requirement.id, type: "no_evidence", description: "No Evidence has been confirmed for this requirement." });
    }
    return { confirmed: values.length, unresolved: allRequirements.length - new Set(confirmed.map((selection) => selection.requirementId)).size };
  });
}

export async function rejectEvidenceCandidate(userId: string, applicationId: string, packageId: string, decision: EvidenceSelectionDecision) {
  if (!(await ownedConfirmedPackage(userId, applicationId, packageId))) return null;
  const [requirement, evidenceRow] = await Promise.all([
    db.select().from(requirements).where(and(eq(requirements.id, decision.requirementId), eq(requirements.applicationId, applicationId))).limit(1).then((rows) => rows[0]),
    db.select().from(evidence).where(and(eq(evidence.id, decision.evidenceId), eq(evidence.applicationId, applicationId))).limit(1).then((rows) => rows[0]),
  ]);
  if (!requirement || !evidenceRow) return null;
  if (decision.matchingResultId) {
    const [match] = await db.select({ id: matchingResults.id }).from(matchingResults).where(and(
      eq(matchingResults.id, decision.matchingResultId),
      eq(matchingResults.requirementId, requirement.id),
      eq(matchingResults.evidenceId, evidenceRow.id),
    )).limit(1);
    if (!match) return null;
  }
  const fingerprint = await evidenceFingerprint(userId, evidenceRow);
  if (!fingerprint) return null;
  const [selection] = await db.insert(evidenceSelections).values({
    applicationId,
    packageId,
    requirementId: requirement.id,
    evidenceId: evidenceRow.id,
    status: "rejected",
    requirementFingerprint: requirementFingerprint(requirement),
    evidenceFingerprint: fingerprint,
    matchingResultId: decision.matchingResultId ?? null,
  }).onConflictDoUpdate({
    target: [evidenceSelections.packageId, evidenceSelections.requirementId, evidenceSelections.evidenceId],
    set: { status: "rejected", confirmedAt: null, confirmedByUserId: null, requirementFingerprint: requirementFingerprint(requirement), evidenceFingerprint: fingerprint, matchingResultId: decision.matchingResultId ?? null, updatedAt: new Date() },
  }).returning();
  if (decision.matchingResultId) await db.update(matchingResults).set({ status: "rejected", reviewState: "rejected", updatedAt: new Date() }).where(eq(matchingResults.id, decision.matchingResultId));
  return selection ?? null;
}

/** Returns only current confirmed selections; stale or missing sources are invalidated before returning. */
export async function listValidPackageEvidenceSelections(userId: string, applicationId: string, packageId: string) {
  const review = await getEvidenceReview(userId, applicationId, packageId);
  if (!review) return null;
  return review.requirements.flatMap((requirement) => requirement.selections).filter((selection) => selection.status === "confirmed");
}

export async function packageHasConfirmedEvidenceBoundary(userId: string, applicationId: string, packageId: string) {
  const review = await getEvidenceReview(userId, applicationId, packageId);
  if (!review) return false;
  if (review.requirements.length === 0) return true;
  return review.requirements.every(
    (requirement) => requirement.selections.some((selection) => selection.status === "confirmed")
      || requirement.interpretationStatus === "gap",
  );
}
