/**
 * The shape of a whole dossier, independent of how it is stored or rendered.
 *
 * This is the **source data** contract in the chain
 * `dossier → composition → presentation`. It exists as its own pure module for
 * two reasons: the composition layer can be unit-tested against it without
 * reaching for a database, and the document layer never has to import anything
 * `server-only` just to describe what it consumes.
 *
 * Fields mirror what the user actually supplied. Everything optional is
 * `null`-able rather than absent, so a consumer can never confuse "not provided"
 * with "not loaded". Nothing here is derived or inferred — a document may only
 * present what the person entered.
 */

import type {
  achievementTypes,
  credentialTypes,
  experienceTypes,
  linkTypes,
  skillTypes,
} from "./types";

/** A start/end pair as captured by the profile forms. */
export type DossierPeriod = {
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  current: boolean;
};

/** Local alias, so the row types below stay readable. */
type Period = DossierPeriod;

export type DossierIdentity = {
  displayName: string | null;
  headline: string | null;
  careerDirection: string | null;
  contactEmail: string | null;
  phone: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  website: string | null;
};

export type DossierExperience = Period & {
  type: (typeof experienceTypes)[number];
  organization: string;
  role: string;
  location: string | null;
  description: string | null;
};

export type DossierEducation = Period & {
  institution: string;
  qualification: string | null;
  field: string | null;
  location: string | null;
  description: string | null;
};

export type DossierProject = Period & {
  name: string;
  role: string | null;
  context: string | null;
  url: string | null;
  description: string | null;
};

export type DossierSkill = {
  name: string;
  type: (typeof skillTypes)[number];
  notes: string | null;
};

export type DossierCredential = {
  type: (typeof credentialTypes)[number];
  name: string;
  issuer: string | null;
  identifier: string | null;
  url: string | null;
  issueMonth: number | null;
  issueYear: number | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  description: string | null;
};

export type DossierAchievement = {
  type: (typeof achievementTypes)[number];
  title: string;
  issuer: string | null;
  month: number | null;
  year: number | null;
  description: string | null;
};

export type DossierLanguage = {
  language: string;
  proficiency: string | null;
  notes: string | null;
};

export type DossierPublication = {
  title: string;
  publisher: string | null;
  month: number | null;
  year: number | null;
  url: string | null;
  description: string | null;
};

export type DossierMembership = Period & {
  organization: string;
  role: string | null;
  description: string | null;
};

export type DossierLink = {
  type: (typeof linkTypes)[number];
  label: string;
  url: string;
};

/**
 * Every section is always present as an array — empty where the user has saved
 * nothing. Consumers therefore never branch on `undefined`, and "this section is
 * empty" stays a content question rather than a loading question.
 */
export type DossierSnapshot = {
  identity: DossierIdentity;
  experience: DossierExperience[];
  education: DossierEducation[];
  projects: DossierProject[];
  skills: DossierSkill[];
  credentials: DossierCredential[];
  achievements: DossierAchievement[];
  languages: DossierLanguage[];
  publications: DossierPublication[];
  memberships: DossierMembership[];
  links: DossierLink[];
};

export const emptyDossierSnapshot = (
  identity: DossierIdentity,
): DossierSnapshot => ({
  identity,
  experience: [],
  education: [],
  projects: [],
  skills: [],
  credentials: [],
  achievements: [],
  languages: [],
  publications: [],
  memberships: [],
  links: [],
});
