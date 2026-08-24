/**
 * Turning a dossier into a document.
 *
 * This is the **configuration** layer in the chain
 * `dossier → composition → presentation`. It decides, for a given document
 * type, which sections appear, in what order, and what each entry's lines say.
 * It decides nothing about typography, spacing or markup — that belongs to the
 * presentation layer, which consumes only the plain data returned here.
 *
 * Which sections a type shows, in what order, and what each is called are *not*
 * decided here either: they are declared in `./catalogue`, and this module reads that
 * declaration. That separation is what lets a new document type be an entry in a
 * registry rather than a new branch in this file.
 *
 * Three rules govern this module, and they are the reason it is pure:
 *
 * 1. **Nothing is invented.** Every string that reaches a document is either
 *    text the user typed, a date they entered, or a label from this application's
 *    own vocabulary. No connective prose, no inferred seniority, no computed
 *    "years of experience", no filler where a field was left blank.
 * 2. **Nothing is silently dropped.** A section disappears for exactly two reasons:
 *    it is empty, or the user hid it. The three shipping document types each list
 *    every section the dossier can fill, so they differ by *order*, not by
 *    discarding a user's record — someone who entered publications should never find
 *    them missing from a résumé without being told. (A future letter or statement
 *    type will legitimately list only the sections it has; that is a declaration in
 *    the catalogue, not a silent drop here.)
 * 3. **The output is deterministic.** The same dossier composes to the same
 *    document every time, which is why the snapshot reads sections in a fixed
 *    order and why nothing here reads a clock or a random source.
 *
 * Being pure also means the whole of DossierBox's document logic is unit-testable
 * without a database, a request, or a browser.
 */

import type {
  DossierAchievement,
  DossierCredential,
  DossierEducation,
  DossierExperience,
  DossierLanguage,
  DossierLink,
  DossierMembership,
  DossierPeriod,
  DossierProject,
  DossierPublication,
  DossierSkill,
  DossierSnapshot,
} from "@/profile/dossier";
import { profileSectionMap } from "@/profile/sections";
import { skillTypes, type ProfileSectionKey } from "@/profile/types";
import { experienceTypeOptions } from "@/profile/vocabularies";
import {
  documentHeadingOverrides,
  orderSections,
  sectionHeading,
  type DocumentSectionKey,
  type DocumentTypeKey,
} from "./catalogue";

/**
 * The sections a composed document can contain.
 *
 * An alias of the catalogue's vocabulary, kept as a named export because the
 * presentation layer and the workspace both refer to it. It used to be defined here as
 * `ProfileSectionKey | "summary"`, which welded documents to the dossier's shape and
 * made a letter or a statement — which have sections the dossier has never heard of —
 * impossible to express. The catalogue owns this vocabulary now.
 */
export type ComposedSectionKey = DocumentSectionKey;


/**
 * The user's own free text, split into the lines they wrote.
 *
 * Structuring the text here rather than in the renderer keeps the decision
 * testable and gives the presentation layer exactly one way to draw prose. The
 * text itself is never edited beyond trimming and removing a bullet marker the
 * user typed themselves.
 */
export type ComposedDetail = {
  kind: "paragraphs" | "bullets";
  lines: string[];
};

/** One record, reduced to the lines a document can print. */
export type ComposedEntry = {
  /** Always present: the strongest identifying fact in the record. */
  title: string;
  /** The organisation, institution, issuer or publisher behind the title. */
  subtitle: string | null;
  /** Dates, location and other short qualifiers, already joined. */
  meta: string | null;
  /** The user's own free text, verbatim. */
  detail: ComposedDetail | null;
  /** A link the user supplied, if any. Never derived from other fields. */
  url: string | null;
};

export type ComposedSection =
  /** A single block of the user's own prose. */
  | { key: ComposedSectionKey; heading: string; layout: "prose"; body: ComposedDetail }
  /** A dated list — experience, education, credentials and similar. */
  | { key: ComposedSectionKey; heading: string; layout: "entries"; entries: ComposedEntry[] }
  /** A compact run of short values, printed on as few lines as possible. */
  | { key: ComposedSectionKey; heading: string; layout: "inline"; items: string[] }
  /** Short values kept under their own labels, for skills. */
  | {
      key: ComposedSectionKey;
      heading: string;
      layout: "grouped";
      groups: { label: string; items: string[] }[];
    };

