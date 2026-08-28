import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/auth/database";
import { users } from "@/auth/schema";
import { freeEntitlement } from "@/entitlements/entitlements";
import { applications } from "@/applications/schema";
import {
  applicationPackageMembers,
  applicationPackages,
  applicationPlans,
} from "@/applications/planning-schema";
import { documentSpecifications } from "./specification-schema";
import {
  generatedContentVersions,
  generationAttempts,
  generationEvidenceManifestItems,
  generationValidations,
  generationWorkItems,
  iuAccounts,
  iuLedgerEntries,
  providerExecutions,
} from "./generation-schema";
import {
  appendProviderExecution,
  completeGenerationAttempt,
  createGenerationAttempt,
  failGenerationAttempt,
  findOwnedGenerationAttempt,
  getOwnedGenerationWorkItem,
  reserveGenerationUnits,
  transitionGenerationAttempt,
  updateGenerationWorkItemStatus,
} from "./generation-repository";
import { createDurableGenerationPersistence } from "./generation-persistence";

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeDatabase = databaseConfigured ? describe : describe.skip;
const fixtureIds = new Set<string>();

function fixtureId(label: string): string {
  const id = `generation-test-${label}-${crypto.randomUUID()}`;
  fixtureIds.add(id);
  return id;
}

async function createFixture(label: string, ownerId = fixtureId(`${label}-owner`)) {
  const applicationId = fixtureId(`${label}-application`);
  const planId = fixtureId(`${label}-plan`);
  const packageId = fixtureId(`${label}-package`);
  const memberId = fixtureId(`${label}-member`);
  const specificationId = fixtureId(`${label}-specification`);
  await db.insert(users).values({ id: ownerId, email: `${ownerId}@example.invalid` }).onConflictDoNothing();
  await db.insert(applications).values({ id: applicationId, userId: ownerId });
  await db.insert(applicationPlans).values({ id: planId, applicationId, version: 1 });
  await db.insert(applicationPackages).values({ id: packageId, planId });
  await db.insert(applicationPackageMembers).values({
    id: memberId,
    packageId,
    documentType: "professional_resume",
    role: "primary",
    position: 0,
    availability: "available",
  });
  await db.insert(documentSpecifications).values({
    id: specificationId,
    packageMemberId: memberId,
    documentType: "professional_resume",
    revision: 1,
    status: "approved",
    purpose: "Database-backed durable Generation validation",
  });
  return { ownerId, applicationId, specificationId };
}

function attemptInput(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  label: string,
  overrides: Partial<Parameters<typeof createGenerationAttempt>[0]> = {},
) {
  return {
    userId: fixture.ownerId,
    applicationId: fixture.applicationId,
    specificationId: fixture.specificationId,
    specificationRevision: 1,
    specificationFingerprint: `specification-${label}`,
    evidenceFingerprint: `evidence-${label}`,
    requestFingerprint: `request-${label}`,
    endpoint: "document-generation",
    idempotencyKey: `key-${label}`,
    entitlementPlan: "test-entitlement",
    estimatedUnits: 5,
    ...overrides,
  };
}

async function makeRunningAttempt(fixture: Awaited<ReturnType<typeof createFixture>>, label: string) {
  const attempt = await createGenerationAttempt(attemptInput(fixture, label));
  if (!attempt) throw new Error("Attempt fixture was not created.");
  await db.insert(iuAccounts).values({ userId: fixture.ownerId, availableUnits: 5 }).onConflictDoUpdate({
    target: iuAccounts.userId,
    set: { availableUnits: 5, reservedUnits: 0, updatedAt: new Date() },
  });
  expect(await reserveGenerationUnits({
    userId: fixture.ownerId,
    attemptId: attempt.id,
    units: 5,
    entitlementPlan: "test-entitlement",
  })).not.toBeNull();
  expect(await transitionGenerationAttempt(fixture.ownerId, attempt.id, "running")).not.toBeNull();
  return attempt;
}

async function addWorkItem(attemptId: string, label: string) {
  const id = fixtureId(`${label}-work`);
  const [workItem] = await db.insert(generationWorkItems).values({
    id,
    attemptId,
    sectionKey: "summary",
    heading: "Summary",
    layout: "prose",
    workOrder: 0,
    workload: "cover_letter_generation",
    evidenceManifest: [{ evidenceId: "evidence-1", excerptFingerprint: "bounded-fingerprint" }],
    contextFingerprint: "context-fingerprint",
  }).returning();
  return workItem!;
}

