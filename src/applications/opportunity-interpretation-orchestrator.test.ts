import { describe, expect, it, vi } from "vitest";
import { entitlementFor, freeEntitlement } from "@/entitlements/entitlements";
import type { GenerationAttemptRow } from "@/documents/generation-schema";
import type { ProviderRequest, WritingProvider } from "@/writing/provider";
import {
  orchestrateOpportunityInterpretation,
  type OpportunityInterpretationDependencies,
  type OpportunityInterpretationPersistence,
} from "./opportunity-interpretation-orchestrator";

const sourceText = [
  "Applicants must have three years of TypeScript experience.",
  "Submit a CV in PDF format by 30 September.",
].join(" ");

const interpretation = {
  context: [],
  requirements: [{
    text: "Three years of TypeScript experience",
    normalized: "3 years TypeScript experience",
    category: "experience",
    priority: "required",
    support: "explicit",
    confidence: 0.98,
    sourceReference: "three years of TypeScript experience",
    constraints: [],
  }],
  requestedDocuments: [{
    name: "CV",
    details: "PDF format",
    priority: "required",
    support: "explicit",
    confidence: 0.99,
    sourceReference: "Submit a CV in PDF format",
    constraints: ["PDF format"],
  }],
  constraints: [{
    text: "Submit by 30 September",
    category: "administrative_constraint",
    support: "explicit",
    confidence: 0.99,
    sourceReference: "by 30 September",
  }],
} as const;

const request = {
  applicationId: "application_1",
  opportunityId: "opportunity_1",
  opportunitySourceId: "source_1",
  idempotencyKey: "request_1",
};

function attempt(status: GenerationAttemptRow["status"]): GenerationAttemptRow {
  return {
    id: "attempt_1",
    userId: "user_1",
    applicationId: "application_1",
    operationKind: "opportunity_interpretation",
    specificationId: null,
    specificationRevision: null,
    specificationFingerprint: null,
    evidenceFingerprint: null,
    opportunityId: "opportunity_1",
    opportunitySourceId: "source_1",
    sourceFingerprint: "sha256:source",
    contractVersion: "opportunity-interpretation@1",
    requestFingerprint: "request-fingerprint",
    endpoint: "opportunity-interpretation",
    idempotencyKey: "request_1",
    status,
    entitlementPlan: "plus",
    estimatedUnits: 1,
    failureKind: null,
    failureDetail: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    completedAt: status === "succeeded" ? new Date("2026-09-01T00:01:00.000Z") : null,
  };
}

function persistence(
  overrides: Partial<OpportunityInterpretationPersistence> = {},
): OpportunityInterpretationPersistence {
  return {
    getTarget: vi.fn(async () => ({
      application: { id: "application_1" },
      opportunity: {
        id: "opportunity_1",
        extractedText: sourceText,
        interpretation: null,
      },
      source: {
        id: "source_1",
        extractedContentStatus: "available",
        contentFingerprint: "sha256:source",
      },
    })),
    findAttempt: vi.fn(async () => null),
    countSuccessful: vi.fn(async () => 0),
    createAttempt: vi.fn(async () => attempt("created")),
    reserve: vi.fn(async () => ({ id: "reservation_1" })),
    transition: vi.fn(async () => attempt("running")),
    recordProviderExecution: vi.fn(async () => ({ id: "execution_1" })),
    fail: vi.fn(async () => attempt("failed")),
    complete: vi.fn(async () => ({
      opportunity: { interpretation: interpretation as unknown as Record<string, unknown> },
    })),
    ...overrides,
  };
}

function provider(calls: ProviderRequest[], text = JSON.stringify(interpretation)): WritingProvider {
  return {
    id: "injected-test-provider",
    model: "test-model",
    async complete(providerRequest) {
      calls.push(providerRequest);
      return { ok: true, text, model: "test-model" };
    },
  };
}