export type ComposedHeader = {
  name: string | null;
  headline: string | null;
  /** Email, phone, location and website — whichever the user supplied. */
  contacts: string[];
};

export type ComposedDocument = {
  type: DocumentTypeKey;
  header: ComposedHeader;
  sections: ComposedSection[];
};

/** `·` between short facts on one line; the presentation layer never re-splits these. */
const META_SEPARATOR = " · ";

/**
 * A bullet the user typed at the start of a line. Anchored, so a hyphen inside a
 * word ("e-commerce") is never mistaken for one.
 */
const BULLET_MARKER = /^[-–—*•·]\s*/;

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * What the user configured on this document, as the composition layer sees it.
 *
 * Optional throughout, so an unconfigured document composes exactly as it did
 * before this existed — which is also what makes the function safe to call from
 * the tests and, later, from the PDF renderer without threading configuration
 * through every caller.
 */
export type DocumentConfiguration = {
  /**
   * Sections the user chose to leave out. Kept as a set of raw strings rather
   * than `ComposedSectionKey[]` because it arrives from a database column, and a
   * value this build does not recognise should be ignored, not crash the
   * document.
   */
  hiddenSections?: readonly string[];
  /**
   * The order the user arranged this document's sections into.
   *
   * Raw strings for the same reason as `hiddenSections`, and empty means "the order
   * the type declares" — so an untouched document is not pinned to whatever the
   * catalogue happened to say on the day it was created. Sections the order does not
   * mention are not dropped; they keep their catalogue neighbours. See
   * `orderSections`.
   */
  sectionOrder?: readonly string[];
};

export function composeDocument(
  type: DocumentTypeKey,
  snapshot: DossierSnapshot,
  configuration: DocumentConfiguration = {},
): ComposedDocument {
  const built = buildSections(snapshot, documentHeadingOverrides(type));
  const hidden = new Set(configuration.hiddenSections ?? []);

  return {
    type,
    header: composeHeader(snapshot),
    /**
     * `flatMap` over the resolved running order, rather than filtering the built
     * map, so an empty section simply yields nothing. With no stored order this is
     * the catalogue order, unchanged; with one it is the user's arrangement, and
     * either way the ordering rules live in exactly one place — the catalogue's
     * `orderSections` — rather than being restated here.
     *
     * Hiding is applied here, at the last step, for the same reason: a hidden
     * section is absent from the document but its data is untouched, so
     * un-hiding it restores it exactly — and to its original place, because the
     * order is stored separately and still mentions it. Nothing upstream knows the
     * user made a choice, and nothing downstream can tell a hidden section from an
     * empty one — the presentation layer renders what it is given either way.
     */
    sections: orderSections(type, configuration.sectionOrder ?? []).flatMap((key) =>
      hidden.has(key) ? [] : built[key] ?? [],
    ),
  };
}

/**
 * The sections this dossier could show in this family, in order, whether or not
 * the user has hidden them.
 *
 * This is what the section-visibility and reordering control lists. It has to come
 * from the same order resolution and `buildSections` the document itself uses, or the
 * control would eventually offer a toggle for something the document cannot show, or
 * list the sections in an order the page does not use — so it composes with the
 * document's own order and no hiding, and reads the result rather than
 * reimplementing the rules.
 */
export function composableSections(
  type: DocumentTypeKey,
  snapshot: DossierSnapshot,
  sectionOrder: readonly string[] = [],
): readonly { key: ComposedSectionKey; heading: string }[] {
  return composeDocument(type, snapshot, { sectionOrder }).sections.map((section) => ({
    key: section.key,
    heading: section.heading,
  }));
}

/**
 * True when there is nothing worth printing yet. Callers use this to show a
 * "your dossier is still empty" state instead of an immaculately typeset blank
 * page.
 */
export function isComposedDocumentEmpty(document: ComposedDocument) {
  return (
    document.sections.length === 0 &&
    !document.header.name &&
    !document.header.headline &&
    document.header.contacts.length === 0
  );
}

