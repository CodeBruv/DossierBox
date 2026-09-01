import "server-only";

import type { Entitlement } from "@/entitlements/entitlements";
import { requireCapability, requireQuota } from "@/entitlements/entitlements";
import { fingerprintJson } from "@/documents/generation-domain";
import type { GenerationAttemptRow } from "@/documents/generation-schema";
import {
  defaultProviderLimits,
  requestFingerprint,
  runProvider,
  unavailableProvider,
  type ProviderLimits,
  type WritingProvider,
} from "@/writing/provider";
import {
  opportunityInterpretationContractVersion,
  opportunityInterpretationSchemaVersion,
  opportunityInterpretationSystemPrompt,
  renderOpportunityInterpretationInput,
} from "./opportunity-interpretation-prompt";
import {
  parseOpportunityInterpretation,
  type OpportunityInterpretation,
} from "./opportunity-interpretation-response";

export type OpportunityInterpretationRequest = {
  readonly applicationId: string;
  readonly opportunityId: string;
  readonly opportunitySourceId: string;
  readonly idempotencyKey: string;
};

export type OpportunityInterpretationTarget = {
  readonly application: { readonly id: string };
  readonly opportunity: {
    readonly id: string;
    readonly extractedText: string | null;
    readonly interpretation: Record<string, unknown> | null;
  };
  readonly source: {
    readonly id: string;
    readonly extractedContentStatus: string;
    readonly contentFingerprint: string | null;
  };
};

export const opportunityInterpretationResultCodes = [
  "interpreted",
  "already_interpreted",
  "in_progress",
  "authentication_required",
  "source_not_found",
  "source_empty",
  "source_unavailable",
  "paid_plan_required",
  "quota_exhausted",
  "insufficient_iu",
  "provider_unavailable",
  "provider_failed",
  "malformed_output",
  "validation_failed",
  "stale_source",
  "retry_available",
  "unexpected_failure",
] as const;

export type OpportunityInterpretationResultCode =
  (typeof opportunityInterpretationResultCodes)[number];

export type OpportunityInterpretationExecutionResult =
  | {
      readonly ok: true;
      readonly code: "interpreted" | "already_interpreted";
      readonly interpretation: OpportunityInterpretation | Record<string, unknown>;
      readonly attemptId: string;
    }
  | {
      readonly ok: false;
      readonly code: Exclude<
        OpportunityInterpretationResultCode,
        "interpreted" | "already_interpreted"
      >;
      readonly attemptId?: string;
    };

export type OpportunityInterpretationPersistence = {
  readonly getTarget: (
    userId: string,
    request: OpportunityInterpretationRequest,
  ) => Promise<OpportunityInterpretationTarget | null>;
  readonly findAttempt: (
    userId: string,
    sourceId: string,
    sourceFingerprint: string,
    contractVersion: string,
  ) => Promise<GenerationAttemptRow | null>;
  readonly countSuccessful: (userId: string, since: Date) => Promise<number>;
  readonly createAttempt: (input: {
    userId: string;
    applicationId: string;
    opportunityId: string;
    opportunitySourceId: string;
    sourceFingerprint: string;
    contractVersion: string;
    requestFingerprint: string;
    endpoint: string;
    idempotencyKey: string;
    entitlementPlan: string;
    estimatedUnits: number;
  }) => Promise<GenerationAttemptRow | null>;
  readonly reserve: (input: {
    userId: string;
    attemptId: string;
    units: number;
    entitlementPlan: string;
  }) => Promise<unknown | null>;
  readonly transition: (
    userId: string,
    attemptId: string,
    status: "running",
  ) => Promise<GenerationAttemptRow | null>;
  readonly recordProviderExecution: (input: {
    userId: string;
    attemptId: string;
    requestFingerprint: string;
    provider: string;
    model: string | null;
    status: "succeeded" | "failed";
    inputTokens?: number;
    outputTokens?: number;
    failure: string | null;
    startedAt: Date;
    completedAt: Date;
  }) => Promise<unknown | null>;
  readonly fail: (input: {
    userId: string;
    attemptId: string;
    failureKind: string;
    failureDetail: readonly string[];
    validationKind: "provider" | "response" | "provenance";
    validationFingerprint: string;
  }) => Promise<unknown | null>;
  readonly complete: (input: {
    userId: string;
    attemptId: string;
    entitlementPlan: string;
    interpretation: OpportunityInterpretation;
    schemaVersion: string;
    validationFingerprint: string;
  }) => Promise<{ opportunity: { interpretation: Record<string, unknown> | null } } | null>;
};

