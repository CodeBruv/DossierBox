/**
 * The application objective — what the user is applying for, in enough detail to compose
 * a document for it.
 *
 * ```
 * ApplicationObjective   what the user is pursuing        "a scholarship at Leiden"
 * DossierSnapshot        what the user has done           the facts, owned by the profile
 * DocumentTypeKey        what we will produce             "academic_cv"
 * ```
 *
 * Three separate things. This module owns the first and imports neither of the others
 * except to name the kind's default documents. In particular it holds **no career facts**:
 * the objective says a user is applying to Leiden, never that they studied there. That
 * separation is what keeps the profile the single source of truth — an objective is
 * discarded when the application is over; a career history is not.
 *
 * ## Why an objective is validated at all, when nothing is enforced yet
 *
 * Because every field here is going to be sent to a language model, and a prompt is an
 * injection surface. A 40,000-character "job description" pasted from a page of adverts,
 * or a "target role" containing instructions addressed to the model, are the shapes that
 * cause trouble later. Bounding them at the domain boundary — before persistence, before
 * composition, before any provider call — is far cheaper than bounding them at each of
 * those places, and it is the reason the limits below are deliberately generous but
 * finite.
 *
 * Normalisation is also what makes the objective *storable*: a stable shape with `null` for
 * every absent field, so a JSON column round-trips to the same object it came from — and a
 * value written before a field existed still parses, gaining that field as `null` rather
 * than becoming unreadable.
 */

import { z } from "zod";
import {
  applicationObjectiveKinds,
  defaultApplicationObjectiveKind,
  type ApplicationObjectiveKind,
} from "./objective-kinds";

/*
 * Field limits.
 *
 * Named rather than inlined because a form's `maxLength` attribute and this schema must
 * agree — a field that silently truncates client-side and errors server-side is the
 * frustrating kind of bug. Sized against reality: German and Dutch institution names run
 * long, and a public-sector job description genuinely can be several thousand characters.
 */
export const applicationObjectiveLimits = {
  targetRole: 160,
  organisation: 160,
  institution: 160,
  programme: 160,
  field: 120,
  requirements: 4000,
  instructions: 4000,
  requestedDocument: 120,
  requestedDocuments: 12,
  wordLimit: { min: 1, max: 20_000 },
  pageLimit: { min: 1, max: 50 },
} as const;

const tooLong = (label: string, maximum: number) =>
  `${label} is too long. Keep it to ${maximum} characters or fewer.`;

/*
 * Absent, empty and `null` all mean the same thing: not provided.
 *
 * Hence `.nullable().default(null)` on every optional field, which is load-bearing in two
 * places rather than defensive tidying. A stored objective is written with an explicit
 * `null` in every unfilled field, so without `.nullable()` reading one back would fail and
 * `normalizeApplicationObjective` would answer `null` for a perfectly good objective —
 * the round-trip this module promises would not hold. And without `.default(null)` an
 * objective written by an *earlier* build, before a field existed, would be unparseable
 * the moment a field is added; the deadline field is the first case of that and will not
 * be the last.
 *
 * Not `.optional()`: that would let `undefined` reach the output and give the same absent
 * field two representations, which is precisely what a stable stored shape rules out.
 */
const absent = <Schema extends z.ZodType<string | null, string>>(schema: Schema) =>
  schema.nullable().default(null);

const optionalText = (label: string, maximum: number) =>
  absent(
    z
      .string()
      .trim()
      .max(maximum, tooLong(label, maximum))
      .transform((value) => value || null),
  );

/**
 * A two-letter country code, not a country name.
 *
 * Destination adaptation — which conventions a document follows, which currency a price
 * is shown in — has to key off something machine-readable, and "UK" typed three different
 * ways is not. So the field is a code and a form supplying it must be a select.
 *
 * Shape is checked, membership is not: this accepts `"ZZ"`. Checking membership needs a
 * country list, which belongs to the destination configuration that does not exist yet,
 * and inventing a partial list here would be worse than declaring the gap.
 */
const optionalCountryCode = absent(
  z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), "Choose a country from the list.")
    .transform((value) => value || null),
);

