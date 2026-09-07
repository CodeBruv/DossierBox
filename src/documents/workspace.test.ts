import { describe, expect, it } from "vitest";
import { emptyDossierSnapshot, type DossierIdentity, type DossierSnapshot } from "@/profile/dossier";
import { composeDocument, composeEvidenceBoundDocument, composableSections, type SelectedEvidence } from "./composition";
import { resolveCurrentEvidenceState } from "./read-composition";
import { isPresentationStyleId, resolvePresentationStyle } from "./presentation";

const identity: DossierIdentity = {
  displayName: "Ada Lovelace",
  headline: "Mathematical engineer",
  careerDirection: null,
  contactEmail: "ada@example.invalid",
  phone: null,
  city: null,
  region: null,
  country: null,
  website: null,
};

function snapshot(overrides: Partial<DossierSnapshot> = {}): DossierSnapshot {
  return { ...emptyDossierSnapshot(identity), ...overrides, identity: { ...identity, ...overrides.identity } };
}

describe("Document Workspace customization boundary", () => {
  it("recomposes deterministically when sections are hidden or reordered", () => {
    const source = snapshot({ experience: [] });
    const sections = composableSections("professional_resume", source);
    const reordered = [...sections].reverse().map(({ key }) => key);
    const composed = composeDocument("professional_resume", source, {
      hiddenSections: ["summary"],
      sectionOrder: reordered,
    });

    expect(composed.sections.some((section) => section.key === "summary")).toBe(false);
    expect(composed.sections.map((section) => section.key)).toEqual(
      reordered.filter((key) => key !== "summary" && sections.some((section) => section.key === key)),
    );
    expect(composed.header.name).toBe("Ada Lovelace");
  });

  it("keeps unsupported style values out of the supported Workspace vocabulary", () => {
    expect(isPresentationStyleId("classic")).toBe(true);
    expect(isPresentationStyleId("font-size-18")).toBe(false);
    expect(resolvePresentationStyle("font-size-18", "professional_resume").id).toBe("compact");
  });

  it("never renders a Dossier row that is outside the approved Evidence boundary", () => {
    const source = snapshot({
      projects: [
        { id: "project-a", name: "Approved project A", role: "Engineer", context: null, url: null, description: "Selected source", startMonth: null, startYear: null, endMonth: null, endYear: null, current: false },
        { id: "project-b", name: "Unselected project B", role: "Engineer", context: null, url: null, description: "Must stay out", startMonth: null, startYear: null, endMonth: null, endYear: null, current: false },
      ],
    });
    const selectedEvidence: SelectedEvidence[] = [{ evidenceId: "evidence-a", sourceType: "projects", sourceRecordId: "project-a" }];
    const composed = composeEvidenceBoundDocument("professional_resume", source, selectedEvidence);
    const text = JSON.stringify(composed);

    expect(text).toContain("Approved project A");
    expect(text).not.toContain("Unselected project B");
    expect(JSON.stringify(source)).toContain("Unselected project B");
  });

  it("does not alter the source Dossier while composing a working preview", () => {
    const source = snapshot();
    const before = JSON.stringify(source);
    composeDocument("professional_resume", source, {
      hiddenSections: ["summary"],
      sectionOrder: ["experience", "summary"],
    });
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps immutable-version presentation separate from mutable workspace choices", () => {
    const source = snapshot({ experience: [{ type: "employment", organization: "Example Org", role: "Engineer", location: null, description: "Current profile", startMonth: null, startYear: null, endMonth: null, endYear: null, current: true }] });
    const mutable = composeDocument("professional_resume", source, { hiddenSections: [] });
    const historical = composeDocument("professional_resume", source, { hiddenSections: ["summary"] });

    expect(mutable.sections.some((section) => section.key === "experience")).toBe(true);
    expect(historical.sections.some((section) => section.key === "experience")).toBe(true);
    expect(historical.sections.map((section) => section.key)).toEqual(mutable.sections.map((section) => section.key));
    expect(resolvePresentationStyle("compact", "professional_resume").id).toBe("compact");
  });
  it("accepts an approved zero-Requirement Specification without Evidence selections", () => {
    expect(resolveCurrentEvidenceState([], [], [])).toBe("valid");
  });

  it("still blocks when Requirements exist but no Evidence is confirmed", () => {
    expect(resolveCurrentEvidenceState([], ["requirement-1"], [])).toBe("evidence-required");
  });

  it("preserves stale Evidence when an approved reference is no longer selected", () => {
    expect(resolveCurrentEvidenceState([], [], ["evidence-1"])).toBe("stale-evidence");
  });

  it("treats confirmed Evidence as valid for a Requirement-backed Specification", () => {
    expect(resolveCurrentEvidenceState([{ evidenceId: "evidence-1" }], ["requirement-1"], ["evidence-1"])).toBe("valid");
  });
});