function composeHeader({ identity }: DossierSnapshot): ComposedHeader {
  const location = join([identity.city, identity.region, identity.country], ", ");

  return {
    name: clean(identity.displayName),
    headline: clean(identity.headline),
    contacts: [
      clean(identity.contactEmail),
      clean(identity.phone),
      location,
      clean(identity.website),
    ].filter(isPresent),
  };
}

/**
 * Every non-empty section, keyed for lookup. Built once so `composeDocument`
 * only has to order it.
 *
 * `overrides` is the document type's heading conventions, threaded in rather than
 * looked up here so this function stays independent of which type asked for it. No
 * shipping type sets any, so every heading is the catalogue default today.
 */
function buildSections(
  snapshot: DossierSnapshot,
  overrides?: Readonly<Partial<Record<ComposedSectionKey, string>>>,
): Partial<Record<ComposedSectionKey, ComposedSection>> {
  const built: Partial<Record<ComposedSectionKey, ComposedSection>> = {};
  const heading = (key: ComposedSectionKey) => sectionHeading(key, overrides);
  const summary = detailFrom(snapshot.identity.careerDirection);

  if (summary) {
    built.summary = {
      key: "summary",
      heading: heading("summary"),
      layout: "prose",
      body: summary,
    };
  }

  entrySection(built, "experience", snapshot.experience, experienceEntry, heading);
  entrySection(built, "education", snapshot.education, educationEntry, heading);
  entrySection(built, "projects", snapshot.projects, projectEntry, heading);
  entrySection(built, "credentials", snapshot.credentials, credentialEntry, heading);
  entrySection(built, "achievements", snapshot.achievements, achievementEntry, heading);
  entrySection(built, "publications", snapshot.publications, publicationEntry, heading);
  entrySection(built, "memberships", snapshot.memberships, membershipEntry, heading);
  entrySection(built, "links", snapshot.links, linkEntry, heading);

  const skills = skillGroups(snapshot.skills);
  if (skills.length) {
    built.skills = {
      key: "skills",
      heading: heading("skills"),
      layout: "grouped",
      groups: skills,
    };
  }

  const languages = snapshot.languages.map(languageItem).filter(isPresent);
  if (languages.length) {
    built.languages = {
      key: "languages",
      heading: heading("languages"),
      layout: "inline",
      items: languages,
    };
  }

  return built;
}

function entrySection<T>(
  built: Partial<Record<ComposedSectionKey, ComposedSection>>,
  key: ComposedSectionKey,
  rows: readonly T[],
  toEntry: (row: T) => ComposedEntry | null,
  heading: (key: ComposedSectionKey) => string,
) {
  const entries = rows.map(toEntry).filter(isPresent);
  if (!entries.length) return;
  built[key] = { key, heading: heading(key), layout: "entries", entries };
}

/* Entry builders ----------------------------------------------------------
 *
 * Each one answers the same four questions — what is this, who was it with,
 * when and where, and what did the user say about it — and answers them only
 * from fields the user filled in. A row whose required identifying field is
 * somehow blank is skipped rather than printed as an untitled stub.
 */

function experienceEntry(row: DossierExperience): ComposedEntry | null {
  const title = clean(row.role);
  if (!title) return null;

  return {
    title,
    subtitle: clean(row.organization),
    /**
     * The type qualifier trails the dates because it is a footnote on an
     * otherwise self-describing line, and it is omitted for plain employment,
     * where saying so adds nothing.
     */
    meta: join(
      [formatPeriod(row), clean(row.location), experienceQualifier(row.type)],
      META_SEPARATOR,
    ),
    detail: detailFrom(row.description),
    url: null,
  };
}

/**
 * The arrangement, when stating it tells the reader something.
 *
 * Full-time is the assumption a reader already brings to an experience section, so
 * printing it is noise; `employment` is the same assumption in the older vocabulary.
 * Everything else — Contract, Internship, Volunteer, Apprenticeship — changes how the
 * entry should be read and is printed.
 *
 * Reads the full vocabulary rather than the section's picker options, because the picker
 * deliberately no longer offers `employment` while stored rows still hold it.
 */
