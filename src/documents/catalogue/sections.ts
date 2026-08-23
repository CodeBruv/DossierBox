/**
 * Document sections — the vocabulary a *document* is built from.
 *
 * This file exists to break an assumption the first version of the document engine
 * made: that a document's sections are the dossier's sections. They are not, and
 * treating them as the same thing is what makes a resume-only product.
 *
 * ```
 * ProfileSectionKey     what the user recorded          "experience", "publications"
 * DocumentSectionKey    what a document can contain     "experience", "salutation"
 * ```
 *
 * A document section may be *sourced from* a profile section, but it may equally be
 * prose the user authored for this document alone, or a letter field like a date or a
 * recipient block. A motivation letter has no "skills section"; it has a salutation,
 * body paragraphs and a closing. A résumé has no salutation. Neither is an exception
 * to a universal list, because there is no universal list.
 *
 * ## Why the source is part of the section, not part of the document type
 *
 * Because it never varies. `experience` is always drawn from the dossier's experience
 * records, in every document that shows it. If the source were declared per document
 * type, twelve document types would restate the same twelve mappings and eventually
 * one of them would disagree. Declared here, a document type says only *whether* it
 * shows a section and *how important* that section is to it.
 *
 * ## What is deliberately absent
 *
 * Only the sections a registered document type actually uses are defined. There is no
 * `research_interests`, no `conferences`, no `grants` — not because the product will
 * never want them, but because a key with no document behind it and no dossier field
 * to fill it is a promise in the type system that nothing keeps. Adding one is an entry
 * in this map plus, where it needs new facts, a dossier field.
 */

import type { ProfileSectionKey } from "@/profile/types";

/**
 * Where a document section's content comes from.
 *
 * `profile` — selected records from one dossier section. The facts are the user's and
 * live in one place; a document references them, it does not copy them.
 *
 * `basics` — a single field from the user's basics rather than a list of records.
 * Separate from `profile` because there is exactly one of it and it is not selectable:
 * you do not choose which career direction to show.
 *
 * `authored` — prose written for this document. A motivation letter's body is not a
 * fact about a career the way a job title is; it is composed for one application and
 * belongs to the document, not the dossier. How long it may run is *not* declared here:
 * the same authored section runs to different lengths in a cover letter and a personal
 * statement, so the budget belongs on the document type's slot.
 *
 * `letterField` — a short structural field a letter needs and a résumé does not.
 */
export type DocumentSectionSource =
  | { kind: "profile"; section: ProfileSectionKey }
  | { kind: "basics"; field: BasicsField }
  | { kind: "authored" }
  | { kind: "letterField"; field: LetterField };

/**
 * Basics fields a document section can draw on.
 *
 * One entry, because one is what is used. The person's name and contact details reach
 * a document through `ComposedHeader`, which is not a section — every document has a
 * header, so making it orderable alongside sections would model a choice that does not
 * exist.
 */
export const basicsFields = ["careerDirection"] as const;

export type BasicsField = (typeof basicsFields)[number];

export const letterFields = ["date", "recipient", "salutation", "closing", "signature"] as const;

export type LetterField = (typeof letterFields)[number];

/**
 * How a section arranges itself on the page.
 *
 * A presentation concern in the sense that the renderer acts on it, but a
 * *composition* decision in the sense that it follows from the shape of the content:
 * skills group under labels because skills have types, languages run inline because a
 * language is two words. A template may style each of these very differently; it may
 * not turn a grouped section into prose, because that would misrepresent the data.
 */
export type DocumentSectionLayout = "prose" | "entries" | "inline" | "grouped" | "field";

export type DocumentSectionDefinition = {
  key: DocumentSectionKey;
  /**
   * What a finished document calls this section — not what the dossier workspace
   * calls it. The workspace says "Portfolio and professional links" because it is
   * teaching the user what to put there; a document says "Links" because the reader
   * does not need teaching.
   *
   * A document type may override this: an academic CV that calls employment
   * "Appointments" is a real convention. The override lives on the document type, so
   * the default here stays honest for everything else.
   */
  heading: string;
  source: DocumentSectionSource;
  layout: DocumentSectionLayout;
};

/**
 * The section vocabulary, in two groups.
 *
 * The first eleven are backed by the dossier: a document that shows them is showing the
 * user's recorded facts. The last six belong to correspondence — a date, a recipient, a
 * salutation, authored body prose, a closing, a signature. Nothing about the machinery
 * distinguishes the groups; the split is a fact about where content comes from, and the
 * grouping here is for a reader.
 *
 * `dossierBackedSectionKeys` is exported because two properties are worth asserting
 * separately: that the three sectioned career types show every *dossier* section (they
 * differ by order, not by discarding a user's record), and that a letter shows none of
 * them.
 */
