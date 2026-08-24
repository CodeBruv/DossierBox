import { z } from "zod";
import {
  achievementTypes,
  credentialTypes,
  experienceTypes,
  linkTypes,
  profileSectionKeys,
  skillTypes,
  type ProfileFormState,
  type ProfileSectionKey,
} from "./types";

const currentYear = new Date().getUTCFullYear();
const minimumYear = 1900;
const maximumYear = currentYear + 20;

/**
 * Every message in this module is written to be shown to the person filling in
 * the form. Zod's defaults are not: left unlabelled they surface as
 * "Too big: expected string to have <=120 characters" or
 * "Invalid input: expected number, received NaN", which names the runtime type
 * rather than the field and tells the user nothing they can act on.
 *
 * So each factory takes the field's own label, and every constraint carries a
 * message. The label must match the label rendered in the form.
 */
const tooLong = (label: string, maximum: number) =>
  `${label} is too long. Keep it to ${maximum} characters or fewer.`;

/**
 * Makes an optional field tolerate not being submitted at all.
 *
 * Controls are rendered conditionally now — ticking "I currently work here" removes the
 * end date rather than asking the user to blank it — so a missing key is an ordinary way
 * for an unstated answer to arrive, not a malformed submission. Without this, an optional
 * field that was never shown fails as though the user had typed something invalid into it:
 * "End year must be a four-digit year", pointing at a box that was not on screen.
 *
 * Absence and emptiness therefore mean the same thing, which is what "optional" claims.
 */
const absentAs = <Schema extends z.ZodType>(empty: unknown, schema: Schema) =>
  z.preprocess((value) => value ?? empty, schema);

const optionalText = (label: string, maximum: number) =>
  absentAs(
    "",
    z
      .string()
      .trim()
      .max(maximum, tooLong(label, maximum))
      .transform((value) => value || null),
  );

const requiredText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, tooLong(label, maximum));

const webAddressMessage =
  "Enter a web address such as example.com or https://example.com/your-page.";

/**
 * People type "example.com", "www.example.com" and "linkedin.com/in/name" far
 * more often than they type a scheme, and rejecting those as malformed is
 * technically defensible but practically useless — it was the likeliest source
 * of the `website: [Array]` failures.
 *
 * A bare host is therefore completed to https://. This only reformats what the
 * user supplied; it never invents or guesses an address. Anything carrying some
 * other scheme (mailto:, javascript:, data:) is passed through untouched so the
 * validator below rejects it rather than being silently rewritten into a URL
 * the user did not type.
 */
