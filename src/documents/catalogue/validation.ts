/**
 * Catalogue validation — the contract for adding a document type.
 *
 * The product requires that a new document type be *data*: an entry in the registry, not
 * a branch in the composition engine. That only holds if a wrong entry is caught. A
 * definition that declares `structure: "letter"` but lists a skills section, or lists no
 * sections at all, compiles perfectly and then produces an empty page for a paying user.
 *
 * ## What this checks, and deliberately what it does not
 *
 * Only the rules the **compiler cannot express**. Membership is already the type system's
 * job — `family` is a `DocumentFamilyKey`, `minPlan` is a `PlanKey`, the registry's mapped
 * type pins each `key` and `availability` to its own record slot — so re-checking those
 * here would be ceremony that passes on day one and forever after. What the compiler cannot
 * see is *emptiness*, *duplication* and *agreement between fields*: an empty
 * `styleCategories` array satisfies `readonly DocumentStyleCategory[]`, and nothing in the
 * type system connects a structure to the sections that suit it.
 *
 * It also does not check anything about presentation. Whether a style exists that can
 * render a given type is a real requirement, but the catalogue must not import the
 * presentation layer — the dependency points the other way, and reversing it would let a
 * visual decision reach back into what a document *is*. That rule is asserted from the
 * presentation side, in `presentation.test.ts`.
 *
 * ## Why a function and not an import-time assertion
 *
 * A `throw` at module scope would mean a single mistyped section key takes down every
 * server request that touches a document — including the ones that would have worked. So
 * this returns problems and the caller decides: a test fails the build with them, and a
 * future admin screen could show them. Nothing calls it on a user's request path.
 */

import {
  correspondenceSectionKeys,
  documentSectionKeys,
  documentSections,
  dossierBackedSectionKeys,
  letterFields,
  type DocumentSectionKey,
  type LetterField,
} from "./sections";
import { documentTypeKeys, documentTypeRegistry, type DocumentTypeDefinition } from "./document-types";
import {
  documentFamilies,
  documentFamilyKeys,
  type DocumentStructure,
  type DocumentStyleCategory,
} from "./taxonomy";

/**
 * One thing that is wrong with a declaration.
 *
 * `scope` and `subject` are separate from the prose so a caller can group problems by the
 * thing at fault without parsing a message, and so a message can be written for whoever is
 * adding the declaration rather than for a log.
 */
export type CatalogueProblem = {
  scope: "document_type" | "section" | "family";
  /** The key of the declaration at fault. */
  subject: string;
  message: string;
};

/**
 * Which visual style categories each structure may accept.
 *
 * The one cross-axis constraint in the taxonomy, and the reason it is stated: family,
 * structure and style category are otherwise independent by design, but a *letter* that
 * accepts a résumé style is not a design choice, it is a mistake. Sectioned documents take
 * two categories because a résumé and a CV are the same shape read at different speeds.
 */
const styleCategoriesByStructure: Readonly<
  Record<DocumentStructure, readonly DocumentStyleCategory[]>
> = {
  sectioned: ["resume", "cv"],
  letter: ["letter"],
  statement: ["statement"],
};

const sectionSource = (key: DocumentSectionKey) => documentSections[key].source;

/** Sourced from the user's recorded facts, whether a list of records or a basics field. */
const isFactualSection = (key: DocumentSectionKey) => {
  const kind = sectionSource(key).kind;

  return kind === "profile" || kind === "basics";
};

const isLetterFieldSection = (key: DocumentSectionKey) =>
  sectionSource(key).kind === "letterField";

const isAuthoredSection = (key: DocumentSectionKey) => sectionSource(key).kind === "authored";

/**
 * The section that carries each letter field, derived rather than listed.
 *
 * So the rule below reads "a letter must include all of its letter apparatus" instead of
 * naming `letter_date`, `recipient` and the rest a second time — a list that would then
 * have to be kept in step with the section vocabulary by hand.
 */