export const dossierBackedSectionKeys = [
  "summary",
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

export type DossierBackedSectionKey = (typeof dossierBackedSectionKeys)[number];

export const correspondenceSectionKeys = [
  "letter_date",
  "recipient",
  "salutation",
  "body",
  "closing",
  "signature",
] as const;

export type CorrespondenceSectionKey = (typeof correspondenceSectionKeys)[number];

export const documentSectionKeys = [
  ...dossierBackedSectionKeys,
  ...correspondenceSectionKeys,
] as const;

export type DocumentSectionKey = (typeof documentSectionKeys)[number];

/**
 * The section definitions.
 *
 * `summary` is the only one not backed by a dossier *section*: it is the career
 * direction the user wrote on their basics. It is still modelled as a section so it
 * takes part in ordering like everything else instead of being hard-coded above the
 * rest. Its heading is "Career objective" rather than "Professional summary" for an
 * accuracy reason — the basics form asks what direction the user is pursuing, which
 * is an objective, not a précis of past work. Calling it a summary would misdescribe
 * their own words.
 */
export const documentSections: Readonly<
  Record<DocumentSectionKey, DocumentSectionDefinition>
> = {
  summary: {
    key: "summary",
    heading: "Career objective",
    source: { kind: "basics", field: "careerDirection" },
    layout: "prose",
  },
  experience: {
    key: "experience",
    heading: "Experience",
    source: { kind: "profile", section: "experience" },
    layout: "entries",
  },
  education: {
    key: "education",
    heading: "Education",
    source: { kind: "profile", section: "education" },
    layout: "entries",
  },
  projects: {
    key: "projects",
    heading: "Projects",
    source: { kind: "profile", section: "projects" },
    layout: "entries",
  },
  skills: {
    key: "skills",
    heading: "Skills",
    source: { kind: "profile", section: "skills" },
    layout: "grouped",
  },
  credentials: {
    key: "credentials",
    heading: "Certifications and credentials",
    source: { kind: "profile", section: "credentials" },
    layout: "entries",
  },
  achievements: {
    key: "achievements",
    heading: "Awards and achievements",
    source: { kind: "profile", section: "achievements" },
    layout: "entries",
  },
  languages: {
    key: "languages",
    heading: "Languages",
    source: { kind: "profile", section: "languages" },
    layout: "inline",
  },
  publications: {
    key: "publications",
    heading: "Publications",
    source: { kind: "profile", section: "publications" },
    layout: "entries",
  },
  memberships: {
    key: "memberships",
    heading: "Memberships",
    source: { kind: "profile", section: "memberships" },
    layout: "entries",
  },
  links: {
    key: "links",
    heading: "Links",
    source: { kind: "profile", section: "links" },
    layout: "entries",
  },

  /*
   * Correspondence sections.
   *
   * For these, `heading` labels the field where the user works on it; it is not printed.
   * A letter does not print the word "Salutation" above "Dear Dr Okonkwo", and a
   * statement does not print "Body" above its first paragraph. Sections whose heading is
   * printed are the dossier-backed ones above; that difference follows from `layout`,
   * which the renderer already switches on, rather than from a flag repeated here.
   */
  letter_date: {
    key: "letter_date",
    heading: "Date",
    source: { kind: "letterField", field: "date" },
    layout: "field",
  },
  recipient: {
    key: "recipient",
    heading: "Recipient",
    source: { kind: "letterField", field: "recipient" },
    layout: "field",
  },
  salutation: {
    key: "salutation",
    heading: "Salutation",
    source: { kind: "letterField", field: "salutation" },
    layout: "field",
  },
  /**
   * The authored prose that *is* the document, in anything that is not a list of facts.
   *
   * One key rather than `cover_letter_body` / `motivation_letter_body` /
   * `research_statement_body`, because those would be the same definition four times over
   * with a different name. What actually differs between them is how long the prose may
   * run, and that is declared by each document type on its own slot — which is why
   * `maxWords` lives there and not on `source`.
   */
  body: {
    key: "body",
    heading: "Body",
    source: { kind: "authored" },
    layout: "prose",
  },
  closing: {
    key: "closing",
    heading: "Closing",
    source: { kind: "letterField", field: "closing" },
    layout: "field",
  },
  signature: {
    key: "signature",
    heading: "Signature",
    source: { kind: "letterField", field: "signature" },
    layout: "field",
  },
};

/**
 * A `Set`, not `key in documentSections`.
 *
 * `in` walks the prototype chain, so it answers `true` for `"constructor"`,
 * `"toString"` and every other inherited name. Section keys arrive from form posts and
 * from a database column, so a guard that accepts `"constructor"` would let junk be
 * persisted as a section the user had hidden.
 */
const sectionKeySet: ReadonlySet<string> = new Set(documentSectionKeys);

export function isDocumentSectionKey(value: unknown): value is DocumentSectionKey {
  return typeof value === "string" && sectionKeySet.has(value);
}

/**
 * The heading a document prints for a section, honouring a type's override.
 *
 * Takes the override map rather than the whole document type so the composition layer
 * can call it without importing the catalogue, keeping the dependency pointing one
 * way.
 */
export function sectionHeading(
  key: DocumentSectionKey,
  overrides?: Readonly<Partial<Record<DocumentSectionKey, string>>>,
): string {
  return overrides?.[key] ?? documentSections[key].heading;
}
