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

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null);

const requiredText = (label: string, maximum: number) =>
  z.string().trim().min(1, `${label} is required.`).max(maximum);

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => !value || isHttpUrl(value), "Enter a complete http:// or https:// address.")
  .transform((value) => value || null);

const requiredUrl = z
  .string()
  .trim()
  .min(1, "Web address is required.")
  .max(2048)
  .refine(isHttpUrl, "Enter a complete http:// or https:// address.");

const optionalMonth = z
  .number()
  .int()
  .min(1)
  .max(12)
  .nullable();

const optionalYear = z
  .number()
  .int()
  .min(minimumYear)
  .max(maximumYear)
  .nullable();

const dateRangeShape = {
  startMonth: optionalMonth,
  startYear: optionalYear,
  endMonth: optionalMonth,
  endYear: optionalYear,
  current: z.boolean(),
};

const datedEntry = z.object(dateRangeShape).superRefine(validateDateRange);

export const profileBasicsSchema = z.object({
  displayName: optionalText(120),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email address.")
    .transform((value) => value || null),
  phone: optionalText(40),
  country: optionalText(100),
  region: optionalText(100),
  city: optionalText(100),
  website: optionalUrl,
  headline: optionalText(160),
  careerDirection: optionalText(2000),
});

export const profileSectionSelectionSchema = z.object({
  sections: z.array(z.enum(profileSectionKeys)).max(profileSectionKeys.length),
});

export const experienceSchema = z
  .object({
    type: z.enum(experienceTypes),
    organization: requiredText("Organization or client", 180),
    role: requiredText("Role or position", 180),
    location: optionalText(180),
    description: optionalText(5000),
    ...dateRangeShape,
  })
  .superRefine(validateDateRange);

export const educationSchema = z
  .object({
    institution: requiredText("Institution or learning provider", 180),
    qualification: optionalText(180),
    field: optionalText(180),
    location: optionalText(180),
    description: optionalText(5000),
    ...dateRangeShape,
  })
  .superRefine(validateDateRange);

export const projectSchema = z
  .object({
    name: requiredText("Project name", 180),
    role: optionalText(180),
    context: optionalText(180),
    url: optionalUrl,
    description: optionalText(5000),
    ...dateRangeShape,
  })
  .superRefine(validateDateRange);

export const skillSchema = z.object({
  name: requiredText("Skill", 120),
  type: z.enum(skillTypes),
  notes: optionalText(1000),
});

export const credentialSchema = z
  .object({
    type: z.enum(credentialTypes),
    name: requiredText("Credential name", 180),
    issuer: optionalText(180),
    identifier: optionalText(180),
    url: optionalUrl,
    issueMonth: optionalMonth,
    issueYear: optionalYear,
    expiryMonth: optionalMonth,
    expiryYear: optionalYear,
    description: optionalText(3000),
  })
  .superRefine((value, context) => {
    validateMonthYearPair(value.issueMonth, value.issueYear, "issue", context);
    validateMonthYearPair(value.expiryMonth, value.expiryYear, "expiry", context);
    validateOrderedDates(
      value.issueMonth,
      value.issueYear,
      value.expiryMonth,
      value.expiryYear,
      context,
      "Expiry date cannot be earlier than issue date.",
    );
  });

export const achievementSchema = z
  .object({
    type: z.enum(achievementTypes),
    title: requiredText("Title", 180),
    issuer: optionalText(180),
    month: optionalMonth,
    year: optionalYear,
    description: optionalText(3000),
  })
  .superRefine((value, context) => {
    validateMonthYearPair(value.month, value.year, "month", context);
  });

export const languageSchema = z.object({
  language: requiredText("Language", 100),
  proficiency: optionalText(100),
  notes: optionalText(1000),
});

export const publicationSchema = z
  .object({
    title: requiredText("Publication title", 300),
    publisher: optionalText(180),
    month: optionalMonth,
    year: optionalYear,
    url: optionalUrl,
    description: optionalText(3000),
  })
  .superRefine((value, context) => {
    validateMonthYearPair(value.month, value.year, "month", context);
  });

export const membershipSchema = z
  .object({
    organization: requiredText("Organization", 180),
    role: optionalText(180),
    description: optionalText(3000),
    ...dateRangeShape,
  })
  .superRefine(validateDateRange);

export const profileLinkSchema = z.object({
  type: z.enum(linkTypes),
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

export function formStateFromError(
  error: z.ZodError,
  formData: FormData,
  message = "Check the highlighted information and try again.",
): ProfileFormState {
  return {
    status: "error",
    message,
    fieldErrors: error.flatten().fieldErrors,
    values: formDataToValues(formData),
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
  validateMonthYearPair(value.startMonth, value.startYear, "start", context);
  validateMonthYearPair(value.endMonth, value.endYear, "end", context);

  if (value.current && (value.endMonth || value.endYear)) {
    context.addIssue({
      code: "custom",
      path: ["endYear"],
      message: "Remove the end date when this entry is current.",
    });
  }

  if (!value.current) {
    validateOrderedDates(
      value.startMonth,
      value.startYear,
      value.endMonth,
      value.endYear,
      context,
      "End date cannot be earlier than start date.",
    );
  }
}

function validateMonthYearPair(
  month: number | null,
  year: number | null,
  path: string,
  context: z.RefinementCtx,
) {
  if (month && !year) {
    context.addIssue({
      code: "custom",
      path: [path === "month" ? "year" : `${path}Year`],
      message: "Add a year when you provide a month.",
    });
  }
}

function validateOrderedDates(
  startMonth: number | null,
  startYear: number | null,
  endMonth: number | null,
  endYear: number | null,
  context: z.RefinementCtx,
  message: string,
) {
  if (!startYear || !endYear) {
    return;
  }

  const start = startYear * 12 + (startMonth ?? 1);
  const end = endYear * 12 + (endMonth ?? 12);

  if (end < start) {
    context.addIssue({ code: "custom", path: ["endYear"], message });
  }
}