const sectionForLetterField: Readonly<Partial<Record<LetterField, DocumentSectionKey>>> =
  Object.fromEntries(
    documentSectionKeys.flatMap((key) => {
      const source = sectionSource(key);

      return source.kind === "letterField" ? [[source.field, key] as const] : [];
    }),
  );

const duplicates = <T>(values: readonly T[]): readonly T[] => {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
};

const isPositiveInteger = (value: number) => Number.isInteger(value) && value > 0;

const blank = (value: string) => value.trim().length === 0;

/**
 * Everything wrong with one document type declaration.
 *
 * Takes a definition rather than a key, so it can check a candidate that is not registered
 * yet. That is the point: someone adding a type gets told what is wrong about the entry
 * they wrote, which is what makes "adding a document type is a catalogue operation" a real
 * claim rather than an aspiration.
 */
export function validateDocumentType(
  definition: DocumentTypeDefinition,
): readonly CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const report = (message: string) =>
    problems.push({ scope: "document_type", subject: definition.key, message });

  if (blank(definition.label)) report("needs a label, which is what a user sees when choosing.");
  if (blank(definition.description)) {
    report("needs a description explaining who the document is for.");
  }

  const permittedCategories = styleCategoriesByStructure[definition.structure];
  if (definition.styleCategories.length === 0) {
    report("accepts no style category, so nothing could ever present it.");
  }
  for (const category of duplicates(definition.styleCategories)) {
    report(`repeats the style category ${category}.`);
  }
  for (const category of definition.styleCategories) {
    if (!permittedCategories.includes(category)) {
      report(
        `is a ${definition.structure} document but accepts the ${category} style category. ` +
          `A ${definition.structure} may accept: ${permittedCategories.join(", ")}.`,
      );
    }
  }

  const sectionKeys = definition.sections.map((slot) => slot.key);
  if (sectionKeys.length === 0) {
    report("lists no sections, so it would render as an empty page.");
  }
  for (const key of duplicates(sectionKeys)) {
    report(`lists the ${key} section twice, so it would render twice.`);
  }
  if (sectionKeys.length > 0 && !definition.sections.some((slot) => slot.status === "required")) {
    report(
      "marks no section as required, so it states no minimum for being the document it claims to be.",
    );
  }

  problems.push(...validateStructureAgreement(definition, sectionKeys));

  for (const slot of definition.sections) {
    if (slot.maxWords === undefined) continue;

    if (!isAuthoredSection(slot.key)) {
      report(
        `puts a word ceiling on ${slot.key}, which is drawn from the user's records. ` +
          "A document does not get to truncate someone's history by word count.",
      );
    }
    if (!isPositiveInteger(slot.maxWords)) {
      report(`declares a word ceiling of ${slot.maxWords} on ${slot.key}.`);
    }
  }

  const budget = definition.pageBudget;
  if (budget) {
    if (!isPositiveInteger(budget.target) || !isPositiveInteger(budget.max)) {
      report(`declares a page budget of ${budget.target}/${budget.max}, which is not a page count.`);
    } else if (budget.target > budget.max) {
      report(`aims for ${budget.target} pages but allows only ${budget.max}.`);
    }
  }

  const shown = new Set<DocumentSectionKey>(sectionKeys);
  for (const [key, heading] of Object.entries(definition.headingOverrides ?? {})) {
    if (!shown.has(key as DocumentSectionKey)) {
      report(`renames the ${key} section, which it does not show.`);
    }
    if (heading !== undefined && blank(heading)) {
      report(`renames the ${key} section to nothing.`);
    }
  }

  return problems;
}

/**
 * Whether the sections a type lists match the shape it claims to be.
 *
 * This is the rule that stops the catalogue drifting back into "every document is a CV with
 * different sections", which is the assumption the section vocabulary exists to break. A
 * letter is not a sectioned document with the lists removed; it has apparatus a CV has no
 * concept of, and a CV draws on records a letter never touches.
 */
