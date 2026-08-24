/**
 * The review step: what the screen shows, and what comes back from it.
 *
 * Between reading a document and writing to a dossier there is a person deciding whether we
 * read it correctly. This module is the shape of that decision. It takes an
 * {@link ImportResult} — the parser's proposals — and turns it into rows of labelled fields
 * the review screen can render, then reads the submitted form back into values the dossier's
 * own validation can check.
 *
 * Three properties matter, and all three are the reason this is a separate module from both
 * the parser and the server action.
 *
 * **The form is not authoritative about what exists.** Every row the submission is read for
 * comes from the stored result, never from the field names in the request. A form naming a
 * candidate that is not in the import contributes nothing, and a form naming a *section* is
 * ignored outright — the section a candidate belongs to is the parser's reading, kept
 * server-side. Otherwise a crafted request could write an arbitrary row into any table by
 * inventing a prefix.
 *
 * **The fields shown are the dossier's own.** Labels, control types, option lists and
 * required-ness all come from {@link profileSectionMap}, the same definitions the dossier
 * forms are built from. So a field added to a section appears in the review screen without
 * anything here changing, and the review screen cannot offer a field the section does not
 * have or omit one it requires.
 *
 * **Not every field is shown.** A section has up to a dozen fields and a document rarely
 * states them all; rendering every blank one for every candidate would turn a review into
 * data entry. A field appears when the document said something, when the section requires it,
 * or when another shown field depends on it. Everything else is left to the dossier, where
 * there is room for it.
 */

import { profileSectionMap, type ProfileField } from "@/profile/sections";
import type { ProfileSectionKey } from "@/profile/types";
import type { ImportCandidate, ImportResult } from "./candidates";

/**
 * The row id the person's own details are submitted under.
 *
 * Basics are not a candidate — they are columns on the profile rather than an entry in a
 * section — but they are reviewed in the same form, so they need a row id. It is a fixed
 * string rather than a generated one, and candidate ids are generated per section
 * (`experience-1`, `education-2`), so it cannot collide with one.
 */
export const IMPORT_BASICS_ROW = "your-details";

/** Whether a row was ticked for import. */
export function importIncludeName(rowId: string): string {
  return `include.${rowId}`;
}

/** One field of one row. Prefixed so many rows can share a single form. */
export function importFieldName(rowId: string, field: string): string {
  return `field.${rowId}.${field}`;
}

/**
 * The field name a row-level issue is filed under.
 *
 * A cross-field rule — "a grade needs the system it is expressed in" — raises an issue with no
 * single field to blame. It is filed against the row under this name rather than dropped, so
 * the review screen has somewhere to show it. Shared with the commit path deliberately: a
 * message written under one name and read under another is a message nobody sees. The double
 * underscore keeps it clear of any real field name a section could define.
 */
export const IMPORT_ROW_LEVEL_FIELD = "__row";

/**
 * How well a row came out of the document.
 *
 * Deliberately two states, not a score. "We are 82% confident" is a number a user cannot
 * act on; "this needs a look" is. `matched` means every required field was read and the
 * parser raised nothing; `review` means at least one of those is not true, and the row
 * carries the reasons in `notes`.
 */
export type ImportRowStatus = "matched" | "review";

export type ImportReviewField = {
  /** The dossier's own field definition — label, type, options, hint. */
  readonly field: ProfileField;
  /** The prefixed form name this field submits under. */
  readonly name: string;
  /** What the document said, or an empty string where it said nothing. */
  readonly value: string;
  /** The document stated this. Where false and the field is required, it needs the user. */
  readonly read: boolean;
};

export type ImportReviewRow = {
  readonly id: string;
  readonly section: ProfileSectionKey;
  readonly sectionLabel: string;
  /** What to call this row in a heading — read from the row's own values, never invented. */
  readonly title: string;
  readonly fields: readonly ImportReviewField[];
  readonly source: readonly string[];
  readonly notes: readonly string[];
  readonly status: ImportRowStatus;
  /** Savable exactly as it stands: the document stated every field the section requires. */
  readonly ready: boolean;
  readonly includeName: string;
};

export type ImportReviewBasics = {
  readonly id: typeof IMPORT_BASICS_ROW;
  readonly fields: readonly ImportReviewField[];
  readonly source: readonly string[];
  readonly notes: readonly string[];
  readonly status: ImportRowStatus;
  readonly ready: boolean;
  readonly includeName: string;
  /** True when the document yielded nothing about the person themselves. */
  readonly empty: boolean;
};

export type ImportReviewGroup = {
  readonly section: ProfileSectionKey;
  readonly label: string;
  readonly rows: readonly ImportReviewRow[];
};

