export type DossierReadinessState = "empty" | "in-progress" | "ready";

export type DossierReadiness = {
  state: DossierReadinessState;
  detail: string;
};

export type IdentityRecord = {
  displayName: string | null;
  headline: string | null;
  careerDirection: string | null;
};

export type ExperienceRecord = {
  role: string;
  organization: string;
  startYear: number | null;
  endYear: number | null;
  current: boolean;
  description: string | null;
};

export type EducationRecord = {
  institution: string;
  qualification: string | null;
  startYear: number | null;
  endYear: number | null;
  current: boolean;
};

export type ProjectRecord = {
  name: string;
  role: string | null;
  context: string | null;
  url: string | null;
  startYear: number | null;
  endYear: number | null;
  current: boolean;
  description: string | null;
};

export type SkillRecord = {
  name: string;
};

export type DossierFoundationReadiness = {
  identity: DossierReadiness;
  experience: DossierReadiness;
  education: DossierReadiness;
  skills: DossierReadiness;
  projects: DossierReadiness;
};

export function evaluateDossierFoundation(input: {
  identity: IdentityRecord;
  experience: readonly ExperienceRecord[];
  education: readonly EducationRecord[];
  skills: readonly SkillRecord[];
  projects: readonly ProjectRecord[];
}): DossierFoundationReadiness {
  return {
    identity: evaluateIdentity(input.identity),
    experience: evaluateExperience(input.experience),
    education: evaluateEducation(input.education),
    skills: evaluateSkills(input.skills),
    projects: evaluateProjects(input.projects),
  };
}

function evaluateIdentity(identity: IdentityRecord): DossierReadiness {
  const hasName = meaningful(identity.displayName);
  const hasDirection = meaningful(identity.headline) || meaningful(identity.careerDirection);

  if (hasName && hasDirection) {
    return { state: "ready", detail: "Name and professional direction are defined." };
  }

  if (!hasName && !hasDirection) {
    return { state: "empty", detail: "Add your name and professional direction." };
  }

  return {
    state: "in-progress",
    detail: hasName
      ? "Add a headline or career direction."
      : "Add the name you use professionally.",
  };
}

function evaluateExperience(entries: readonly ExperienceRecord[]): DossierReadiness {
  if (entries.length === 0) {
    return { state: "empty", detail: "Add a role or other professional experience." };
  }

  const ready = entries.some(
    (entry) =>
      meaningful(entry.role) &&
      meaningful(entry.organization) &&
      hasMeaningfulDates(entry) &&
      meaningful(entry.description),
  );

  return ready
    ? { state: "ready", detail: "A role has context, dates, and meaningful detail." }
    : {
        state: "in-progress",
        detail: "Complete a role with its organization, dates, and contribution details.",
      };
}

function evaluateEducation(entries: readonly EducationRecord[]): DossierReadiness {
  if (entries.length === 0) {
    return { state: "empty", detail: "Add an education record." };
  }

  const ready = entries.some(
    (entry) =>
      meaningful(entry.institution) &&
      meaningful(entry.qualification) &&
      hasMeaningfulDates(entry),
  );

  return ready
    ? { state: "ready", detail: "An education record has a qualification and dates." }
    : {
        state: "in-progress",
        detail: "Complete an institution, qualification, and relevant dates.",
      };
}

function evaluateSkills(entries: readonly SkillRecord[]): DossierReadiness {
  const skillCount = new Set(
    entries.map((entry) => entry.name.trim().toLocaleLowerCase()).filter(Boolean),
  ).size;

  if (skillCount === 0) {
    return { state: "empty", detail: "Add skills you can support with evidence." };
  }

  if (skillCount < 3) {
    return {
      state: "in-progress",
      detail: `Add ${3 - skillCount} more meaningful ${skillCount === 2 ? "skill" : "skills"}.`,
    };
  }

  return { state: "ready", detail: `${skillCount} meaningful skills are recorded.` };
}

function evaluateProjects(entries: readonly ProjectRecord[]): DossierReadiness {
  if (entries.length === 0) {
    return { state: "empty", detail: "Add a project when it strengthens your dossier." };
  }

  const ready = entries.some(
    (entry) =>
      meaningful(entry.name) &&
      meaningful(entry.description) &&
      (meaningful(entry.role) ||
        meaningful(entry.context) ||
        meaningful(entry.url) ||
        hasMeaningfulDates(entry)),
  );

  return ready
    ? { state: "ready", detail: "A project has a description and supporting context." }
    : {
        state: "in-progress",
        detail: "Complete a project with a description and supporting context.",
      };
}

function meaningful(value: string | null): boolean {
  return Boolean(value?.trim());
}

function hasMeaningfulDates(entry: {
  startYear: number | null;
  endYear: number | null;
  current: boolean;
}): boolean {
  return Boolean(entry.startYear || entry.endYear || entry.current);
}
