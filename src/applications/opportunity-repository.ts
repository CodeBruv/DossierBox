import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/auth/database";
import { applications } from "./schema";
import {
  opportunitySources,
  opportunities,
  requirements,
  type RequirementInterpretationStatus,
} from "./opportunity-schema";

export type CreateOpportunityInput = Omit<
  typeof opportunities.$inferInsert,
  "id" | "applicationId" | "createdAt" | "updatedAt"
>;
export type UpdateOpportunityInput = Partial<CreateOpportunityInput>;
export type CreateOpportunitySourceInput = Omit<
  typeof opportunitySources.$inferInsert,
  "id" | "opportunityId" | "createdAt" | "updatedAt"
>;
export type UpdateOpportunitySourceInput = Partial<CreateOpportunitySourceInput>;
export type CreateRequirementInput = Omit<
  typeof requirements.$inferInsert,
  "id" | "applicationId" | "createdAt" | "updatedAt"
>;
export type UpdateRequirementInput = Partial<CreateRequirementInput>;

export const opportunityCaptureLimits = {
  pastedText: 20_000,
} as const;

const preEvidenceRequirementStatuses: readonly RequirementInterpretationStatus[] = [
  "uninterpreted",
  "extracted",
  "user_confirmed",
  "user_corrected",
];

async function ownedApplication(userId: string, applicationId: string) {
  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);
  return application ?? null;
}

async function ownedOpportunity(userId: string, opportunityId: string) {
  const [opportunity] = await db
    .select({ opportunity: opportunities, applicationUserId: applications.userId })
    .from(opportunities)
    .innerJoin(applications, eq(applications.id, opportunities.applicationId))
    .where(and(eq(opportunities.id, opportunityId), eq(applications.userId, userId)))
    .limit(1);
  return opportunity?.opportunity ?? null;
}

export async function createOpportunity(
  userId: string,
  applicationId: string,
  input: CreateOpportunityInput,
) {
  if (!(await ownedApplication(userId, applicationId))) return null;
  const [created] = await db
    .insert(opportunities)
    .values({ ...input, applicationId })
    .returning();
  return created ?? null;
}

export async function getOwnedOpportunity(userId: string, opportunityId: string) {
  return ownedOpportunity(userId, opportunityId);
}

export async function listApplicationOpportunities(userId: string, applicationId: string) {
  if (!(await ownedApplication(userId, applicationId))) return [];
  return db
    .select()
    .from(opportunities)
    .where(eq(opportunities.applicationId, applicationId))
    .orderBy(asc(opportunities.createdAt));
}

export async function updateOwnedOpportunity(
  userId: string,
  opportunityId: string,
  input: UpdateOpportunityInput,
) {
  if (!(await ownedOpportunity(userId, opportunityId))) return null;
  const [updated] = await db
    .update(opportunities)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(opportunities.id, opportunityId))
    .returning();
  return updated ?? null;
}

