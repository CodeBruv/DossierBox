import { describe, expect, it, vi } from "vitest";
import { freeEntitlement } from "@/entitlements/entitlements";
import type { ProviderRequest, ProviderResult, WritingProvider } from "@/writing/provider";
import {
  orchestrateGeneration,
  type GenerationDependencies,
  type GenerationEvidenceRecord,
  type GenerationSpecification,
} from "./generation-orchestrator";
import type { GenerationRequest } from "./generation";

const request: GenerationRequest = {
  userId: "user_1",
  specificationId: "spec_1",
  specificationRevision: 3,
};

const evidence = (id: string, sourceType: GenerationEvidenceRecord["sourceType"] = "experience"): GenerationEvidenceRecord => ({
  evidenceId: id,
  applicationId: "application_1",
  sourceType,
  sourceRecordId: `${sourceType}_record_1`,
  excerpt: `${id} supplied career fact`,
  lifecycle: "active",
  source: {
    sourceType,
    sourceRecordId: `${sourceType}_record_1`,
    searchableText: `${id} supplied career fact with additional source text`,
  },
});

const specification: GenerationSpecification = {
  id: "spec_1",
  revision: 3,
  status: "approved",
  applicationId: "application_1",
  documentType: "professional_cv",
  purpose: "A product engineering role",
  instructions: "Use only supplied facts.",
  evidenceIds: ["e1", "e2"],
  requirementIds: ["requirement_1"],
};

const header = { name: "Ada Lovelace", headline: "Product engineer", contacts: [] };

function providerFake(calls: ProviderRequest[]) {
  const provider: WritingProvider = {
    id: "test",
    model: "test-model",
    complete: async (request): Promise<ProviderResult> => {
      calls.push(request);
      if (request.input.includes("Layout: prose")) {
        return { ok: true, text: '{"text":"Built products from supplied experience."}', model: "test-model" };
      }
      if (!request.input.includes("Layout: entries")) {
        return { ok: true, text: '{"bullets":["TypeScript","Product delivery"]}', model: "test-model" };
      }
      return {
        ok: true,
        text: '{"revisions":[{"factId":"e1","text":"Delivered supplied product work."},{"factId":"e2","text":"Applied supplied experience."}]}',
        model: "test-model",
      };
    },
  };
  return provider;
}

function dependencies(overrides: Partial<GenerationDependencies> = {}): GenerationDependencies {
  return {
    authenticate: vi.fn(async () => "user_1"),
    getSpecification: vi.fn(async () => specification),
    getEvidence: vi.fn(async (_userId, evidenceId) => evidence(evidenceId)),
    getHeader: vi.fn(async () => header),
    getEntitlement: vi.fn(async (_userId, now) => freeEntitlement(now)),
    now: () => new Date("2026-08-28T00:00:00.000Z"),
    ...overrides,
  };
}

describe("orchestrateGeneration", () => {
  it("pins the requested revision and does not invoke writing when authorization fails", async () => {
    const calls: ProviderRequest[] = [];
    const getSpecification = vi.fn(async () => specification);
    const result = await orchestrateGeneration(request, dependencies({
      authenticate: vi.fn(async () => "another_user"),
      getSpecification,
      writing: { provider: providerFake(calls) },
    }));

    expect(result).toMatchObject({ ok: false, failure: { kind: "authorization" } });
    expect(getSpecification).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("rejects a latest-revision substitution", async () => {
    const result = await orchestrateGeneration(request, dependencies({
      getSpecification: vi.fn(async () => ({ ...specification, revision: 4 })),
    }));

    expect(result).toMatchObject({ ok: false, failure: { kind: "specification" } });
  });

  it("resolves selected Evidence once, bounds it, orders work, and compiles in memory", async () => {
    const calls: ProviderRequest[] = [];
    const getEvidence = vi.fn(async (_userId: string, evidenceId: string) => ({
      ...evidence(evidenceId),
      excerpt: `${evidenceId} ${"x".repeat(2_000)}`,
    }));
    const result = await orchestrateGeneration(request, dependencies({
      getEvidence,
      writing: { provider: providerFake(calls) },
    }));

    if (!result.ok) throw new Error(JSON.stringify(result.failure));

    expect(result.compilation.ok).toBe(true);
    expect(result.workItems.map((item) => item.sectionKey)).toEqual([
      "summary",
      "experience",
      "education",
      "skills",
      "projects",
      "credentials",
      "achievements",
      "publications",
      "memberships",
      "languages",
      "links",
    ]);
    expect(getEvidence).toHaveBeenCalledTimes(2);
    expect(calls.length).toBe(result.workItems.length);
    expect(calls.every((call) => call.input.length < 24_000)).toBe(true);
    expect(result.provenance.summary?.evidenceIds).toEqual(["e1", "e2"]);
  });

  it("fails closed for cross-Application Evidence before provider execution", async () => {
    const calls: ProviderRequest[] = [];
    const result = await orchestrateGeneration(request, dependencies({
      getEvidence: vi.fn(async (_userId, evidenceId) => ({
        ...evidence(evidenceId),
        applicationId: "other_application",
      })),
      writing: { provider: providerFake(calls) },
    }));

    expect(result).toMatchObject({ ok: false, failure: { kind: "evidence" } });
    expect(calls).toHaveLength(0);
  });

  it("maps provider outcomes into the generation failure taxonomy", async () => {
    const result = await orchestrateGeneration(request, dependencies());

    expect(result).toMatchObject({ ok: false, failure: { kind: "provider", detail: ["unavailable"] } });
  });
});