async function cleanupFixtures() {
  if (!databaseConfigured || fixtureIds.size === 0) return;
  const connection = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connection) return;
  const sql = postgres(connection, { max: 1, prepare: false });
  const ids = [...fixtureIds];
  try {
    await sql.begin(async (transaction) => {
      await transaction`SET LOCAL session_replication_role = replica`;
      await transaction`DELETE FROM generated_content_versions WHERE "attemptId" IN (SELECT id FROM generation_attempts WHERE "userId" IN ${transaction(ids)})`;
      await transaction`DELETE FROM generation_validations WHERE "attemptId" IN (SELECT id FROM generation_attempts WHERE "userId" IN ${transaction(ids)})`;
      await transaction`DELETE FROM generation_provider_executions WHERE "attemptId" IN (SELECT id FROM generation_attempts WHERE "userId" IN ${transaction(ids)})`;
      await transaction`DELETE FROM generation_evidence_manifest_items WHERE "attemptId" IN (SELECT id FROM generation_attempts WHERE "userId" IN ${transaction(ids)})`;
      await transaction`DELETE FROM generation_work_items WHERE "attemptId" IN (SELECT id FROM generation_attempts WHERE "userId" IN ${transaction(ids)})`;
      await transaction`DELETE FROM iu_ledger_entries WHERE "userId" IN ${transaction(ids)}`;
      await transaction`DELETE FROM generation_attempts WHERE "userId" IN ${transaction(ids)}`;
      await transaction`DELETE FROM iu_accounts WHERE "userId" IN ${transaction(ids)}`;
      await transaction`DELETE FROM users WHERE id IN ${transaction(ids)}`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describeDatabase("durable Generation repository", () => {
  beforeAll(cleanupFixtures, 120_000);
  afterAll(cleanupFixtures, 120_000);

  it("uses database uniqueness for concurrent endpoint-scoped idempotency and rejects conflicts", async () => {
    const fixture = await createFixture("idempotency");
    const input = attemptInput(fixture, "same");
    const [left, right] = await Promise.all([
      createGenerationAttempt(input),
      createGenerationAttempt(input),
    ]);
    expect(left?.id).toBe(right?.id);
    expect(await db.select().from(generationAttempts).where(and(
      eq(generationAttempts.userId, fixture.ownerId),
      eq(generationAttempts.endpoint, input.endpoint),
      eq(generationAttempts.idempotencyKey, input.idempotencyKey),
    ))).toHaveLength(1);
    await expect(createGenerationAttempt({ ...input, requestFingerprint: "materially-different" })).rejects.toThrow(/Idempotency key/);
    expect(await createGenerationAttempt({ ...input, endpoint: "another-endpoint" })).not.toBeNull();
  });

  it("lets only one concurrent identical durable preparation proceed to provider work", async () => {
    const fixture = await createFixture("duplicate-prepare");
    await db.insert(iuAccounts).values({ userId: fixture.ownerId, availableUnits: 4 });
    const persistence = createDurableGenerationPersistence();
    const now = new Date("2026-08-28T00:00:00.000Z");
    const input = {
      request: {
        userId: fixture.ownerId,
        specificationId: fixture.specificationId,
        specificationRevision: 1,
        idempotencyKey: "concurrent-prepare",
      },
      specification: {
        id: fixture.specificationId,
        revision: 1,
        status: "approved",
        applicationId: fixture.applicationId,
        documentType: "professional_resume" as const,
        purpose: "Database-backed durable Generation validation",
        evidenceIds: [],
        requirementIds: [],
      },
      evidence: [],
      workItems: [{
        sectionKey: "summary" as const,
        heading: "Summary",
        layout: "prose" as const,
        order: 0,
        workload: "cover_letter_generation" as const,
        specificationId: fixture.specificationId,
        specificationRevision: 1,
        selectedEvidence: [],
      }],
      entitlement: freeEntitlement(now),
      now,
    };

    const results = await Promise.all([
      persistence.prepare(input),
      persistence.prepare(input),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, message: "This generation request has already been accepted." },
    ]);

    const attempts = await db.select().from(generationAttempts).where(and(
      eq(generationAttempts.userId, fixture.ownerId),
      eq(generationAttempts.idempotencyKey, input.request.idempotencyKey),
    ));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe("running");
    expect(await db.select().from(iuLedgerEntries).where(and(
      eq(iuLedgerEntries.attemptId, attempts[0]!.id),
      eq(iuLedgerEntries.kind, "reservation"),
    ))).toHaveLength(1);
    expect(await db.select().from(generationWorkItems).where(eq(
      generationWorkItems.attemptId,
      attempts[0]!.id,
    ))).toHaveLength(1);
  });

  it("serializes concurrent reservations and never overspends available units", async () => {
    const fixture = await createFixture("reservation-race");
    const first = await createGenerationAttempt(attemptInput(fixture, "race-a"));
    const second = await createGenerationAttempt(attemptInput(fixture, "race-b"));
    await db.insert(iuAccounts).values({ userId: fixture.ownerId, availableUnits: 5 });
    const results = await Promise.all([first!, second!].map((attempt) => reserveGenerationUnits({
      userId: fixture.ownerId,
      attemptId: attempt.id,
      units: 5,
      entitlementPlan: "test-entitlement",
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
    const [account] = await db.select().from(iuAccounts).where(eq(iuAccounts.userId, fixture.ownerId));
    expect(account).toMatchObject({ availableUnits: 0, reservedUnits: 5 });
  });

  it("denies cross-owner reads, work mutation, and settlement throughout the ownership chain", async () => {
    const fixture = await createFixture("ownership");
    const otherId = fixtureId("ownership-other");
    await db.insert(users).values({ id: otherId, email: `${otherId}@example.invalid` });
    const attempt = await makeRunningAttempt(fixture, "ownership-attempt");
    const workItem = await addWorkItem(attempt.id, "ownership");
    expect(await findOwnedGenerationAttempt(otherId, attempt.id)).toBeNull();
    expect(await getOwnedGenerationWorkItem(otherId, attempt.id, "summary")).toBeNull();
    expect(await updateGenerationWorkItemStatus({ userId: otherId, attemptId: attempt.id, workItemId: workItem.id, status: "failed" })).toBeNull();
    expect(await appendProviderExecution(otherId, {
      attemptId: attempt.id,
      workItemId: workItem.id,
      sequence: 1,
      promptId: "foreign-prompt",
      requestFingerprint: "foreign-request",
      provider: "test-provider",
      model: "test-model",
      status: "succeeded",
      startedAt: new Date(),
    })).toBeNull();
    expect(await completeGenerationAttempt({
      userId: otherId,
      attemptId: attempt.id,
      entitlementPlan: "test-entitlement",
      artifact: { version: 1, documentType: "professional_resume", content: {}, provenance: {}, contentFingerprint: "content", compilerFingerprint: "compiler" },
      compilerValidation: { kind: "compiler", status: "passed", fingerprint: "compiler", issues: [] },
    })).toBeNull();
  });

  it("publishes immutable content and allocates exactly once in one successful transaction", async () => {
    const fixture = await createFixture("success");
    const attempt = await makeRunningAttempt(fixture, "success-attempt");
    const input = {
      userId: fixture.ownerId,
      attemptId: attempt.id,
      entitlementPlan: "test-entitlement",
      artifact: {
        version: 1,
        documentType: "professional_resume",
        content: { sections: { summary: "compiler-ready" } },
        provenance: { summary: { evidenceIds: ["evidence-1"], requirementIds: ["requirement-1"] } },
        contentFingerprint: "content-hash",
        compilerFingerprint: "compiler-contract-v1",
      },
      compilerValidation: { kind: "compiler" as const, status: "passed" as const, fingerprint: "compiler-pass", issues: [] },
    };
    expect(await completeGenerationAttempt(input)).not.toBeNull();
    expect(await completeGenerationAttempt(input)).not.toBeNull();
    const ledger = await db.select().from(iuLedgerEntries).where(eq(iuLedgerEntries.attemptId, attempt.id));
    expect(ledger.map((entry) => [entry.kind, entry.units])).toEqual(expect.arrayContaining([["reservation", 5], ["allocation", 5]]));
    expect(ledger.filter((entry) => entry.kind === "allocation")).toHaveLength(1);
    expect(ledger.every((entry) => !("inputTokens" in entry) && !("amountMinor" in entry))).toBe(true);
    const [account] = await db.select().from(iuAccounts).where(eq(iuAccounts.userId, fixture.ownerId));
    expect(account).toMatchObject({ availableUnits: 0, reservedUnits: 0 });
    await expect(db.update(generatedContentVersions).set({ contentFingerprint: "mutated" }).where(eq(generatedContentVersions.attemptId, attempt.id))).rejects.toThrow();
    await expect(transitionGenerationAttempt(fixture.ownerId, attempt.id, "running")).rejects.toThrow(/cannot transition/);
  });

  it("atomically releases the full reservation on failure and consumes zero units", async () => {
    const fixture = await createFixture("failure");
    const attempt = await makeRunningAttempt(fixture, "failure-attempt");
    expect(await failGenerationAttempt({
      userId: fixture.ownerId,
      attemptId: attempt.id,
      failureKind: "compiler",
      failureDetail: ["invalid_compiler_artifact"],
      validation: { kind: "compiler", status: "failed", fingerprint: "compiler-failure", issues: ["invalid_compiler_artifact"] },
    })).not.toBeNull();
    expect(await failGenerationAttempt({
      userId: fixture.ownerId,
      attemptId: attempt.id,
      failureKind: "compiler",
      validation: { kind: "compiler", status: "failed", fingerprint: "duplicate", issues: [] },
    })).not.toBeNull();
    const ledger = await db.select().from(iuLedgerEntries).where(eq(iuLedgerEntries.attemptId, attempt.id));
    expect(ledger.filter((entry) => entry.kind === "allocation")).toHaveLength(0);
    expect(ledger.filter((entry) => entry.kind === "release")).toHaveLength(1);
    expect(ledger.find((entry) => entry.kind === "release")?.units).toBe(5);
    expect(await db.select().from(generatedContentVersions).where(eq(generatedContentVersions.attemptId, attempt.id))).toHaveLength(0);
    const [account] = await db.select().from(iuAccounts).where(eq(iuAccounts.userId, fixture.ownerId));
    expect(account).toMatchObject({ availableUnits: 5, reservedUnits: 0 });
  });

  it("retains provider retry history and keeps provider cost separate from customer IU", async () => {
    const fixture = await createFixture("provider-history");
    const attempt = await makeRunningAttempt(fixture, "provider-attempt");
    const workItem = await addWorkItem(attempt.id, "provider");
    await appendProviderExecution(fixture.ownerId, {
      attemptId: attempt.id,
      workItemId: workItem.id,
      sequence: 1,
      promptId: "resume@1",
      requestFingerprint: "provider-request-1",
      provider: "deterministic-fake",
      model: "fake-v1",
      status: "failed",
      inputTokens: 100,
      outputTokens: 0,
      currency: "USD",
      amountMinor: 2,
      failure: "timeout",
      startedAt: new Date(),
      completedAt: new Date(),
    });
    await appendProviderExecution(fixture.ownerId, {
      attemptId: attempt.id,
      workItemId: workItem.id,
      sequence: 2,
      promptId: "resume@1",
      requestFingerprint: "provider-request-2",
      provider: "deterministic-fake",
      model: "fake-v1",
      status: "succeeded",
      inputTokens: 100,
      outputTokens: 50,
      currency: "USD",
      amountMinor: 4,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    const recovered = await findOwnedGenerationAttempt(fixture.ownerId, attempt.id);
    expect(recovered?.attempt.specificationRevision).toBe(1);
    expect(recovered?.attempt.specificationFingerprint).toBe("specification-provider-attempt");
    expect(recovered?.workItems).toHaveLength(1);
    expect(recovered?.executions.map((execution) => [execution.sequence, execution.status])).toEqual([[1, "failed"], [2, "succeeded"]]);
    expect(recovered?.executions[1]).toMatchObject({ inputTokens: 100, outputTokens: 50, amountMinor: 4 });
    const customerLedger = await db.select().from(iuLedgerEntries).where(eq(iuLedgerEntries.attemptId, attempt.id));
    expect(customerLedger.every((entry) => !("provider" in entry) && !("inputTokens" in entry) && !("amountMinor" in entry))).toBe(true);
    await expect(db.delete(providerExecutions).where(eq(providerExecutions.attemptId, attempt.id))).rejects.toThrow();
  });

  it("stores bounded evidence references and fingerprints without duplicating Dossier facts", async () => {
    const fixture = await createFixture("provenance");
    const attempt = await createGenerationAttempt(attemptInput(fixture, "provenance-attempt"));
    await db.insert(generationEvidenceManifestItems).values({
      attemptId: attempt!.id,
      evidenceId: "evidence-reference",
      applicationId: fixture.applicationId,
      sourceType: "experience",
      sourceRecordId: "experience-reference",
      evidenceFingerprint: "bounded-context-fingerprint",
    });
    const recovered = await findOwnedGenerationAttempt(fixture.ownerId, attempt!.id);
    expect(recovered?.evidence).toEqual([expect.objectContaining({
      evidenceId: "evidence-reference",
      applicationId: fixture.applicationId,
      sourceType: "experience",
      sourceRecordId: "experience-reference",
      evidenceFingerprint: "bounded-context-fingerprint",
    })]);
    expect(JSON.stringify(recovered?.evidence)).not.toContain("professional facts");
    await expect(db.delete(generationEvidenceManifestItems).where(eq(generationEvidenceManifestItems.attemptId, attempt!.id))).rejects.toThrow();
  });
});
