import { describe, expect, it } from "vitest";
import {
  BASICS_STEP,
  buildDossierFlow,
  nextStep,
  parseSaveIntent,
  previousStep,
  resolveEntryDestination,
  resolveSkipDestination,
} from "./flow";

describe("dossier flow construction", () => {
  it("always begins with identity, even when no sections are enabled", () => {
    const flow = buildDossierFlow([]);

    expect(flow.total).toBe(1);
    expect(flow.steps[0]?.key).toBe(BASICS_STEP);
    expect(flow.steps[0]?.isBasics).toBe(true);
  });

  it("preserves the caller's section order rather than re-sorting", () => {
    const flow = buildDossierFlow(["skills", "experience", "education"]);

    expect(flow.steps.map((step) => step.key)).toEqual([
      BASICS_STEP,
      "skills",
      "experience",
      "education",
    ]);
  });

  it("numbers steps from one so they can be shown as 'step N of M'", () => {
    const flow = buildDossierFlow(["experience", "skills"]);

    expect(flow.steps.map((step) => step.position)).toEqual([1, 2, 3]);
    expect(flow.total).toBe(3);
  });

  it("drops unknown section keys instead of throwing", () => {
    const flow = buildDossierFlow(["experience", "retired-section", "skills"]);

    expect(flow.steps.map((step) => step.key)).toEqual([
      BASICS_STEP,
      "experience",
      "skills",
    ]);
  });

  it("collapses duplicate keys so a corrupt row cannot repeat a step", () => {
    const flow = buildDossierFlow(["experience", "experience"]);

    expect(flow.steps.map((step) => step.key)).toEqual([BASICS_STEP, "experience"]);
  });
});

describe("dossier flow traversal", () => {
  const flow = buildDossierFlow(["experience", "education", "skills"]);

  it("moves from identity into the first selected section", () => {
    expect(nextStep(flow, BASICS_STEP)?.key).toBe("experience");
  });

  it("returns undefined past the final step", () => {
    expect(nextStep(flow, "skills")).toBeUndefined();
  });

  it("returns undefined before the first step", () => {
    expect(previousStep(flow, BASICS_STEP)).toBeUndefined();
  });

  it("walks backwards through the flow", () => {
    expect(previousStep(flow, "education")?.key).toBe("experience");
  });

  it("treats a section outside the flow as unreachable in both directions", () => {
    expect(nextStep(flow, "languages")).toBeUndefined();
    expect(previousStep(flow, "languages")).toBeUndefined();
  });
});

describe("save intent", () => {
  it("recognises the two explicit continuation intents", () => {
    expect(parseSaveIntent("another")).toBe("another");
    expect(parseSaveIntent("continue")).toBe("continue");
  });

  it("falls back to staying put for missing or unexpected values", () => {
    expect(parseSaveIntent(null)).toBe("stay");
    expect(parseSaveIntent("")).toBe("stay");
    expect(parseSaveIntent("delete-everything")).toBe("stay");
  });
});

describe("post-save destinations", () => {
  const flow = buildDossierFlow(["experience", "education"]);

  it("returns to a blank form when adding another entry", () => {
    expect(resolveEntryDestination(flow, "experience", "another")).toBe(
      "/profile/experience/new?status=created",
    );
  });

  it("advances to the next section when continuing", () => {
    expect(resolveEntryDestination(flow, "experience", "continue")).toBe(
      "/profile/education?status=created",
    );
  });

  it("lands on review after the final section, not back at the hub", () => {
    expect(resolveEntryDestination(flow, "education", "continue")).toBe(
      "/profile/review?status=created",
    );
  });

  it("stays on the current section by default", () => {
    expect(resolveEntryDestination(flow, "experience", "stay")).toBe(
      "/profile/experience?status=created",
    );
  });

  it("skipping mirrors continuing but without a status message", () => {
    expect(resolveSkipDestination(flow, "experience")).toBe("/profile/education");
    expect(resolveSkipDestination(flow, "education")).toBe("/profile/review");
  });
});
