import { describe, expect, it } from "vitest";
import { deriveCanonicalDossierState } from "./repository";
import type { DossierFoundationReadiness } from "./readiness";
import type { ProfileSectionKey } from "./types";

const emptyReadiness = (): DossierFoundationReadiness => ({
  identity: { state: "empty", detail: "identity" },
  experience: { state: "empty", detail: "experience" },
  education: { state: "empty", detail: "education" },
  skills: { state: "empty", detail: "skills" },
  projects: { state: "empty", detail: "projects" },
});

function sectionState(
  registered: readonly string[] = [],
  populated: Partial<Record<ProfileSectionKey, number>> = {},
) {
  return {
    registered,
    counts: {
      experience: 0,
      education: 0,
      projects: 0,
      skills: 0,
      credentials: 0,
      achievements: 0,
      languages: 0,
      publications: 0,
      memberships: 0,
      links: 0,
      ...populated,
    },
  };
}

describe("canonical dossier state derivation", () => {
  it("keeps selected, populated, and available as separate facts", () => {
    const state = deriveCanonicalDossierState(
      sectionState(["experience", "education"], { skills: 2 }),
      emptyReadiness(),
    );

    expect(state.selected).toEqual(["experience", "education"]);
    expect(state.populated).toEqual(["skills"]);
    expect(state.available).toContain("credentials");
    expect(state.counts.skills).toBe(2);
  });

  it("keeps a persisted section visible when its registry row is absent", () => {
    const state = deriveCanonicalDossierState(
      sectionState([], { languages: 3 }),
      emptyReadiness(),
    );

    expect(state.selected).toEqual([]);
    expect(state.populated).toEqual(["languages"]);
    expect(state.flow.steps.map((step) => step.key)).toEqual(["basics", "languages"]);
  });

  it("retains selected empty sections without treating them as populated", () => {
    const state = deriveCanonicalDossierState(
      sectionState(["publications"]),
      emptyReadiness(),
    );

    expect(state.selected).toEqual(["publications"]);
    expect(state.populated).toEqual([]);
    expect(state.flow.steps.map((step) => step.key)).toEqual(["basics", "publications"]);
  });

  it("keeps population distinct from readiness", () => {
    const readiness = emptyReadiness();
    readiness.experience = { state: "in-progress", detail: "Add more detail." };

    const state = deriveCanonicalDossierState(
      sectionState([], { experience: 1 }),
      readiness,
    );

    expect(state.populated).toEqual(["experience"]);
    expect(state.readiness.experience.state).toBe("in-progress");
    expect(state.ready).not.toContain("experience");
    expect(state.flow.steps.map((step) => step.key)).toContain("experience");
  });

  it("reports only readiness-qualified foundation sections as ready", () => {
    const readiness = emptyReadiness();
    readiness.identity = { state: "ready", detail: "ready" };
    readiness.skills = { state: "ready", detail: "ready" };

    const state = deriveCanonicalDossierState(
      sectionState(["skills"], { skills: 1 }),
      readiness,
    );

    expect(state.ready).toEqual(["identity", "skills"]);
  });

  it("ignores invalid registry keys while preserving valid canonical data", () => {
    const state = deriveCanonicalDossierState(
      sectionState(["not-a-section", "projects", "projects"], { achievements: 1 }),
      emptyReadiness(),
    );

    expect(state.selected).toEqual(["projects", "projects"]);
    expect(state.flow.steps.map((step) => step.key)).toEqual(["basics", "projects", "achievements"]);
  });
});