export type ImportReview = {
  readonly basics: ImportReviewBasics;
  readonly groups: readonly ImportReviewGroup[];
  /** Recognised text that was not imported, shown so nothing disappears unseen. */
  readonly skipped: readonly string[];
  readonly totalRows: number;
  readonly rowsNeedingReview: number;
};

/**
 * The person's own details, as fields.
 *
 * These are profile columns rather than a section, so they have no
 * {@link ProfileSectionDefinition} to read from and are declared here. The names and the
 * labels match the identity form exactly — a user who edits `headline` here and then opens
 * the dossier must find the same box holding the same words.
 *
 * `careerDirection` is included because a document's summary or objective paragraph is the
 * user's own statement of where they are going, and requirement is that it arrives as
 * *their* wording. It is imported verbatim, into the field the dossier already keeps it in,
 * and nothing rewrites it.
 */
const basicsFields: readonly ProfileField[] = [
  { name: "displayName", label: "Name", autocomplete: "name" },
  { name: "contactEmail", label: "Contact email", type: "email", autocomplete: "email" },
  { name: "phone", label: "Phone", type: "tel", autocomplete: "tel" },
  { name: "country", label: "Country", autocomplete: "country-name" },
  { name: "region", label: "State, province, or region", autocomplete: "address-level1" },
  { name: "city", label: "City or locality", autocomplete: "address-level2" },
  { name: "website", label: "Personal website", type: "url", autocomplete: "url" },
  { name: "headline", label: "Professional headline" },
  {
    name: "careerDirection",
    label: "Career direction",
    type: "textarea",
    hint: "Taken from your document as you wrote it. Edit it if you want to; nothing rewrites it.",
  },
];

/** The basics field names, as a set, so a submitted key can be checked against it. */
const basicsFieldNames = new Set(basicsFields.map((field) => field.name));

export function importBasicsFields(): readonly ProfileField[] {
  return basicsFields;
}

export function buildImportReview(result: ImportResult): ImportReview {
  const basics = buildBasics(result);
  const groups = buildGroups(result.candidates);

  const rows = groups.flatMap((group) => group.rows);
  const needing = rows.filter((row) => row.status === "review").length;

  return {
    basics,
    groups,
    skipped: result.skipped,
    totalRows: rows.length + (basics.empty ? 0 : 1),
    rowsNeedingReview: needing + (!basics.empty && basics.status === "review" ? 1 : 0),
  };
}

/* Reading the submission ------------------------------------------------------ */

export type ImportEntrySelection = {
  readonly rowId: string;
  readonly section: ProfileSectionKey;
  readonly values: Readonly<Record<string, string>>;
};

export type ImportSelection = {
  /** Absent when the user untick the details row, or when there were none. */
  readonly basics: Readonly<Record<string, string>> | null;
  readonly entries: readonly ImportEntrySelection[];
};

/**
 * What the user chose to import, read from their submission.
 *
 * Driven by the stored result rather than by the form: the loop is over the candidates we
 * parsed, and for each one the form is asked whether it was ticked and what its fields now
 * say. A field name the section does not have is dropped, which means a request can add
 * values to a row but never a *column* to a table.
 *
 * An unticked checkbox submits nothing at all, so absence is the "no" — which also makes
 * this behave correctly for a submission from a page rendered before a field was added.
 */
export function collectImportSelection(
  result: ImportResult,
  formData: FormData,
): ImportSelection {
  const ticked = (rowId: string) => formData.get(importIncludeName(rowId)) === "on";

  const read = (rowId: string, allowed: (name: string) => boolean) => {
    const values: Record<string, string> = {};
    const prefix = `field.${rowId}.`;

    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string" || !key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      if (allowed(name)) values[name] = value;
    }

    return values;
  };

  const basics = ticked(IMPORT_BASICS_ROW)
    ? read(IMPORT_BASICS_ROW, (name) => basicsFieldNames.has(name))
    : null;

  const entries: ImportEntrySelection[] = [];

  for (const candidate of result.candidates) {
    if (!ticked(candidate.id)) continue;

    const definition = profileSectionMap[candidate.section];
    const allowed = new Set(definition.fields.map((field) => field.name));

    entries.push({
      rowId: candidate.id,
      section: candidate.section,
      values: read(candidate.id, (name) => allowed.has(name)),
    });
  }

  return { basics, entries };
}

/* Building the rows ----------------------------------------------------------- */

