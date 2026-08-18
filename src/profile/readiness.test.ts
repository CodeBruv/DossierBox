import { describe, expect, it } from "vitest";
import { evaluateDossierFoundation } from "./readiness";

const emptyInput = {
  identity: { displayName: null, headline: null, careerDirection: null },
  experience: [],
  education: [],
  skills: [],
  projects: [],
} as const;

describe("dossier foundation readiness", () => {
  it("marks untouched sections as empty", () => {
    const readiness = evaluateDossierFoundation(emptyInput);

    expect(readiness.identity.state).toBe("empty");
    expect(readiness.experience.state).toBe("empty");
    expect(readiness.education.state).toBe("empty");
    expect(readiness.skills.state).toBe("empty");
    expect(readiness.projects.state).toBe("empty");
  });

  it("does not treat shallow records as ready", () => {
    const readiness = evaluateDossierFoundation({
      identity: { displayName: "Ada Lovelace", headline: null, careerDirection: null },
      experience: [{
        role: "Engineer",
        organization: "Analytical Engines",
        startYear: null,
        endYear: null,
        current: false,
        description: null,
      }],
      education: [{
        institution: "University",
        qualification: null,
        startYear: 2020,
        endYear: null,
        current: false,
      }],
      skills: [{ name: "Mathematics" }, { name: "Writing" }],
      projects: [{
        name: "Engine",
        role: null,
        context: null,
        url: null,
        startYear: null,
        endYear: null,
        current: false,
        description: "A documented project.",
      }],
    });

    expect(readiness.identity.state).toBe("in-progress");
    expect(readiness.experience.state).toBe("in-progress");
    expect(readiness.education.state).toBe("in-progress");
    expect(readiness.skills.state).toBe("in-progress");
    expect(readiness.projects.state).toBe("in-progress");
  });

  it("marks meaningful foundation records as ready", () => {
    const readiness = evaluateDossierFoundation({
      identity: {
        displayName: "Ada Lovelace",
        headline: "Mathematician and computing pioneer",
        careerDirection: null,
      },
      experience: [{
        role: "Collaborator",
        organization: "Analytical Engine project",
        startYear: 1842,
        endYear: 1843,
        current: false,
        description: "Translated and expanded the engine notes with an algorithm.",
      }],
      education: [{
        institution: "Private study",
        qualification: "Advanced mathematics",
        startYear: 1830,
        endYear: 1835,
        current: false,
      }],
      skills: [{ name: "Mathematics" }, { name: "Technical writing" }, { name: "Algorithms" }],
      projects: [{
        name: "Bernoulli algorithm",
        role: "Author",
        context: "Analytical Engine notes",
        url: null,
        startYear: 1842,
        endYear: 1843,
        current: false,
        description: "Created a method for calculating Bernoulli numbers.",
      }],
    });

    expect(Object.values(readiness).every((section) => section.state === "ready")).toBe(true);
  });
});
