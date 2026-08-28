import "server-only";

import { fingerprintGenerationRequest, fingerprintJson } from "./generation-domain";
import type { GenerationEvidence } from "./generation";
import type { GenerationPersistence } from "./generation-orchestrator";
import {
  addEvidenceManifest,
  addGenerationWorkItems,
  completeGenerationAttempt,
  appendGenerationValidation,
  appendProviderExecution,
  createGenerationAttempt,
  getOwnedGenerationContext,
  getOwnedGenerationWorkItem,
  reserveGenerationUnits,
  settleGenerationUnits,
  transitionGenerationAttempt,
  updateGenerationWorkItemStatus,
} from "./generation-repository";
import { estimatedUnits } from "@/entitlements/usage";

export function createDurableGenerationPersistence(): GenerationPersistence {
  return {
    async prepare(input) {
      if (!input.request.idempotencyKey?.trim()) {
        return { ok: false, message: "A durable generation request requires an idempotency key." };
      }

      const specificationFingerprint = fingerprintJson({
        id: input.specification.id,
        revision: input.specification.revision,
        status: input.specification.status,
        documentType: input.specification.documentType,
        purpose: input.specification.purpose,
        constraints: input.specification.constraints,
        instructions: input.specification.instructions,
        context: input.specification.context,
        sectionExpectations: input.specification.sectionExpectations,
        outputCharacteristics: input.specification.outputCharacteristics,
        requirementIds: input.specification.requirementIds,
        evidenceIds: input.specification.evidenceIds,
      });
      const evidenceFingerprint = fingerprintJson(input.evidence.map(({ evidenceId, sourceType, sourceRecordId, excerpt }) => ({ evidenceId, sourceType, sourceRecordId, excerpt })));
      const requestFingerprint = fingerprintGenerationRequest({
        userId: input.request.userId,
        applicationId: input.specification.applicationId,
        specificationId: input.request.specificationId,
        specificationRevision: input.request.specificationRevision,
        specificationFingerprint,
        evidenceFingerprint,
        requestedWorkloads: input.workItems.map((item) => item.workload),
      });
      const units = estimatedUnits(input.workItems.map((item) => item.workload));
      const attempt = await createGenerationAttempt({
        userId: input.request.userId,
        applicationId: input.specification.applicationId,
        specificationId: input.specification.id,
        specificationRevision: input.specification.revision,
        specificationFingerprint,
        evidenceFingerprint,
        requestFingerprint,
        idempotencyKey: input.request.idempotencyKey,
        entitlementPlan: input.entitlement.plan,
        estimatedUnits: units,
      });
      if (!attempt) return { ok: false, message: "The generation attempt is not authorized or its specification is not approved." };
      if (attempt.status !== "created") {
        return { ok: false, message: "This generation request has already been accepted." };
      }

      await addGenerationWorkItems(attempt.id, input.workItems.map((item) => ({
        sectionKey: item.sectionKey,
        heading: item.heading,
        layout: item.layout,
        workOrder: item.order,
        workload: item.workload,
        evidenceManifest: item.selectedEvidence.map(manifestEvidence),
        contextFingerprint: fingerprintJson(item),
        status: "pending",
      })));
      await addEvidenceManifest(attempt.id, input.evidence.map((evidence) => ({
        evidenceId: evidence.evidenceId,
        applicationId: input.specification.applicationId,
        sourceType: evidence.sourceType,
        sourceRecordId: evidence.sourceRecordId,
        evidenceFingerprint: fingerprintJson(evidence),
      })));

      const reservation = await reserveGenerationUnits({
        userId: input.request.userId,
        attemptId: attempt.id,
        units,
        entitlementPlan: input.entitlement.plan,
      });
      if (!reservation) {
        await transitionGenerationAttempt(input.request.userId, attempt.id, "failed", "entitlement", ["insufficient_units"]);
        return { ok: false, message: "Generation units are unavailable." };
      }
      const running = await transitionGenerationAttempt(input.request.userId, attempt.id, "running");
      if (!running) throw new Error("Reserved Generation Attempt could not start.");
      return { ok: true, attemptId: attempt.id };
    },

    async recordWorkItemOutcome(input) {
      const context = await getOwnedGenerationContext(input.userId, input.attemptId);
      if (!context) throw new Error("Generation attempt context was not found.");
      const workItem = await getOwnedGenerationWorkItem(input.userId, input.attemptId, input.item.sectionKey);
      if (!workItem) throw new Error("Persisted generation work item was not found.");
      await updateGenerationWorkItemStatus({ userId: input.userId, attemptId: input.attemptId, workItemId: workItem.id, status: "running" });
      const usage = input.outcome.usage;
      await appendProviderExecution({
        attemptId: input.attemptId,
        workItemId: workItem.id,
        sequence: input.sequence,
        promptId: input.outcome.promptId,
        requestFingerprint: input.outcome.status === "written" ? input.outcome.fingerprint : fingerprintJson(input.outcome.context),
        provider: usage.provider,
        model: usage.model,
        status: input.outcome.status === "written" ? "succeeded" : "failed",
        inputTokens: usage.providerCost?.inputTokens,
        outputTokens: usage.providerCost?.outputTokens,
        currency: usage.providerCost?.currency,
        amountMinor: usage.providerCost?.amountMinor,
        failure: input.outcome.status === "written" ? null : input.outcome.status === "insufficient" ? "insufficient_context" : input.outcome.cause,
        startedAt: usage.occurredAt,
        completedAt: usage.occurredAt,
      });
      await appendGenerationValidation({
        attemptId: input.attemptId,
        workItemId: workItem.id,
        kind: input.outcome.status === "written" ? "provider" : input.outcome.status === "insufficient" ? "normalization" : input.outcome.cause === "review" ? "integrity" : input.outcome.cause === "response" ? "response" : "provider",
        status: input.outcome.status === "written" ? "passed" : "failed",
        fingerprint: fingerprintJson(input.outcome),
        issues: input.outcome.status === "written" ? [] : [input.outcome.status],
      });
      await updateGenerationWorkItemStatus({ userId: input.userId, attemptId: input.attemptId, workItemId: workItem.id, status: input.outcome.status === "written" ? "succeeded" : "failed" });
    },

    async fail(input) {
      const context = await getOwnedGenerationContext(input.userId, input.attemptId);
      if (!context) throw new Error("Generation attempt context was not found.");
      await appendGenerationValidation({
        attemptId: input.attemptId,
        kind: input.failure.kind === "compiler" ? "compiler" : input.failure.kind === "integrity" ? "integrity" : "required_sections",
        status: "failed",
        fingerprint: fingerprintJson(input.failure),
        issues: input.failure.detail ? [...input.failure.detail] : [input.failure.kind],
      });
      await settleGenerationUnits({ userId: input.userId, attemptId: input.attemptId, succeeded: false, entitlementPlan: context.attempt.entitlementPlan });
      await transitionGenerationAttempt(input.userId, input.attemptId, "failed", input.failure.kind, input.failure.detail);
    },

    async succeed(input) {
      const context = await getOwnedGenerationContext(input.userId, input.attemptId);
      if (!context) throw new Error("Generation attempt context was not found.");
      const completed = await completeGenerationAttempt({
        userId: input.userId,
        attemptId: input.attemptId,
        entitlementPlan: context.attempt.entitlementPlan,
        artifact: {
          version: 1,
          documentType: context.documentType,
          content: input.compilation.content as unknown as Record<string, unknown>,
          provenance: input.provenance,
          contentFingerprint: fingerprintJson(input.candidate),
          compilerFingerprint: fingerprintJson(input.compilation),
        },
        compilerValidation: {
          kind: "compiler",
          status: "passed",
          fingerprint: fingerprintJson(input.compilation),
          issues: [],
        },
      });
      if (!completed) throw new Error("Generation Attempt completion was rejected.");
    },
  };
}

function manifestEvidence(evidence: GenerationEvidence): Record<string, unknown> {
  return {
    evidenceId: evidence.evidenceId,
    sourceType: evidence.sourceType,
    sourceRecordId: evidence.sourceRecordId,
    excerptFingerprint: fingerprintJson(evidence.excerpt),
  };
}

export type DurableGenerationPersistenceOptions = { readonly unused?: never };

export function durableGenerationPersistence(_options?: DurableGenerationPersistenceOptions): GenerationPersistence {
  return createDurableGenerationPersistence();
}