function dependencies(
  persistenceBoundary: OpportunityInterpretationPersistence,
  calls: ProviderRequest[],
  overrides: Partial<OpportunityInterpretationDependencies> = {},
): OpportunityInterpretationDependencies {
  return {
    authenticate: vi.fn(async () => "user_1"),
    getEntitlement: vi.fn(async (_userId, now) => entitlementFor({
      plan: "plus",
      status: "active",
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      provider: null,
      providerSubscriptionId: null,
    }, now)),
    persistence: persistenceBoundary,
    provider: provider(calls),
    now: () => new Date("2026-09-12T10:00:00.000Z"),
    ...overrides,
  };
}

describe("orchestrateOpportunityInterpretation", () => {
  it("fails closed on the Free entitlement before reserving IU or calling a provider", async () => {
    const calls: ProviderRequest[] = [];
    const boundary = persistence();
    const result = await orchestrateOpportunityInterpretation(request, dependencies(
      boundary,
      calls,
      { getEntitlement: vi.fn(async (_userId, now) => freeEntitlement(now)) },
    ));

    expect(result).toEqual({ ok: false, code: "paid_plan_required" });
    expect(boundary.reserve).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("returns a successful persisted interpretation without another provider call or IU reservation", async () => {
    const calls: ProviderRequest[] = [];
    const persistedInterpretation = interpretation as unknown as Record<string, unknown>;
    const boundary = persistence({
      getTarget: vi.fn(async () => ({
        application: { id: "application_1" },
        opportunity: {
          id: "opportunity_1",
          extractedText: sourceText,
          interpretation: persistedInterpretation,
        },
        source: {
          id: "source_1",
          extractedContentStatus: "available",
          contentFingerprint: "sha256:source",
        },
      })),
      findAttempt: vi.fn(async () => attempt("succeeded")),
    });

    const result = await orchestrateOpportunityInterpretation(
      request,
      dependencies(boundary, calls),
    );

    expect(result).toMatchObject({ ok: true, code: "already_interpreted" });
    expect(boundary.reserve).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("reserves before provider execution, validates dedicated JSON, and completes atomically", async () => {
    const calls: ProviderRequest[] = [];
    const order: string[] = [];
    const boundary = persistence({
      reserve: vi.fn(async () => {
        order.push("reserve");
        return { id: "reservation_1" };
      }),
      recordProviderExecution: vi.fn(async () => {
        order.push("record");
        return { id: "execution_1" };
      }),
      complete: vi.fn(async () => {
        order.push("complete");
        return { opportunity: { interpretation: {} } };
      }),
    });
    const injected = provider(calls);
    const result = await orchestrateOpportunityInterpretation(
      request,
      dependencies(boundary, calls, {
        provider: {
          ...injected,
          async complete(providerRequest, signal) {
            order.push("provider");
            return injected.complete(providerRequest, signal);
          },
        },
      }),
    );

    expect(result).toMatchObject({ ok: true, code: "interpreted" });
    expect(order).toEqual(["reserve", "provider", "record", "complete"]);
    expect(calls[0]?.system).toContain("untrusted data");
    expect(calls[0]?.input).toContain("<OPPORTUNITY_SOURCE_DATA>");
  });

  it("records malformed provider output as a failure so the full reservation can be released", async () => {
    const calls: ProviderRequest[] = [];
    const boundary = persistence();
    const result = await orchestrateOpportunityInterpretation(
      request,
      dependencies(boundary, calls, { provider: provider(calls, "not json") }),
    );

    expect(result).toMatchObject({ ok: false, code: "malformed_output" });
    expect(boundary.fail).toHaveBeenCalledWith(expect.objectContaining({
      failureKind: "response",
      failureDetail: ["malformed_json"],
    }));
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it("uses the unavailable provider by default and persists release-triggering failure", async () => {
    const calls: ProviderRequest[] = [];
    const boundary = persistence();
    const result = await orchestrateOpportunityInterpretation(
      request,
      dependencies(boundary, calls, { provider: undefined }),
    );

    expect(result).toMatchObject({ ok: false, code: "provider_unavailable" });
    expect(boundary.fail).toHaveBeenCalledWith(expect.objectContaining({
      failureKind: "provider",
      failureDetail: ["unavailable"],
    }));
    expect(calls).toHaveLength(0);
  });
});