function experienceQualifier(type: string) {
  if (type === "full-time" || type === "employment") return null;
  return experienceTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function educationEntry(row: DossierEducation): ComposedEntry | null {
  const institution = clean(row.institution);
  /**
   * Qualification and field are joined with a comma — arrangement, not invented
   * prose ("BSc, Economics"). When neither exists the level answers the same
   * question ("Bachelor's degree"), and when nothing does, the institution
   * becomes the title and is then not repeated as the subtitle.
   */
  const qualification = join([row.qualification, row.field], ", ") ?? clean(row.level);
  const title = qualification ?? institution;
  if (!title) return null;

  return {
    title,
    subtitle: qualification ? institution : null,
    meta: join(
      [formatPeriod(row), clean(row.location), formatGrade(row.gradingSystem, row.grade)],
      META_SEPARATOR,
    ),
    detail: detailFrom(row.description),
    url: null,
  };
}

/**
 * A grade, stated so a reader in another country can interpret it.
 *
 * A bare "3.8" is ambiguous and a bare "5.5" is actively misleading, so a numeric grade
 * is always printed against its scale. A named classification carries its own meaning and
 * is printed as the user recorded it. A system we do not model is named alongside the
 * grade, because the user's own words about their own award are better than silence.
 *
 * Returns `null` when there is no grade — the scale alone states nothing.
 */
function formatGrade(gradingSystem: string | null, grade: string | null) {
  const value = clean(grade);
  if (!value) return null;

  switch (gradingSystem) {
    case "gpa-4":
      return `GPA ${value}/4.0`;
    case "gpa-5":
      return `GPA ${value}/5.0`;
    case "gpa-10":
      return `GPA ${value}/10.0`;
    case "percentage":
      return `${value}%`;
    case "classification":
    case "credit":
    case "letter":
    case "passfail":
    case null:
      return value;
    default:
      return `${gradingSystem}: ${value}`;
  }
}

function projectEntry(row: DossierProject): ComposedEntry | null {
  const title = clean(row.name);
  if (!title) return null;

  return {
    title,
    subtitle: join([row.role, row.context], ", "),
    meta: formatPeriod(row),
    detail: detailFrom(row.description),
    url: clean(row.url),
  };
}

function credentialEntry(row: DossierCredential): ComposedEntry | null {
  const title = clean(row.name);
  if (!title) return null;

  const issued = formatMonthYear(row.issueMonth, row.issueYear);
  const expires = formatMonthYear(row.expiryMonth, row.expiryYear);
  const identifier = clean(row.identifier);

  return {
    title,
    subtitle: clean(row.issuer),
    meta: join(
      [
        optionLabel("credentials", "type", row.type),
        issued && `Issued ${issued}`,
        expires && `Expires ${expires}`,
        identifier && `ID ${identifier}`,
      ],
      META_SEPARATOR,
    ),
    detail: detailFrom(row.description),
    url: clean(row.url),
  };
}

function achievementEntry(row: DossierAchievement): ComposedEntry | null {
  const title = clean(row.title);
  if (!title) return null;

  return {
    title,
    subtitle: clean(row.issuer),
    meta: join(
      [optionLabel("achievements", "type", row.type), formatMonthYear(row.month, row.year)],
      META_SEPARATOR,
    ),
    detail: detailFrom(row.description),
    url: null,
  };
}

function publicationEntry(row: DossierPublication): ComposedEntry | null {
  const title = clean(row.title);
  if (!title) return null;

  return {
    title,
    subtitle: clean(row.publisher),
    meta: formatMonthYear(row.month, row.year),
    detail: detailFrom(row.description),
    url: clean(row.url),
  };
}

function membershipEntry(row: DossierMembership): ComposedEntry | null {
  const title = clean(row.organization);
  if (!title) return null;

  return {
    title,
    subtitle: clean(row.role),
    meta: formatPeriod(row),
    detail: detailFrom(row.description),
    url: null,
  };
}

function linkEntry(row: DossierLink): ComposedEntry | null {
  const title = clean(row.label);
  const url = clean(row.url);
  if (!title || !url) return null;

  return {
    title,
    subtitle: null,
    meta: row.type === "other" ? null : optionLabel("links", "type", row.type),
    detail: null,
    url,
  };
}

/**
 * Skills kept under their own type labels, in the order the product defines
 * those types, so a technical list never lands beneath an interpersonal one by
 * accident. Groups the user has nothing in are omitted; a skill whose type is
 * unrecognised still appears, under its raw value, rather than vanishing.
 */
function skillGroups(rows: readonly DossierSkill[]) {
  const order = new Map<string, number>(
    skillTypes.map((type, index): [string, number] => [type, index]),
  );
  const buckets = new Map<string, string[]>();

  for (const row of rows) {
    const item = withQualifier(row.name, [row.notes]);
    if (!item) continue;
    const bucket = buckets.get(row.type);
    if (bucket) bucket.push(item);
    else buckets.set(row.type, [item]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (order.get(a) ?? order.size) - (order.get(b) ?? order.size))
    .map(([type, items]) => ({ label: optionLabel("skills", "type", type), items }));
}

function languageItem(row: DossierLanguage) {
  return withQualifier(row.language, [row.proficiency, row.notes]);
}

/* Formatting --------------------------------------------------------------- */

/**
 * A period as a document would state it. Returns `null` when the user gave no
 * dates, so the caller omits the line rather than printing an empty range.
 *
 * An entry marked current with no start date yields `null`: "Present" on its own
 * reads as a broken date rather than as information, and inventing a start would
 * break the no-fabrication rule.
 */
export function formatPeriod(period: DossierPeriod): string | null {
  const start = formatMonthYear(period.startMonth, period.startYear);
  const end = formatMonthYear(period.endMonth, period.endYear);

  if (period.current) return start ? `${start} – Present` : null;
  if (start && end) return start === end ? start : `${start} – ${end}`;
  return start ?? end;
}

/**
 * A month/year pair as text. The year carries the statement, so a month without
 * a year is not a date this can assert and is dropped; a year without a month is
 * printed alone, which is how career documents normally handle it.
 */
export function formatMonthYear(month: number | null, year: number | null): string | null {
  if (year === null || !Number.isInteger(year)) return null;
  const name = monthName(month);
  return name ? `${name} ${year}` : String(year);
}

function monthName(month: number | null) {
  if (month === null || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return monthNames[month - 1];
}

/**
 * The user's description, split into the lines they actually typed.
 *
 * If every line they wrote starts with a bullet marker, the section is drawn as a
 * bullet list and the markers are removed, because the user already said what
 * they meant by typing them. Otherwise each line becomes a paragraph. Mixed
 * content stays paragraphs rather than being guessed at, and no line is ever
 * rewritten, merged or reordered.
 */
function detailFrom(value: string | null | undefined): ComposedDetail | null {
  const lines = (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const bulleted = lines.every((line) => BULLET_MARKER.test(line));
  if (!bulleted) return { kind: "paragraphs", lines };

  const stripped = lines.map((line) => line.replace(BULLET_MARKER, "").trim()).filter(Boolean);
  return stripped.length ? { kind: "bullets", lines: stripped } : null;
}

/**
 * A short value with the user's own qualifiers in parentheses, e.g.
 * `French (professional working proficiency)`. Used where a section prints one
 * value per item and supporting detail would otherwise be dropped.
 */
function withQualifier(value: string, qualifiers: (string | null)[]) {
  const name = clean(value);
  if (!name) return null;
  const qualifier = join(qualifiers, META_SEPARATOR);
  return qualifier ? `${name} (${qualifier})` : name;
}

/**
 * The application's own label for a stored option value, read from the profile
 * field definitions so "Licence", "Interpersonal" and the rest are spelled one
 * way across the product. An unrecognised value falls back to itself: better to
 * print what the user's record actually holds than to hide it.
 */
function optionLabel(section: ProfileSectionKey, field: string, value: string) {
  const options = profileSectionMap[section].fields.find((entry) => entry.name === field)?.options;
  return options?.find((option) => option.value === value)?.label ?? value;
}

/** Trimmed text, or `null` for anything blank. Whitespace is not content. */
function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Present parts joined, or `null` if nothing survives — never an empty string. */
function join(parts: (string | null | undefined | false)[], separator: string) {
  const kept = parts
    .map((part) => (typeof part === "string" ? clean(part) : null))
    .filter(isPresent);
  return kept.length ? kept.join(separator) : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
