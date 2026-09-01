import { describe, expect, it } from "vitest";
import { emptyApplicationObjective } from "./objective";
import { deterministicallyMatch } from "./matching-repository";
import { resolveDeterministicApplicationPlan, resolveHybridApplicationPlan } from "./planning";
import type { OpportunityInterpretation } from "./opportunity-interpretation-response";

function interpretation(
  requestedDocuments: OpportunityInterpretation["requestedDocuments"],
): OpportunityInterpretation {
  return { context: [], requirements: [], constraints: [], requestedDocuments };
}

function request(name: string, support: "explicit" | "inferred" = "explicit") {
  return {
    name,
    details: null,
    priority: "required" as const,
    support,
    confidence: 1,
    sourceReference: `${name} requested`,
    constraints: [],
  };
}

describe("deterministic application bridge", () => {
  it("suggests a skill relationship without asserting satisfaction", () => {
    const result = deterministicallyMatch({
      requirementId: "requirement-1",
      requirementText: "TypeScript experience",
      category: "skill",
      evidenceId: "evidence-1",
      sourceType: "skills",
      searchableText: "TypeScript",
    });

    expect(result).toMatchObject({ status: "suggested", requirementId: "requirement-1", evidenceId: "evidence-1" });
    expect(result).not.toHaveProperty("satisfied");
  });

  it("does not suggest unsupported source compatibility", () => {
    expect(deterministicallyMatch({
      requirementId: "requirement-1",
      requirementText: "TypeScript experience",
      category: "skill",
      evidenceId: "evidence-1",
      sourceType: "education",
      searchableText: "TypeScript",
    })).toBeNull();
  });

  it("resolves a reviewable package from the existing objective defaults", () => {
    const proposal = resolveDeterministicApplicationPlan(emptyApplicationObjective("employment"), {
      requirements: 2,
      evidence: 3,
      openGaps: 1,
    });

    expect(proposal.resolutionSource).toBe("deterministic");
    expect(proposal.confirmation).toBe("unconfirmed");
    expect(proposal.recommendedDocuments).toEqual([
      "professional_resume",
      "cover_letter",
    ]);
    expect(proposal.packageMembers.map((member) => member.documentType)).toEqual(
      proposal.recommendedDocuments,
    );
    expect(proposal.packageMembers).toEqual([
      {
        documentType: "professional_resume",
        role: "primary",
        position: 0,
        availability: "available",
      },
      {
        documentType: "cover_letter",
        role: "supporting",
        position: 1,
        availability: "unavailable",
      },
    ]);
    expect(proposal.confirmation).toBe("unconfirmed");
    expect(proposal.gapsSummary).toEqual({ open: 1 });
  });

  it("keeps a user's different valid document choice outside the deterministic recommendation", () => {
    const proposal = resolveDeterministicApplicationPlan(emptyApplicationObjective("employment"), {
      requirements: 0,
      evidence: 0,
      openGaps: 0,
    });

    expect(proposal.recommendedDocuments).not.toContain("academic_cv");
    expect(proposal.packageMembers.map((member) => member.documentType)).not.toContain("academic_cv");
  });

  it("adds only explicit catalogue-backed opportunity requests to the baseline", () => {
    const proposal = resolveHybridApplicationPlan(emptyApplicationObjective("general_profile"), {
      requirements: 0,
      evidence: 0,
      openGaps: 0,
      interpretation: interpretation([request("Cover letter")]),
      maxPackageSize: 3,
    });

    expect(proposal.recommendedDocuments).toEqual(["professional_cv", "cover_letter"]);
    expect(proposal.packageMembers[0].reason).toBe("application");
    expect(proposal.packageMembers[1]).toMatchObject({
      documentType: "cover_letter",
      reason: "opportunity_explicit",
      availability: "unavailable",
    });
  });

  it("keeps inferred requests advisory and unsupported explicit requests visible", () => {
    const proposal = resolveHybridApplicationPlan(emptyApplicationObjective("general_profile"), {
      requirements: 0,
      evidence: 0,
      openGaps: 0,
      interpretation: interpretation([
        request("Cover letter", "inferred"),
        request("Portfolio dossier"),
      ]),
    });

    expect(proposal.recommendedDocuments).toEqual(["professional_cv"]);
    expect(proposal.advisoryDocuments?.map((item) => item.name)).toEqual(["Cover letter"]);
    expect(proposal.unsupportedDocuments?.map((item) => item.name)).toEqual(["Portfolio dossier"]);
  });

  it("preserves the objective baseline when an explicit request conflicts or exceeds the package limit", () => {
    const proposal = resolveHybridApplicationPlan(emptyApplicationObjective("employment"), {
      requirements: 0,
      evidence: 0,
      openGaps: 0,
      interpretation: interpretation([request("Academic CV"), request("Research statement")]),
      maxPackageSize: 3,
    });

    expect(proposal.recommendedDocuments.slice(0, 2)).toEqual(["professional_resume", "cover_letter"]);
    expect(proposal.recommendedDocuments).toContain("academic_cv");
    expect(proposal.recommendedDocuments).not.toContain("research_statement");
    expect(proposal.unsupportedDocuments).toEqual([]);
    expect(proposal.constrainedDocuments?.map((item) => item.name)).toEqual(["Research statement"]);
    expect(proposal.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("differs from the Application Intent baseline"),
      expect.stringContaining("package's document limit"),
    ]));
    expect(proposal.constrained).toBe(true);
  });
});