function normalizeUrlInput(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(trimmed);

  if (schemeMatch) {
    // "HTTPS://Example.com" is valid but looks like a mistake once stored, so
    // the scheme alone is lowercased. The rest of the address is left exactly
    // as typed: paths and query strings are case-sensitive.
    return schemeMatch[1].toLowerCase() + trimmed.slice(schemeMatch[1].length);
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

/**
 * Stricter than {@link isHttpUrl}: a career document links to addresses other
 * people can open, so the host has to look like a real public host. This also
 * stops "not a url" from being turned into "https://not a url" and accepted.
 */
function isPublicWebAddress(value: string): boolean {
  if (!isHttpUrl(value)) {
    return false;
  }

  const { hostname } = new URL(value);

  return (
    hostname.includes(".") && !hostname.startsWith(".") && !hostname.endsWith(".")
  );
}

const optionalUrl = absentAs(
  "",
  z
    .string()
    .trim()
    .max(2048, "That web address is too long. Keep it to 2048 characters or fewer.")
    .transform(normalizeUrlInput)
    .refine((value) => !value || isPublicWebAddress(value), webAddressMessage)
    .transform((value) => value || null),
);

const requiredUrl = z
  .string()
  .trim()
  .min(1, "Web address is required.")
  .max(2048, "That web address is too long. Keep it to 2048 characters or fewer.")
  .transform(normalizeUrlInput)
  .refine(isPublicWebAddress, webAddressMessage);

/**
 * `{ error }` covers both a missing/unparseable value and a wrong type, which
 * matters because the form posts strings: an unparseable month arrives as NaN
 * and produced "Invalid input: expected number, received NaN".
 */
const optionalMonth = (label: string) =>
  absentAs(
    null,
    z
      .number({ error: `${label} must be a month between 1 and 12.` })
      .int(`${label} must be a whole number.`)
      .min(1, `${label} must be between 1 and 12.`)
      .max(12, `${label} must be between 1 and 12.`)
      .nullable(),
  );

const optionalYear = (label: string) =>
  absentAs(
    null,
    z
      .number({ error: `${label} must be a four-digit year.` })
      .int(`${label} must be a whole number.`)
      .min(minimumYear, `${label} must be ${minimumYear} or later.`)
      .max(maximumYear, `${label} cannot be later than ${maximumYear}.`)
      .nullable(),
  );

const dateRangeShape = {
  startMonth: optionalMonth("Start month"),
  startYear: optionalYear("Start year"),
  endMonth: optionalMonth("End month"),
  endYear: optionalYear("End year"),
  /** Absent means unticked: an unchecked checkbox submits nothing. */
  current: absentAs(false, z.boolean()),
};

const datedEntry = z.object(dateRangeShape).superRefine(validateDateRange);

export const profileBasicsSchema = z.object({
  displayName: optionalText("Name", 120),
  contactEmail: z
    .string()
    .trim()
    .max(254, tooLong("Email address", 254))
    .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email address.")
    .transform((value) => value || null),
  phone: optionalText("Phone", 40),
  country: optionalText("Country", 100),
  region: optionalText("Region", 100),
  city: optionalText("City", 100),
  website: optionalUrl,
  headline: optionalText("Headline", 160),
  careerDirection: optionalText("Career direction", 2000),
});

export const profileSectionSelectionSchema = z.object({
  sections: z
    .array(z.enum(profileSectionKeys, { error: "That is not a section we recognise." }))
    .max(profileSectionKeys.length, "That is more sections than exist."),
});

export const experienceSchema = z
  .object({
    type: z.enum(experienceTypes, { error: "Choose the kind of experience this is." }),
    organization: requiredText("Organization or client", 180),
    role: requiredText("Role or position", 180),
    location: optionalText("Location", 180),
    description: optionalText("Description", 5000),
    ...dateRangeShape,
  })
  .superRefine(validateDateRange);

export const educationSchema = z
  .object({
    institution: requiredText("Institution or learning provider", 180),
    qualification: optionalText("Qualification", 180),
    field: optionalText("Field of study", 180),
    /**
     * Level, grading system and grade are all optional free text rather than enums.
     *
     * An enum here would reject every qualification framework we failed to anticipate,
     * and the picker's whole point is that it offers the common answers while still
     * accepting the user's own. The lengths are the constraint; the vocabulary is not.
     */
    level: optionalText("Level of study", 120),
    gradingSystem: optionalText("Grading system", 120),
    grade: optionalText("Grade or classification", 60),
    location: optionalText("Location", 180),
    description: optionalText("Description", 5000),
    ...dateRangeShape,
  })
  .superRefine((value, context) => {
    validateDateRange(value, context);

    // A grade without its system prints as a bare number a reader cannot interpret.
    if (value.grade && !value.gradingSystem) {
      context.addIssue({
        code: "custom",
        path: ["gradingSystem"],
        message: "Choose the grading system so your grade can be shown correctly.",
      });
    }
  });

export const projectSchema = z
  .object({
    name: requiredText("Project name", 180),
    role: optionalText("Your role", 180),
    context: optionalText("Context", 180),
    url: optionalUrl,
    description: optionalText("Description", 5000),
    ...dateRangeShape,
  })
  .superRefine(validateDateRange);

export const skillSchema = z.object({
  name: requiredText("Skill", 120),
  type: z.enum(skillTypes, { error: "Choose the kind of skill this is." }),
  notes: optionalText("Notes", 1000),
});

export const credentialSchema = z
  .object({
    type: z.enum(credentialTypes, { error: "Choose the kind of credential this is." }),
    name: requiredText("Credential name", 180),
    issuer: optionalText("Issuer", 180),
    identifier: optionalText("Credential ID", 180),
    url: optionalUrl,
    issueMonth: optionalMonth("Issue month"),
    issueYear: optionalYear("Issue year"),
    expiryMonth: optionalMonth("Expiry month"),
    expiryYear: optionalYear("Expiry year"),
    description: optionalText("Description", 3000),
  })
  .superRefine((value, context) => {
    validateMonthYearPair(context, {
      month: value.issueMonth,
      year: value.issueYear,
      yearField: "issueYear",
      label: "issue year",
      monthLabel: "issue month",
    });
    validateMonthYearPair(context, {
      month: value.expiryMonth,
      year: value.expiryYear,
      yearField: "expiryYear",
      label: "expiry year",
      monthLabel: "expiry month",
    });
    validateOrderedDates(
      value.issueMonth,
      value.issueYear,
      value.expiryMonth,
      value.expiryYear,
      context,
      "expiryYear",
      "Expiry date cannot be earlier than issue date.",
    );
  });

export const achievementSchema = z
  .object({
    type: z.enum(achievementTypes, { error: "Choose the kind of achievement this is." }),
    title: requiredText("Title", 180),
    issuer: optionalText("Issuer", 180),
    month: optionalMonth("Month"),
    year: optionalYear("Year"),
    description: optionalText("Description", 3000),
  })
  .superRefine((value, context) => {
    validateMonthYearPair(context, {
      month: value.month,
      year: value.year,
      yearField: "year",
      label: "year",
      monthLabel: "month",
    });
  });

export const languageSchema = z.object({
  language: requiredText("Language", 100),
  proficiency: optionalText("Proficiency", 100),
  notes: optionalText("Notes", 1000),
});

export const publicationSchema = z
  .object({
    title: requiredText("Publication title", 300),
    publisher: optionalText("Publisher", 180),
    month: optionalMonth("Month"),
    year: optionalYear("Year"),
    url: optionalUrl,
    description: optionalText("Description", 3000),
  })
  .superRefine((value, context) => {
    validateMonthYearPair(context, {
      month: value.month,
      year: value.year,
      yearField: "year",
      label: "year",
      monthLabel: "month",
    });
  });

export const membershipSchema = z
  .object({
    organization: requiredText("Organization", 180),
    role: optionalText("Role", 180),
    description: optionalText("Description", 3000),
    ...dateRangeShape,
  })
  .superRefine(validateDateRange);

export const profileLinkSchema = z.object({
  type: z.enum(linkTypes, { error: "Choose the kind of link this is." }),
  label: requiredText("Label", 120),
  url: requiredUrl,
});

export const profileEntrySchemas = {
  experience: experienceSchema,
  education: educationSchema,
  projects: projectSchema,
  skills: skillSchema,
  credentials: credentialSchema,
  achievements: achievementSchema,
  languages: languageSchema,
  publications: publicationSchema,
  memberships: membershipSchema,
  links: profileLinkSchema,
} satisfies Record<ProfileSectionKey, z.ZodType>;

export function parseBasicsFormData(formData: FormData) {
  return profileBasicsSchema.safeParse(formDataToValues(formData));
}

export function parseSectionSelection(formData: FormData) {
  return profileSectionSelectionSchema.safeParse({
    sections: formData.getAll("sections").filter((value): value is string => typeof value === "string"),
  });
}

export function parseEntryFormData(section: ProfileSectionKey, formData: FormData) {
  const values = formDataToValues(formData);
  const fieldNames = Object.keys((profileEntrySchemas[section] as z.ZodObject<z.ZodRawShape>).shape);
  const normalized = Object.fromEntries(
    fieldNames.map((field) => [field, normalizeFieldValue(field, values[field])]),
  );

  return profileEntrySchemas[section].safeParse(normalized);
}

/**
 * Turns a validation failure into the state the form re-renders from.
 *
 * Three things this deliberately does:
 *
 * · uses `z.flattenError`, the Zod 4 replacement for the deprecated
 *   `error.flatten()`;
 * · surfaces `formErrors` — issues raised without a path, which the previous
 *   version discarded, so a cross-field problem could fail the submission while
 *   showing nothing but the generic banner;
 * · returns `multipleValues` alongside `values`, so a form with repeated field
 *   names (the section checkboxes) keeps its state instead of appearing to
 *   forget the user's selection.
 *
 * The submitted values are echoed back so nothing the user typed is lost; the
 * form re-renders them as defaults.
 */
export function formStateFromError(
  error: z.ZodError,
  formData: FormData,
  message = "Check the highlighted information and try again.",
): ProfileFormState {
  const { formErrors, fieldErrors } = z.flattenError(error);

  return {
    ...formStateFromSubmission(formData, formErrors.length ? formErrors.join(" ") : message),
    fieldErrors,
  };
}

/**
 * A failure with no field to blame — a save that did not reach the database, an
 * unsupported section — still has to give the user back everything they typed.
 * Shared with {@link formStateFromError} so the two paths cannot drift; the
 * server action layer previously kept its own copy of this loop.
 */
export function formStateFromSubmission(
  formData: FormData,
  message: string,
): ProfileFormState {
  return {
    status: "error",
    message,
    values: formDataToValues(formData),
    multipleValues: formDataToMultipleValues(formData),
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formDataToValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      values[key] = value;
    }
  }

  return values;
}

function formDataToMultipleValues(formData: FormData): Record<string, string[]> {
  const values: Record<string, string[]> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") {
      continue;
    }

    (values[key] ??= []).push(value);
  }

  return values;
}

