import type { ProfileSectionKey } from "./types";

export type ProfileFieldOption = {
  value: string;
  label: string;
};

export type ProfileField = {
  name: string;
  label: string;
  type?: "text" | "email" | "url" | "tel" | "number" | "textarea" | "select" | "checkbox";
  required?: boolean;
  options?: readonly ProfileFieldOption[];
  hint?: string;
  autocomplete?: string;
};

export type ProfileSectionDefinition = {
  key: ProfileSectionKey;
  label: string;
  description: string;
  singular: string;
  fields: readonly ProfileField[];
};

const monthFields: readonly ProfileField[] = [
  { name: "startMonth", label: "Start month", type: "number" },
  { name: "startYear", label: "Start year", type: "number" },
  { name: "endMonth", label: "End month", type: "number" },
  { name: "endYear", label: "End year", type: "number" },
  { name: "current", label: "This is current", type: "checkbox" },
];

const descriptionField: ProfileField = {
  name: "description",
  label: "What happened",
  type: "textarea",
  hint: "Record facts, responsibilities, scope, or results in your own words.",
};

export const profileSections: readonly ProfileSectionDefinition[] = [
  {
    key: "experience",
    label: "Experience",
    singular: "experience",
    description: "Employment, freelance work, internships, volunteering, and other relevant work.",
    fields: [
      {
        name: "type",
        label: "Experience type",
        type: "select",
        required: true,
        options: [
          { value: "employment", label: "Employment" },
          { value: "freelance", label: "Freelance work" },
          { value: "internship", label: "Internship" },
          { value: "volunteering", label: "Volunteering" },
          { value: "other", label: "Other relevant experience" },
        ],
      },
      { name: "role", label: "Role or position", required: true },
      { name: "organization", label: "Organization or client", required: true },
      { name: "location", label: "Location" },
      ...monthFields,
      descriptionField,
    ],
  },
  {
    key: "education",
    label: "Education",
    singular: "education record",
    description: "Any relevant school, college, university, vocational, or other learning record.",
    fields: [
      { name: "institution", label: "Institution or learning provider", required: true },
      { name: "qualification", label: "Qualification or programme" },
      { name: "field", label: "Field of study" },
      { name: "location", label: "Location" },
      ...monthFields,
      descriptionField,
    ],
  },
  {
    key: "projects",
    label: "Projects",
    singular: "project",
    description: "Professional, academic, community, personal, creative, or practical projects.",
    fields: [
      { name: "name", label: "Project name", required: true },
      { name: "role", label: "Your role" },
      { name: "context", label: "Organization or context" },
      { name: "url", label: "Project link", type: "url" },
      ...monthFields,
      descriptionField,
    ],
  },
  {
    key: "skills",
    label: "Skills",
    singular: "skill",
    description: "Technical, professional, interpersonal, trade, and other useful capabilities.",
    fields: [
      { name: "name", label: "Skill", required: true },
      {
        name: "type",
        label: "Skill type",
        type: "select",
        required: true,
        options: [
          { value: "technical", label: "Technical" },
          { value: "professional", label: "Professional" },
          { value: "soft", label: "Interpersonal" },
          { value: "trade", label: "Trade or practical" },
          { value: "other", label: "Other" },
        ],
      },
      { name: "notes", label: "Supporting detail", type: "textarea" },
    ],
  },
  {
    key: "credentials",
    label: "Credentials",
    singular: "credential",
    description: "Certifications, licences, training, courses, workshops, and vocational credentials.",
    fields: [
      {
        name: "type",
        label: "Credential type",
        type: "select",
        required: true,
        options: [
          { value: "certification", label: "Certification" },
          { value: "license", label: "Licence" },
          { value: "training", label: "Training" },
          { value: "course", label: "Course" },
          { value: "workshop", label: "Workshop" },
          { value: "vocational", label: "Vocational qualification" },
          { value: "trade", label: "Trade credential" },
          { value: "academic", label: "Academic credential" },
          { value: "industry", label: "Industry credential" },
          { value: "other", label: "Other credential" },
        ],
      },
      { name: "name", label: "Credential name", required: true },
      { name: "issuer", label: "Issuer or provider" },
      { name: "identifier", label: "Credential ID" },
      { name: "url", label: "Credential link", type: "url" },
      { name: "issueMonth", label: "Issue month", type: "number" },
      { name: "issueYear", label: "Issue year", type: "number" },
      { name: "expiryMonth", label: "Expiry month", type: "number" },
      { name: "expiryYear", label: "Expiry year", type: "number" },
      descriptionField,
    ],
  },
  {
    key: "achievements",
    label: "Awards and achievements",
    singular: "award or achievement",
    description: "Recognition and factual accomplishments worth reusing.",
    fields: [
      {
        name: "type",
        label: "Entry type",
        type: "select",
        required: true,
        options: [
          { value: "award", label: "Award" },
          { value: "achievement", label: "Achievement" },
        ],
      },
      { name: "title", label: "Title", required: true },
      { name: "issuer", label: "Issuer or context" },
      { name: "month", label: "Month", type: "number" },
      { name: "year", label: "Year", type: "number" },
      descriptionField,
    ],
  },
  {
    key: "languages",
    label: "Languages",
    singular: "language",
    description: "Languages you use and the proficiency you choose to describe.",
    fields: [
      { name: "language", label: "Language", required: true },
      { name: "proficiency", label: "Proficiency" },
      { name: "notes", label: "Supporting detail", type: "textarea" },
    ],
  },
  {
    key: "publications",
    label: "Publications",
    singular: "publication",
    description: "Published articles, papers, books, reports, and other authored work.",
    fields: [
      { name: "title", label: "Publication title", required: true },
      { name: "publisher", label: "Publisher or venue" },
      { name: "month", label: "Publication month", type: "number" },
      { name: "year", label: "Publication year", type: "number" },
      { name: "url", label: "Publication link", type: "url" },
      descriptionField,
    ],
  },
  {
    key: "memberships",
    label: "Memberships",
    singular: "membership",
    description: "Professional, trade, academic, civic, or community memberships.",
    fields: [
      { name: "organization", label: "Organization", required: true },
      { name: "role", label: "Membership or role" },
      ...monthFields,
      descriptionField,
    ],
  },
  {
    key: "links",
    label: "Portfolio and professional links",
    singular: "link",
    description: "Portfolio, professional profile, project, publication, and other relevant links.",
    fields: [
      {
        name: "type",
        label: "Link type",
        type: "select",
        required: true,
        options: [
          { value: "portfolio", label: "Portfolio" },
          { value: "professional", label: "Professional profile" },
          { value: "project", label: "Project" },
          { value: "publication", label: "Publication" },
          { value: "other", label: "Other" },
        ],
      },
      { name: "label", label: "Label", required: true },
      { name: "url", label: "Web address", type: "url", required: true },
    ],
  },
] as const;

export const profileSectionMap = Object.fromEntries(
  profileSections.map((section) => [section.key, section]),
) as Record<ProfileSectionKey, ProfileSectionDefinition>;

/**
 * Whether a string names a real section.
 *
 * This is a trust boundary: the value arrives from a route parameter, a form field
 * or a stored registry row. `Object.hasOwn` rather than `in`, because `in` walks
 * the prototype chain and would answer `true` for `constructor`, `toString` and
 * `__proto__` — after which a caller holding a `ProfileSectionKey` would read
 * `profileSectionMap[key].fields` and get `undefined`, crashing a page or a server
 * action on a URL anyone can type.
 */
export function isProfileSection(value: string): value is ProfileSectionKey {
  return Object.hasOwn(profileSectionMap, value);
}