export type OpportunityInterpretationDependencies = {
  readonly authenticate: () => Promise<string | null>;
  readonly getEntitlement: (userId: string, now: Date) => Promise<Entitlement>;
  readonly persistence: OpportunityInterpretationPersistence;
  readonly provider?: WritingProvider;
  readonly providerLimits?: ProviderLimits;
  readonly now?: () => Date;
};

const interpretationUnits = 1;
const endpoint = "opportunity-interpretation";

export async function orchestrateOpportunityInterpretation(
  request: OpportunityInterpretationRequest,
  dependencies: OpportunityInterpretationDependencies,
): Promise<OpportunityInterpretationExecutionResult> {
  let attemptId: string | undefined;
  try {
    const userId = await dependencies.authenticate();
    if (!userId) return { ok: false, code: "authentication_required" };

    const target = await dependencies.persistence.getTarget(userId, request);
    if (!target) return { ok: false, code: "source_not_found" };
    if (target.source.extractedContentStatus !== "available") {
      return { ok: false, code: "source_unavailable" };
    }
    const sourceText = target.opportunity.extractedText?.trim();
    if (!sourceText) return { ok: false, code: "source_empty" };
    const sourceFingerprint = target.source.contentFingerprint;
    if (!sourceFingerprint) return { ok: false, code: "source_unavailable" };

    const now = dependencies.now?.() ?? new Date();
    const entitlement = await dependencies.getEntitlement(userId, now);
    if (!requireCapability(entitlement, "opportunity_interpretation").allowed) {
      return { ok: false, code: "paid_plan_required" };
    }

    const existing = await dependencies.persistence.findAttempt(
      userId,
      target.source.id,
      sourceFingerprint,
      opportunityInterpretationContractVersion,
    );
    if (existing?.status === "succeeded" && target.opportunity.interpretation) {
      return {
        ok: true,
        code: "already_interpreted",
        interpretation: target.opportunity.interpretation,
        attemptId: existing.id,
      };
    }
    if (existing && ["created", "reserved", "running"].includes(existing.status)) {
      return { ok: false, code: "in_progress", attemptId: existing.id };
    }

    const consumed = await dependencies.persistence.countSuccessful(
      userId,
      beginningOfUtcMonth(now),
    );
    if (!requireQuota(
      entitlement,
      "opportunity_interpretations",
      consumed,
      1,
    ).allowed) return { ok: false, code: "quota_exhausted" };

    const providerRequest = {
      system: opportunityInterpretationSystemPrompt,
      input: renderOpportunityInterpretationInput(sourceText),
      maxOutputCharacters: (dependencies.providerLimits ?? defaultProviderLimits)
        .maxOutputCharacters,
    };
    const fingerprint = requestFingerprint(
      opportunityInterpretationContractVersion,
      providerRequest,
    );
    const attempt = await dependencies.persistence.createAttempt({
      userId,
      applicationId: request.applicationId,
      opportunityId: request.opportunityId,
      opportunitySourceId: request.opportunitySourceId,
      sourceFingerprint,
      contractVersion: opportunityInterpretationContractVersion,
      requestFingerprint: fingerprint,
      endpoint,
      idempotencyKey: request.idempotencyKey,
      entitlementPlan: entitlement.plan,
      estimatedUnits: interpretationUnits,
    });
    if (!attempt) return { ok: false, code: "stale_source" };
    attemptId = attempt.id;
    if (attempt.status === "succeeded" && target.opportunity.interpretation) {
      return {
        ok: true,
        code: "already_interpreted",
        interpretation: target.opportunity.interpretation,
        attemptId,
      };
    }
    if (attempt.status !== "created") {
      return { ok: false, code: "in_progress", attemptId };
    }

    const reservation = await dependencies.persistence.reserve({
      userId,
      attemptId,
      units: interpretationUnits,
      entitlementPlan: entitlement.plan,
    });
    if (!reservation) {
      await persistFailure(dependencies.persistence, {
        userId,
        attemptId,
        failureKind: "entitlement",
        detail: ["insufficient_iu"],
        validationKind: "provider",
      });
      return { ok: false, code: "insufficient_iu", attemptId };
    }
    const running = await dependencies.persistence.transition(userId, attemptId, "running");
    if (!running) throw new Error("Reserved interpretation attempt could not start.");

    const startedAt = dependencies.now?.() ?? new Date();
    const providerRun = await runProvider(
      dependencies.provider ?? unavailableProvider,
      providerRequest,
      dependencies.providerLimits ?? defaultProviderLimits,
    );
    const completedAt = dependencies.now?.() ?? new Date();
    await dependencies.persistence.recordProviderExecution({
      userId,
      attemptId,
      requestFingerprint: fingerprint,
      provider: providerRun.provider,
      model: providerRun.ok ? providerRun.model : null,
      status: providerRun.ok ? "succeeded" : "failed",
      ...(providerRun.ok && providerRun.inputTokens !== undefined
        ? { inputTokens: providerRun.inputTokens }
        : {}),
      ...(providerRun.ok && providerRun.outputTokens !== undefined
        ? { outputTokens: providerRun.outputTokens }
        : {}),
      failure: providerRun.ok ? null : providerRun.failure,
      startedAt,
      completedAt,
    });

    if (!providerRun.ok) {
      await persistFailure(dependencies.persistence, {
        userId,
        attemptId,
        failureKind: "provider",
        detail: [providerRun.failure],
        validationKind: "provider",
      });
      return {
        ok: false,
        code: providerRun.failure === "unavailable"
          ? "provider_unavailable"
          : "provider_failed",
        attemptId,
      };
    }

    const parsed = parseOpportunityInterpretation(providerRun.text, sourceText);
    if (!parsed.ok) {
      await persistFailure(dependencies.persistence, {
        userId,
        attemptId,
        failureKind: "response",
        detail: [parsed.problem],
        validationKind: parsed.problem === "unsupported_source_reference"
          ? "provenance"
          : "response",
      });
      return {
        ok: false,
        code: parsed.problem === "malformed_json"
          ? "malformed_output"
          : "validation_failed",
        attemptId,
      };
    }

    const completed = await dependencies.persistence.complete({
      userId,
      attemptId,
      entitlementPlan: entitlement.plan,
      interpretation: parsed.interpretation,
      schemaVersion: opportunityInterpretationSchemaVersion,
      validationFingerprint: fingerprintJson(parsed.interpretation),
    });
    if (!completed) {
      await persistFailure(dependencies.persistence, {
        userId,
        attemptId,
        failureKind: "stale_source",
        detail: ["source_changed_before_completion"],
        validationKind: "provenance",
      });
      return { ok: false, code: "stale_source", attemptId };
    }

    return {
      ok: true,
      code: "interpreted",
      interpretation: parsed.interpretation,
      attemptId,
    };
  } catch {
    if (attemptId) {
      try {
        const userId = await dependencies.authenticate();
        if (userId) {
          await persistFailure(dependencies.persistence, {
            userId,
            attemptId,
            failureKind: "unexpected",
            detail: ["unexpected_failure"],
            validationKind: "provider",
          });
        }
      } catch {
        // The stable retry result is still preferable if failure persistence itself is unavailable.
      }
    }
    return {
      ok: false,
      code: attemptId ? "retry_available" : "unexpected_failure",
      ...(attemptId ? { attemptId } : {}),
    };
  }
}

function beginningOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function persistFailure(
  persistence: OpportunityInterpretationPersistence,
  input: {
    userId: string;
    attemptId: string;
    failureKind: string;
    detail: readonly string[];
    validationKind: "provider" | "response" | "provenance";
  },
): Promise<void> {
  await persistence.fail({
    userId: input.userId,
    attemptId: input.attemptId,
    failureKind: input.failureKind,
    failureDetail: input.detail,
    validationKind: input.validationKind,
    validationFingerprint: fingerprintJson({
      kind: input.failureKind,
      detail: input.detail,
    }),
  });
}
