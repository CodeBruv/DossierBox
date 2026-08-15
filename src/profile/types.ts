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

export const experienceTypes = [
  "employment",
  "freelance",
  "internship",
  "volunteering",
  "other",
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
