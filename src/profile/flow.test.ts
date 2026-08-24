import { describe, expect, it } from "vitest";
import {
  BASICS_STEP,
  buildDossierFlow,
  dossierSections,
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

  it("does not read a section key from the prototype chain", () => {
    /* `in` would answer true for all three, and the step built from one would have no
     * label and a route that 404s. The registry is stored data, so this is reachable
     * from the database as well as from a hand-written request. */
    const flow = buildDossierFlow(["constructor", "toString", "__proto__"]);

    expect(flow.steps.map((step) => step.key)).toEqual([BASICS_STEP]);
  });
});

/*
 * The regression suite for the defect this module was rewritten to prevent: a user
 * saved information, the section screen listed it, adding it again was refused as a
 * duplicate — and the dossier reported the section as "Not started", because the
 * only thing consulted was the registry of sections the user had explicitly chosen.
 */
describe("sections that hold information", () => {
  it("includes a populated section the user never chose", () => {
    const flow = buildDossierFlow([], { experience: 2 });

    expect(flow.steps.map((step) => step.key)).toEqual([BASICS_STEP, "experience"]);
  });

  it("keeps a populated section after the structure screen drops it", () => {
    /* Exactly the reported sequence: save entries, then save a narrower selection.
     * The registry no longer mentions the section; the entries are still there. */
    const flow = buildDossierFlow(["skills"], { skills: 1, languages: 3 });

    expect(dossierSections(flow)).toEqual(["skills", "languages"]);
  });

  it("orders chosen sections first, then populated ones as the product declares them", () => {
    const flow = buildDossierFlow(["skills", "experience"], {
      links: 1,
      education: 1,
      skills: 4,
    });

    /* `education` precedes `links` because that is the canonical section order, not
     * because of how the counts happened to be keyed. */
    expect(dossierSections(flow)).toEqual(["skills", "experience", "education", "links"]);
  });

  it("does not add an empty section the user did not choose", () => {
    const flow = buildDossierFlow(["experience"], { experience: 1, publications: 0 });

    expect(dossierSections(flow)).toEqual(["experience"]);
  });

  it("keeps an empty section the user did choose", () => {
    /* Chosen-and-empty is a plan to fill it in, and dropping it would remove the step
     * the user is on. Only *presence* is derived from data; intent still counts. */
    const flow = buildDossierFlow(["experience", "publications"], { experience: 1 });

    expect(dossierSections(flow)).toEqual(["experience", "publications"]);
  });

  it("lists a section once when it is both chosen and populated", () => {
    const flow = buildDossierFlow(["experience"], { experience: 5 });

    expect(dossierSections(flow)).toEqual(["experience"]);
    expect(flow.total).toBe(2);
  });

  it("records whether a step was chosen, for wording only", () => {
    const flow = buildDossierFlow(["experience"], { experience: 1, achievements: 0, links: 2 });
    const chosen = Object.fromEntries(flow.steps.map((step) => [step.key, step.chosen]));

    expect(chosen).toEqual({ [BASICS_STEP]: true, experience: true, links: false });
  });

  it("treats missing counts as unknown rather than as empty", () => {
    /* The save actions used to omit counts, so "what comes next?" answered from the
     * registry alone and sent the user to review from the middle of their dossier.
     * Omitting the argument must still produce the chosen sequence. */
    expect(dossierSections(buildDossierFlow(["experience", "education"]))).toEqual([
      "experience",
      "education",
    ]);
  });

  it("advances through a populated section that was never chosen", () => {
    const flow = buildDossierFlow(["experience"], { experience: 1, languages: 1 });

    expect(nextStep(flow, "experience")?.key).toBe("languages");
    expect(resolveEntryDestination(flow, "experience", "continue")).toBe(
      "/profile/languages?status=created",
    );
  });
});

describe("dossierSections", () => {
  it("excludes identity, which is a single record rather than a list", () => {
    const flow = buildDossierFlow(["experience"]);

    expect(flow.steps).toHaveLength(2);
    expect(dossierSections(flow)).toEqual(["experience"]);
  });

  it("is empty for a dossier with no sections at all", () => {
    expect(dossierSections(buildDossierFlow([]))).toEqual([]);
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