const optionalCount = (label: string, { min, max }: { min: number; max: number }) =>
  z
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be no more than ${max}.`)
    .nullable()
    .default(null);

/**
 * `new Date("2026-02-30T00:00:00Z")` does not fail — it rolls forward to 2 March. So the
 * round-trip, not the parse, is what rejects an impossible date.
 */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The application deadline, as a calendar date.
 *
 * `YYYY-MM-DD`, and deliberately not a `Date` or a timestamp. A deadline is a calendar date
 * in the opportunity's own locale — "31 October" — so storing it as an instant would make
 * it drift by a day for users on one side of UTC and turn a date the user typed into a time
 * they did not choose. A plain string also round-trips through a JSON column unchanged,
 * which a `Date` does not.
 *
 * Past dates are accepted. Someone recording an application they already sent, or one whose
 * deadline has slipped, must still be able to save it; refusing would be the application
 * deciding it knows the user's situation better than they do. Whether to *warn* about a
 * past deadline is a UI question, and a later one.
 */
const optionalDeadline = absent(
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || isCalendarDate(value),
      "Enter the deadline as a date, for example 2026-10-31.",
    )
    .transform((value) => value || null),
);

/**
 * The documents the opportunity asked for, in the opportunity's own words.
 *
 * Strings, not `DocumentTypeKey`s, and that is a deliberate refusal. An advert says
 * "Curriculum Vitae", "Personal Statement", "two academic references" — mapping those onto
 * our vocabulary is a *judgement*, and making it here, silently, at input time, would mean
 * a wrong guess quietly changes which document we produce with no trace of what the user
 * actually pasted. The recognition step belongs to the matching engine, where it can be
 * reviewed and where an unrecognised request can be reported instead of dropped.
 */
const requestedDocumentList = z
  .array(
    z
      .string()
      .trim()
      .max(
        applicationObjectiveLimits.requestedDocument,
        tooLong("A requested document", applicationObjectiveLimits.requestedDocument),
      ),
  )
  .max(
    applicationObjectiveLimits.requestedDocuments,
    `List no more than ${applicationObjectiveLimits.requestedDocuments} requested documents.`,
  )
  .transform((values) => values.filter((value) => value.length > 0))
  .default([]);

export const applicationObjectiveSchema = z.object({
  kind: z.enum(applicationObjectiveKinds, {
    error: "Choose what you are applying for.",
  }),
  /** The role, post, or position. */
  targetRole: optionalText("Role", applicationObjectiveLimits.targetRole),
  /** The employer or funder. */
  organisation: optionalText("Organisation", applicationObjectiveLimits.organisation),
  /** The university, school, or research body, where that differs from the organisation. */
  institution: optionalText("Institution", applicationObjectiveLimits.institution),
  /** The named programme, scheme, or scholarship. */
  programme: optionalText("Programme", applicationObjectiveLimits.programme),
  /** The discipline or sector. */
  field: optionalText("Field", applicationObjectiveLimits.field),
  /** ISO 3166-1 alpha-2. */
  country: optionalCountryCode,
  /**
   * When the application is due, `YYYY-MM-DD`.
   *
   * Recorded rather than acted on. It exists on the objective because a deadline belongs to
   * the opportunity — not to any one document produced for it — and a set of three documents
   * for one scholarship shares a single deadline. Nothing schedules, reminds or blocks on it
   * yet, and it is not treated as tailoring detail: a date tells the writing layer nothing
   * about what to say.
   */
  deadline: optionalDeadline,
  /** What the opportunity asks for — pasted criteria, or a job description. */
  requirements: optionalText("Requirements", applicationObjectiveLimits.requirements),
  /** How to apply — submission notes the user wants respected. */
  instructions: optionalText("Instructions", applicationObjectiveLimits.instructions),
  /**
   * A limit the *opportunity* imposes, which is not the same thing as a document type's
   * own page budget. When both exist the stricter one wins, and deciding that is the
   * matching engine's job — recording the constraint is this module's.
   */
  wordLimit: optionalCount("Word limit", applicationObjectiveLimits.wordLimit),
  pageLimit: optionalCount("Page limit", applicationObjectiveLimits.pageLimit),
  requestedDocuments: requestedDocumentList,
});

export type ApplicationObjective = z.output<typeof applicationObjectiveSchema>;

export type ApplicationObjectiveInput = z.input<typeof applicationObjectiveSchema>;

/**
 * An objective with a kind and nothing else filled in.
 *
 * The starting point for a user who has told us what they are applying for and no more,
 * which the product must handle well: a document composed from an objective this bare is
 * still a real document, because the facts come from the profile, not from here.
 */
export function emptyApplicationObjective(
  kind: ApplicationObjectiveKind = defaultApplicationObjectiveKind,
): ApplicationObjective {
  return {
    kind,
    targetRole: null,
    organisation: null,
    institution: null,
    programme: null,
    field: null,
    country: null,
    deadline: null,
    requirements: null,
    instructions: null,
    wordLimit: null,
    pageLimit: null,
    requestedDocuments: [],
  };
}

export type ApplicationObjectiveResult = ReturnType<typeof applicationObjectiveSchema.safeParse>;

export function validateApplicationObjective(value: unknown): ApplicationObjectiveResult {
  return applicationObjectiveSchema.safeParse(value);
}

/**
 * Parse an objective, or `null` if it is not one.
 *
 * For callers reading a stored objective back — a JSON column written by an older build,
 * a value from an untrusted boundary — where per-field messages are no use and the only
 * useful question is whether this is a usable objective at all. A caller showing a form
 * wants {@link validateApplicationObjective} instead, so the user learns which field is
 * wrong.
 */
export function normalizeApplicationObjective(value: unknown): ApplicationObjective | null {
  const result = applicationObjectiveSchema.safeParse(value);

  return result.success ? result.data : null;
}

/**
 * Whether the user has told us anything beyond the kind.
 *
 * The signal for whether tailoring is possible at all: with only a kind we can pick the
 * right *type* of document, but there is nothing to tailor its wording to, and a writing
 * layer that invents a target from an empty objective is the fabrication the product
 * forbids.
 */
export function hasObjectiveDetail(objective: ApplicationObjective): boolean {
  return (
    objective.targetRole !== null ||
    objective.organisation !== null ||
    objective.institution !== null ||
    objective.programme !== null ||
    objective.field !== null ||
    objective.country !== null ||
    objective.requirements !== null ||
    objective.instructions !== null ||
    objective.requestedDocuments.length > 0
  );
}
