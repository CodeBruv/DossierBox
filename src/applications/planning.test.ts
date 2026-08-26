import { describe, expect, it } from "vitest";
import { emptyApplicationObjective } from "./objective";
import { deterministicallyMatch } from "./matching-repository";
import { resolveDeterministicApplicationPlan } from "./planning";

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
    expect(proposal.packageMembers.map((member) => member.documentType)).toEqual([
      "professional_resume",
      "cover_letter",
    ]);
    expect(proposal.packageMembers[0]?.position).toBe(0);
    expect(proposal.gapsSummary).toEqual({ open: 1 });
  });
});
