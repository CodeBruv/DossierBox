import type { ProfileSectionKey } from "./types";
import {
  countryNames,
  educationLevelOptions,
  gradingSystemOptions,
  languageNames,
  languageProficiencyOptions,
  offeredExperienceTypeOptions,
  workArrangementOptions,
} from "./vocabularies";

export type ProfileFieldOption = {
  value: string;
  label: string;
};

export type ProfileField = {
  name: string;
  label: string;
  /**
   * Which control the field becomes. Beyond the HTML input types:
   *
   * - `month` — the twelve months by name, stored as the integer the column holds.
   * - `year` — a bounded numeric year.
   * - `combobox` — a text input with suggestions. Structured where the answer is known,
   *   open where it is not, which is what a global list of places or languages needs.
   * - `grade` — a control chosen by the grading system named in `dependsOn`, so the form
   *   asks one precise question instead of every possible variant of it at once. Named for
   *   what it is rather than dressed up as a general dependency mechanism, because it has
   *   exactly one use and pretending otherwise would be architecture nobody asked for.
   */
  type?:
    | "text"
    | "email"
    | "url"
    | "tel"
    | "number"
    | "textarea"
    | "select"
    | "checkbox"
    | "month"
    | "year"
    | "combobox"
    | "grade";
  required?: boolean;
  options?: readonly ProfileFieldOption[];
  /** Suggestions for a `combobox`. Not a constraint — the user can always type their own. */
  suggestions?: readonly string[];
  /**
   * Adds a controlled "Something else" branch to a `select`, revealing a text input that
   * takes over the field name. So the stored value is either a curated option or the
   * user's own words, never a sentinel, and no curated list can become a dead end.
   */
  allowCustom?: boolean;
  customLabel?: string;
  /** For `grade`: the field holding the grading system this grade is expressed in. */
  dependsOn?: string;
  /**
   * Hidden, and therefore cleared, while the named checkbox is ticked. "Currently working
   * here" should mean the end date stops being a question, not that the user has to
   * remember to blank two boxes.
   */
  clearedBy?: string;
  hint?: string;
  placeholder?: string;
  autocomplete?: string;
};

export type ProfileSectionDefinition = {
  key: ProfileSectionKey;
  label: string;
  description: string;
  singular: string;
  fields: readonly ProfileField[];
};

/**
 * A start/end period.
 *
 * End fields are `clearedBy: "current"` so ticking the checkbox removes them from the form
 * *and* from the saved row, which is the only reading of "current" that stays true after an
 * edit. The checkbox comes first because it decides whether the end date is a question at
 * all, and its wording is per-section: "I currently work here" is a sentence, "This is
 * current" is a database column.
 */
const period = (currentLabel: string): readonly ProfileField[] => [
  { name: "current", label: currentLabel, type: "checkbox" },
  { name: "startMonth", label: "Start month", type: "month" },
  { name: "startYear", label: "Start year", type: "year" },
  { name: "endMonth", label: "End month", type: "month", clearedBy: "current" },
  { name: "endYear", label: "End year", type: "year", clearedBy: "current" },
];

const countryField: ProfileField = {
  name: "location",
  label: "Location",
  type: "combobox",
  suggestions: countryNames,
  hint: "City, country — or pick a country and add the city.",
};

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
        label: "Employment type",
        type: "select",
        required: true,
        options: offeredExperienceTypeOptions,
      },
      { name: "role", label: "Role or position", required: true },
      { name: "organization", label: "Organization or client", required: true },
      {
        ...countryField,
        suggestions: [...workArrangementOptions.map((option) => option.value), ...countryNames],
        hint: "A place, or how the role was arranged — Remote, Hybrid, On-site.",
      },
      ...period("I currently work here"),
      descriptionField,
    ],
  },
  {
    key: "education",
    label: "Education",
    singular: "education record",
    description: "Any relevant school, college, university, vocational, or other learning record.",
    fields: [
      {
        name: "level",
        label: "Level of study",
        type: "select",
        options: educationLevelOptions,
        allowCustom: true,
        customLabel: "Another level",
      },
      { name: "institution", label: "Institution or learning provider", required: true },
      { name: "qualification", label: "Qualification or programme" },
      { name: "field", label: "Field of study" },
      countryField,
      ...period("I am still studying here"),
      {
        name: "gradingSystem",
        label: "Grading system",
        type: "select",
        options: gradingSystemOptions,
        allowCustom: true,
        customLabel: "Another system",
        hint: "Optional. Choosing one asks for your grade in the right form.",
      },
      { name: "grade", label: "Grade or classification", type: "grade", dependsOn: "gradingSystem" },
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
      ...period("This project is ongoing"),
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
      { name: "issueMonth", label: "Issue month", type: "month" },
      { name: "issueYear", label: "Issue year", type: "year" },
      { name: "expiryMonth", label: "Expiry month", type: "month" },
      { name: "expiryYear", label: "Expiry year", type: "year" },
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
      { name: "month", label: "Month", type: "month" },
      { name: "year", label: "Year", type: "year" },
      descriptionField,
    ],
  },
  {
    key: "languages",
    label: "Languages",
    singular: "language",
    description: "Languages you use and the proficiency you choose to describe.",
    fields: [
      {
        name: "language",
        label: "Language",
        type: "combobox",
        required: true,
        suggestions: languageNames,
      },
      {
        name: "proficiency",
        label: "Proficiency",
        type: "select",
        options: languageProficiencyOptions,
        allowCustom: true,
        customLabel: "Describe it differently",
      },
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
      { name: "month", label: "Publication month", type: "month" },
      { name: "year", label: "Publication year", type: "year" },
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
      ...period("This membership is current"),
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
