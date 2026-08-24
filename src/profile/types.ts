export const profileSectionKeys = [
  "experience",
  "education",
  "projects",
  "skills",
  "credentials",
  "achievements",
  "languages",
  "publications",
  "memberships",
  "links",
] as const;

export type ProfileSectionKey = (typeof profileSectionKeys)[number];

/**
 * How a piece of experience was arranged.
 *
 * `employment` is kept for rows written before the arrangement was asked about. Nothing
 * creates it any more — the picker offers the precise values — but dropping it from the
 * union would make existing rows fail validation on their next edit, which would look to
 * the user like their record had broken.
 *
 * This is a `text` column, not a pgEnum, so extending this list needs no migration.
 */
export const experienceTypes = [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
  "volunteering",
  "apprenticeship",
  "other",
  "employment",
] as const;

export const skillTypes = [
  "technical",
  "professional",
  "soft",
  "trade",
  "other",
] as const;

export const credentialTypes = [
  "certification",
  "license",
  "training",
  "course",
  "workshop",
  "vocational",
  "trade",
  "academic",
  "industry",
  "other",
] as const;

export const achievementTypes = ["award", "achievement"] as const;

export const linkTypes = [
  "portfolio",
  "professional",
  "project",
  "publication",
  "other",
] as const;

export type ProfileFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  values?: Record<string, string>;
  multipleValues?: Record<string, string[]>;
};

export const initialProfileFormState: ProfileFormState = { status: "idle" };