function validateStructureAgreement(
  definition: DocumentTypeDefinition,
  sectionKeys: readonly DocumentSectionKey[],
): readonly CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const report = (message: string) =>
    problems.push({ scope: "document_type", subject: definition.key, message });

  const factual = sectionKeys.filter(isFactualSection);
  const letterApparatus = sectionKeys.filter(isLetterFieldSection);
  const authored = sectionKeys.filter(isAuthoredSection);

  if (definition.structure === "sectioned") {
    if (letterApparatus.length > 0) {
      report(`is sectioned but includes letter apparatus: ${letterApparatus.join(", ")}.`);
    }
    if (sectionKeys.length > 0 && factual.length === 0) {
      report("is sectioned but draws on none of the user's recorded facts.");
    }
    return problems;
  }

  /* A letter and a statement are both prose, so both need somewhere for the prose to go. */
  if (authored.length === 0) {
    report(`is a ${definition.structure} but has no authored prose to be the document.`);
  }
  if (factual.length > 0) {
    report(
      `is a ${definition.structure} but lists sections drawn from the dossier: ` +
        `${factual.join(", ")}. Prose refers to a career; it is not a list of it.`,
    );
  }

  if (definition.structure === "letter") {
    for (const field of letterFields) {
      const required = sectionForLetterField[field];
      if (required && !sectionKeys.includes(required)) {
        report(`is a letter with no ${field}.`);
      }
    }
  } else if (letterApparatus.length > 0) {
    report(`is a statement but includes letter apparatus: ${letterApparatus.join(", ")}.`);
  }

  return problems;
}

/** Everything wrong with the section vocabulary itself. */
function validateSections(): readonly CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const report = (subject: string, message: string) =>
    problems.push({ scope: "section", subject, message });

  for (const key of documentSectionKeys) {
    if (blank(documentSections[key].heading)) report(key, "needs a heading.");
  }

  /*
   * The split stated in `sections.ts` — eleven backed by the dossier, six belonging to
   * correspondence — is a claim about where content comes from, and it is what the
   * structure rules above rely on. A section in the wrong group would make those rules
   * quietly wrong rather than fail.
   */
  for (const key of dossierBackedSectionKeys) {
    if (!isFactualSection(key)) {
      report(key, "is listed as dossier-backed but is not sourced from the user's facts.");
    }
  }
  for (const key of correspondenceSectionKeys) {
    if (isFactualSection(key)) {
      report(key, "is listed as correspondence but is sourced from the user's facts.");
    }
  }

  for (const field of letterFields) {
    if (sectionForLetterField[field] === undefined) {
      report(field, "is a letter field that no section carries, so no letter could include it.");
    }
  }

  return problems;
}

/** Everything wrong with the family taxonomy. */
function validateFamilies(): readonly CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const report = (subject: string, message: string) =>
    problems.push({ scope: "family", subject, message });

  for (const key of documentFamilyKeys) {
    const family = documentFamilies[key];

    if (blank(family.label)) report(key, "needs a label.");
    if (blank(family.description)) report(key, "needs a description.");
  }

  /* Sort order decides the order of a create screen, so a tie would order by chance. */
  for (const order of duplicates(documentFamilyKeys.map((key) => documentFamilies[key].sortOrder))) {
    report(String(order), "is a sort order claimed by more than one family.");
  }

  return problems;
}

/**
 * Everything wrong with the catalogue as shipped.
 *
 * Empty means coherent. Called from `catalogue/validation.test.ts`, which fails the build
 * on any problem — so a broken declaration is caught where declarations are written rather
 * than where documents are rendered.
 */
export function validateCatalogue(): readonly CatalogueProblem[] {
  return [
    ...documentTypeKeys.flatMap((key) => validateDocumentType(documentTypeRegistry[key])),
    ...validateSections(),
    ...validateFamilies(),
  ];
}

/** A one-line summary per problem, for a test failure message or a log line. */
export function describeCatalogueProblems(problems: readonly CatalogueProblem[]): string {
  return problems.map((problem) => `${problem.subject}: ${problem.message}`).join("\n");
}