export async function deleteOwnedOpportunity(userId: string, opportunityId: string) {
  if (!(await ownedOpportunity(userId, opportunityId))) return false;
  const deleted = await db
    .delete(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .returning({ id: opportunities.id });
  return deleted.length > 0;
}

/**
 * Returns the first pasted source captured for an owned Application.
 * An empty result deliberately reveals nothing about a foreign Application.
 */
export async function getApplicationOpportunityCapture(userId: string, applicationId: string) {
  if (!(await ownedApplication(userId, applicationId))) return null;

  const [capture] = await db
    .select({ opportunity: opportunities, source: opportunitySources })
    .from(opportunities)
    .leftJoin(
      opportunitySources,
      and(
        eq(opportunitySources.opportunityId, opportunities.id),
        eq(opportunitySources.sourceType, "pasted_text"),
      ),
    )
    .where(
      and(
        eq(opportunities.applicationId, applicationId),
        eq(opportunities.sourceType, "pasted_text"),
      ),
    )
    .orderBy(asc(opportunities.createdAt), asc(opportunitySources.createdAt))
    .limit(1);

  return capture ?? null;
}

/**
 * Creates or corrects one bounded pasted-text source under an owned Application.
 * Opportunity content and source provenance are committed atomically and remain
 * explicitly uninterpreted; this boundary creates no Requirements or IU records.
 */
export async function saveApplicationOpportunityCapture(
  userId: string,
  applicationId: string,
  pastedText: string,
) {
  const content = pastedText.trim();
  if (content.length === 0 || content.length > opportunityCaptureLimits.pastedText) {
    throw new Error("Opportunity text is outside the supported capture boundary.");
  }

  return db.transaction(async (transaction) => {
    const [application] = await transaction
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .limit(1);
    if (!application) return null;

    const [existingOpportunity] = await transaction
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.applicationId, application.id),
          eq(opportunities.sourceType, "pasted_text"),
        ),
      )
      .orderBy(asc(opportunities.createdAt))
      .limit(1);

    const now = new Date();
    const fingerprint = `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
    let opportunity = existingOpportunity;

    if (opportunity) {
      [opportunity] = await transaction
        .update(opportunities)
        .set({
          extractedText: content,
          interpretationStatus: "uninterpreted",
          interpretation: null,
          interpretationVersion: null,
          updatedAt: now,
        })
        .where(eq(opportunities.id, opportunity.id))
        .returning();
    } else {
      [opportunity] = await transaction
        .insert(opportunities)
        .values({
          applicationId: application.id,
          sourceType: "pasted_text",
          extractedText: content,
          interpretationStatus: "uninterpreted",
        })
        .returning();
    }
    if (!opportunity) throw new Error("Opportunity could not be saved.");

    const [existingSource] = await transaction
      .select()
      .from(opportunitySources)
      .where(
        and(
          eq(opportunitySources.opportunityId, opportunity.id),
          eq(opportunitySources.sourceType, "pasted_text"),
        ),
      )
      .orderBy(asc(opportunitySources.createdAt))
      .limit(1);

    let source;
    if (existingSource) {
      [source] = await transaction
        .update(opportunitySources)
        .set({ contentFingerprint: fingerprint, extractedContentStatus: "available", updatedAt: now })
        .where(eq(opportunitySources.id, existingSource.id))
        .returning();
    } else {
      [source] = await transaction
        .insert(opportunitySources)
        .values({
          opportunityId: opportunity.id,
          sourceType: "pasted_text",
          sourceReference: "user-pasted-text",
          contentFingerprint: fingerprint,
          extractedContentStatus: "available",
        })
        .returning();
    }
    if (!source) throw new Error("Opportunity source could not be saved.");

    return { opportunity, source };
  });
}

export async function createOpportunitySource(
  userId: string,
  opportunityId: string,
  input: CreateOpportunitySourceInput,
) {
  if (!(await ownedOpportunity(userId, opportunityId))) return null;
  const [created] = await db
    .insert(opportunitySources)
    .values({ ...input, opportunityId })
    .returning();
  return created ?? null;
}

async function ownedSourceWithApplication(userId: string, sourceId: string) {
  const [source] = await db
    .select({ source: opportunitySources, applicationId: opportunities.applicationId })
    .from(opportunitySources)
    .innerJoin(opportunities, eq(opportunities.id, opportunitySources.opportunityId))
    .innerJoin(applications, eq(applications.id, opportunities.applicationId))
    .where(and(eq(opportunitySources.id, sourceId), eq(applications.userId, userId)))
    .limit(1);
  return source ?? null;
}

export async function getOwnedOpportunitySource(userId: string, sourceId: string) {
  return (await ownedSourceWithApplication(userId, sourceId))?.source ?? null;
}

export async function updateOwnedOpportunitySource(
  userId: string,
  sourceId: string,
  input: UpdateOpportunitySourceInput,
) {
  if (!(await getOwnedOpportunitySource(userId, sourceId))) return null;
  const [updated] = await db
    .update(opportunitySources)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(opportunitySources.id, sourceId))
    .returning();
  return updated ?? null;
}

export async function createRequirement(
  userId: string,
  applicationId: string,
  input: CreateRequirementInput,
) {
  if (!(await ownedApplication(userId, applicationId))) return null;
  if (input.opportunityId) {
    const opportunity = await ownedOpportunity(userId, input.opportunityId);
    if (!opportunity || opportunity.applicationId !== applicationId) return null;
  }
  if (input.sourceId) {
    const source = await ownedSourceWithApplication(userId, input.sourceId);
    if (!source || source.applicationId !== applicationId) return null;
    const opportunity = input.opportunityId ? await ownedOpportunity(userId, input.opportunityId) : null;
    if (opportunity && source.source.opportunityId !== opportunity.id) return null;
  }
  if (input.interpretationStatus && !preEvidenceRequirementStatuses.includes(input.interpretationStatus)) {
    throw new Error("Requirement matching states require a future Evidence boundary.");
  }
  const [created] = await db
    .insert(requirements)
    .values({ ...input, applicationId })
    .returning();
  return created ?? null;
}

async function ownedRequirement(userId: string, requirementId: string) {
  const [requirement] = await db
    .select({ requirement: requirements })
    .from(requirements)
    .innerJoin(applications, eq(applications.id, requirements.applicationId))
    .where(and(eq(requirements.id, requirementId), eq(applications.userId, userId)))
    .limit(1);
  return requirement?.requirement ?? null;
}

export async function getOwnedRequirement(userId: string, requirementId: string) {
  return ownedRequirement(userId, requirementId);
}

export async function listApplicationRequirements(userId: string, applicationId: string) {
  if (!(await ownedApplication(userId, applicationId))) return [];
  return db
    .select()
    .from(requirements)
    .where(eq(requirements.applicationId, applicationId))
    .orderBy(asc(requirements.createdAt));
}

export async function listOpportunityRequirements(userId: string, opportunityId: string) {
  if (!(await ownedOpportunity(userId, opportunityId))) return [];
  return db
    .select()
    .from(requirements)
    .where(eq(requirements.opportunityId, opportunityId))
    .orderBy(asc(requirements.createdAt));
}

export async function updateOwnedRequirement(
  userId: string,
  requirementId: string,
  input: UpdateRequirementInput,
) {
  const existing = await ownedRequirement(userId, requirementId);
  if (!existing) return null;
  if (input.interpretationStatus && !preEvidenceRequirementStatuses.includes(input.interpretationStatus)) {
    throw new Error("Requirement matching states require a future Evidence boundary.");
  }
  if (input.opportunityId) {
    const opportunity = await ownedOpportunity(userId, input.opportunityId);
    if (!opportunity || opportunity.applicationId !== existing.applicationId) return null;
  }
  if (input.sourceId) {
    const source = await ownedSourceWithApplication(userId, input.sourceId);
    if (!source || source.applicationId !== existing.applicationId) return null;
    const opportunityId = input.opportunityId ?? existing.opportunityId;
    if (opportunityId && source.source.opportunityId !== opportunityId) return null;
  }
  const [updated] = await db
    .update(requirements)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(requirements.id, requirementId))
    .returning();
  return updated ?? null;
}

export async function deleteOwnedRequirement(userId: string, requirementId: string) {
  if (!(await ownedRequirement(userId, requirementId))) return false;
  const deleted = await db
    .delete(requirements)
    .where(eq(requirements.id, requirementId))
    .returning({ id: requirements.id });
  return deleted.length > 0;
}

export type OwnedOpportunity = Awaited<ReturnType<typeof getOwnedOpportunity>>;
export type OwnedRequirement = Awaited<ReturnType<typeof getOwnedRequirement>>;