function normalizeFieldValue(field: string, value: string | undefined) {
  if (field === "current") {
    return value === "on" || value === "true";
  }

  if (field.toLowerCase().includes("month") || field.toLowerCase().includes("year")) {
    return value ? Number(value) : null;
  }

  return value ?? "";
}

function validateDateRange(
  value: z.infer<typeof datedEntry>,
  context: z.RefinementCtx,
) {
  validateMonthYearPair(context, {
    month: value.startMonth,
    year: value.startYear,
    yearField: "startYear",
    label: "start year",
    monthLabel: "start month",
  });

  if (value.current) {
    /*
      A current entry has no end date, so the end month/year pair is not checked
      here. Running both produced contradictory advice on the same submission —
      "it cannot also have an end date" next to "add an end year" — which is one
      of the `endYear: [Array]` cases.

      The remaining issue is attached to the field the user actually filled in.
      The previous version always used endYear, so someone who entered only an
      end month saw the error appear under a field they had left blank. Naming
      the checkbox matters too: clearing the date is not the only valid fix.
    */
    if (value.endMonth !== null || value.endYear !== null) {
      context.addIssue({
        code: "custom",
        path: [value.endYear !== null ? "endYear" : "endMonth"],
        message:
          "This entry is marked as current, so it cannot also have an end date. " +
          "Clear the end date, or uncheck “This is current”.",
      });
    }

    return;
  }

  validateMonthYearPair(context, {
    month: value.endMonth,
    year: value.endYear,
    yearField: "endYear",
    label: "end year",
    monthLabel: "end month",
  });

  validateOrderedDates(
    value.startMonth,
    value.startYear,
    value.endMonth,
    value.endYear,
    context,
    "endYear",
    "End date cannot be earlier than start date.",
  );
}

function validateMonthYearPair(
  context: z.RefinementCtx,
  options: {
    month: number | null;
    year: number | null;
    yearField: string;
    label: string;
    monthLabel: string;
  },
) {
  if (options.month !== null && options.year === null) {
    context.addIssue({
      code: "custom",
      path: [options.yearField],
      message: `Add a ${options.label} — a ${options.monthLabel} on its own is not enough to place this on a timeline.`,
    });
  }
}

function validateOrderedDates(
  startMonth: number | null,
  startYear: number | null,
  endMonth: number | null,
  endYear: number | null,
  context: z.RefinementCtx,
  field: string,
  message: string,
) {
  if (!startYear || !endYear) {
    return;
  }

  const start = startYear * 12 + (startMonth ?? 1);
  const end = endYear * 12 + (endMonth ?? 12);

  if (end < start) {
    context.addIssue({ code: "custom", path: [field], message });
  }
}
