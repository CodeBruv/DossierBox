import { describe, expect, it } from "vitest";
import {
  fingerprintEvidence,
  fingerprintRequirement,
  stableFingerprint,
} from "./evidence-selection-domain";
import { deterministicallyMatch } from "./matching-repository";

describe("Evidence selection domain", () => {
  it("creates stable canonical fingerprints independent of object key order and whitespace", () => {
    expect(stableFingerprint({ b: "  TypeScript   work ", a: { y: 2, x: 1 } })).toBe(
      stableFingerprint({ a: { x: 1, y: 2 }, b: "TypeScript work" }),
    );
  });

  it("changes Requirement and Evidence fingerprints when authoritative content changes", () => {
    const requirement = {
      text: "TypeScript experience",
      category: "skill",
      constraints: { years: 3 },
      normalizedInterpretation: "Three years of TypeScript",
      sourceId: "source-1",
      sourceReference: "Requirements section",
    };
    const evidence = {
      sourceType: "skills",
      sourceRecordId: "skill-1",
      searchableText: "TypeScript",
      excerpt: null,
    };

    expect(fingerprintRequirement(requirement)).not.toBe(
      fingerprintRequirement({ ...requirement, constraints: { years: 5 } }),
    );
    expect(fingerprintEvidence(evidence)).not.toBe(
      fingerprintEvidence({ ...evidence, searchableText: "Rust" }),
    );
  });

  it("produces deterministic advisory candidates and suggestions without confirmation", () => {
    const candidate = deterministicallyMatch({
      requirementId: "requirement-1",
      requirementText: "TypeScript API platform delivery",
      category: "skill",
      evidenceId: "evidence-1",
      sourceType: "skills",
      searchableText: "TypeScript",
    });
    const suggestion = deterministicallyMatch({
      requirementId: "requirement-1",
      requirementText: "TypeScript API",
      category: "skill",
      evidenceId: "evidence-1",
      sourceType: "skills",
      searchableText: "TypeScript API",
    });

    expect(candidate).toMatchObject({ status: "candidate" });
    expect(suggestion).toMatchObject({ status: "suggested" });
    expect(candidate).not.toHaveProperty("confirmedAt");
    expect(suggestion).not.toHaveProperty("confirmedByUserId");
  });

  it("returns no match for absent overlap or an incompatible skill source", () => {
    expect(deterministicallyMatch({
      requirementId: "requirement-1",
      requirementText: "TypeScript",
      category: "skill",
      evidenceId: "evidence-1",
      sourceType: "experience",
      searchableText: "TypeScript",
    })).toBeNull();

    expect(deterministicallyMatch({
      requirementId: "requirement-1",
      requirementText: "TypeScript",
      category: "skill",
      evidenceId: "evidence-1",
      sourceType: "skills",
      searchableText: "Rust",
    })).toBeNull();
  });
});