function buildBasics(result: ImportResult): ImportReviewBasics {
  const values = result.basics.values;
  const shown = basicsFields.filter(
    (field) => hasValue(values[field.name]) || field.name === "displayName",
  );

  const fields = shown.map((field) => ({
    field,
    name: importFieldName(IMPORT_BASICS_ROW, field.name),
    value: values[field.name] ?? "",
    read: hasValue(values[field.name]),
  }));

  const empty = fields.every((entry) => !entry.read);
  const status = statusFor(result.basics.notes, fields);

  return {
    id: IMPORT_BASICS_ROW,
    fields,
    source: result.basics.source,
    notes: result.basics.notes,
    status,
    ready: readyFrom(fields),
    includeName: importIncludeName(IMPORT_BASICS_ROW),
    empty,
  };
}

/**
 * Candidates grouped by section, in the dossier's own section order.
 *
 * The parser emits candidates in document order, which is the order the *document* chose to
 * present them — often experience first, sometimes education, occasionally interleaved.
 * Grouping them by section and ordering the groups the way the dossier does means the review
 * screen reads like the dossier the user is about to have, rather than like the file they
 * uploaded. Within a group, document order is kept: that is the user's own sequence, and it
 * carries meaning the parser has no business reordering.
 */
function buildGroups(candidates: readonly ImportCandidate[]): readonly ImportReviewGroup[] {
  const groups: ImportReviewGroup[] = [];

  for (const definition of Object.values(profileSectionMap)) {
    const rows = candidates
      .filter((candidate) => candidate.section === definition.key)
      .map((candidate) => buildRow(candidate, definition.label));

    if (rows.length) {
      groups.push({ section: definition.key, label: definition.label, rows });
    }
  }

  return groups;
}

function buildRow(candidate: ImportCandidate, sectionLabel: string): ImportReviewRow {
  const definition = profileSectionMap[candidate.section];
  const values = candidate.values;

  /*
   * A field a shown field depends on has to be shown too, or the user is handed a grade
   * with no way to say what it is out of — and the dossier's own rule rejects exactly that.
   * Collected first so the visibility test below can consult it.
   */
  const dependencies = new Set<string>();
  for (const field of definition.fields) {
    if (field.dependsOn && hasValue(values[field.name])) dependencies.add(field.dependsOn);
  }

  const fields = definition.fields
    .filter((field) => {
      /*
       * "I currently work here" makes the end date not a question. The dossier form removes
       * those inputs for the same reason; here it also keeps the submission from carrying a
       * current entry *and* an end date, which the dossier's validation refuses.
       */
      if (field.clearedBy && values[field.clearedBy] === "on") return false;

      return hasValue(values[field.name]) || field.required === true || dependencies.has(field.name);
    })
    .map((field) => ({
      field,
      name: importFieldName(candidate.id, field.name),
      value: values[field.name] ?? "",
      read: hasValue(values[field.name]),
    }));

  return {
    id: candidate.id,
    section: candidate.section,
    sectionLabel,
    title: titleFor(candidate, definition.singular),
    fields,
    source: candidate.source,
    notes: candidate.notes,
    status: statusFor(candidate.notes, fields),
    ready: readyFrom(fields),
    includeName: importIncludeName(candidate.id),
  };
}

/**
 * What to call a row.
 *
 * Read from the row's own values in the order a person would say them — the role, then the
 * qualification, then the name of the thing — and never composed of anything the document
 * did not state. Where the document gave nothing nameable, the row is called after its
 * section ("Education record"), which is honest, rather than after the first line of text
 * we happened to keep.
 */
function titleFor(candidate: ImportCandidate, singular: string): string {
  const values = candidate.values;
  const parts = ["role", "qualification", "name", "title", "label", "language", "organization"]
    .map((key) => values[key])
    .filter((value): value is string => hasValue(value));

  if (parts.length === 0) return capitalize(singular);

  const [primary] = parts;
  const secondary = values.organization ?? values.institution ?? values.issuer ?? values.publisher;

  return secondary && secondary !== primary ? `${primary} — ${secondary}` : (primary as string);
}

function statusFor(
  notes: readonly string[],
  fields: readonly ImportReviewField[],
): ImportRowStatus {
  if (notes.length > 0) return "review";
  return fields.some((entry) => entry.field.required === true && !entry.read) ? "review" : "matched";
}

/**
 * Whether a row can be saved with no further typing.
 *
 * Distinct from {@link statusFor}. A row can want a look — the parser was unsure which
 * fragment was the employer — while still holding a value in every required field, and such a
 * row is safe to import as it stands. `ready` drives whether a row is ticked by default;
 * `status` drives whether it is flagged for attention. Conflating them would either pre-tick
 * rows that cannot be saved or withhold the tick from rows that are merely worth checking.
 */
function readyFrom(fields: readonly ImportReviewField[]): boolean {
  return fields.every((entry) => entry.field.required !== true || entry.read);
}

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
