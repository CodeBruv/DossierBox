/**
 * Application objective kinds — what the user is actually trying to do.
 *
 * This is the concept the product was missing. Before it, the only question the system
 * could ask was "which document do you want?", which asks the user to already know the
 * answer. A person applying for a Chevening scholarship does not want to pick between a
 * CV and a résumé; they want to apply for a scholarship, and what that requires is a
 * matter of convention they are paying us to know.
 *
 * ## Why this is not a document type
 *
 * An objective and a document are different kinds of thing, and merging them is the
 * mistake that would make the matching engine impossible:
 *
 * - One objective produces *several* documents. A research fellowship wants an academic
 *   CV, a research statement and a motivation letter.
 * - One document serves *several* objectives. The same academic CV serves a scholarship,
 *   a doctoral application and a fellowship.
 * - They change independently. Adding "grant" to the objectives does not add a document;
 *   adding a cover letter to the catalogue does not add an objective.
 *
 * So the objective is the *input* to matching and the document type is the *output*. This
 * module is one half of engineering rule 11 — application objectives stay separate from
 * document types — and the dependency points one way: objectives name document types,
 * document types know nothing about objectives.
 *
 * ## The kinds are a closed list, and the details are not
 *
 * The kind is a closed union because the product's behaviour branches on it: it picks the
 * document set, the vocabulary and, later, the writing register. The *particulars* of a
 * given application — the role, the institution, the country, the word limit — are open
 * text and numbers in `ApplicationObjective`, because those are the user's facts and
 * there is no list of every employer in the world.
 */

import type { DocumentFamilyKey, DocumentTypeKey } from "@/documents/catalogue";

export const applicationObjectiveKinds = [
  "employment",
  "internship",
  "scholarship",
  "university_admission",
  "fellowship",
  "research",
  "grant",
  "international_programme",
  "professional_opportunity",
  "general_profile",
] as const;

export type ApplicationObjectiveKind = (typeof applicationObjectiveKinds)[number];

export type ApplicationObjectiveKindDefinition = {
  key: ApplicationObjectiveKind;
  /** How the user would describe what they are doing, in their words not ours. */
  label: string;
  /** One line that helps someone recognise their own situation. */
  description: string;
  /**
   * The documents this objective conventionally calls for, in the order they would be
   * submitted.
   *
   * A *deterministic default*, and deliberately so: the matching engine must produce a
   * sensible answer with no model involved, because a document engine that stops working
   * when a language model is unavailable is not a document engine. Later phases refine
   * this default using what the user tells us about the specific opportunity — an
   * employer who asks for no cover letter should not be sent one — but the refinement
   * starts from here rather than from nothing.
   *
   * Some entries name types the catalogue marks `planned`. That is the point: the engine
   * can then tell a user what their application needs *and* what we can produce for them
   * today, instead of quietly pretending the list is shorter than it is.
   */
  defaultDocuments: readonly DocumentTypeKey[];
  /**
   * The document families this objective can reasonably draw from.
   *
   * Wider than `defaultDocuments` on purpose. The defaults are what we would produce
   * unasked; this is what we would not argue with. A scholarship panel that asks for a
   * résumé rather than an academic CV is asking for something perfectly normal, and a
   * product that grades that choice as wrong would be wrong itself.
   *
   * Declared as families rather than as a second list of types so that adding a document
   * type does not mean revisiting ten objective definitions to decide whether each one
   * permits it. See `./compatibility.ts` for how the two fields combine.
   */
  families: readonly DocumentFamilyKey[];
};

/**
 * The objective definitions.
 *
 * `general_profile` is not one of the nine pursuits; it is the honest answer for someone
 * who is not applying for anything in particular and wants a current CV to have on hand.
 * Without it, that user would have to misdescribe themselves as a job applicant to use
 * the product, and every downstream decision — which documents, which register, which
 * emphasis — would be made on a false premise.
 */
export const applicationObjectiveKindRegistry: Readonly<
  Record<ApplicationObjectiveKind, ApplicationObjectiveKindDefinition>
> = {
  employment: {
    key: "employment",
    label: "Applying for a job",
    description: "A specific role at a specific organisation.",
    defaultDocuments: ["professional_resume", "cover_letter"],
    families: ["career", "supporting"],
  },
  internship: {
    key: "internship",
    label: "Applying for an internship",
    description: "A student or early-career placement.",
    defaultDocuments: ["professional_resume", "cover_letter"],
    families: ["career", "academic", "supporting"],
  },
  scholarship: {
    key: "scholarship",
    label: "Applying for a scholarship",
    description: "Funding to study, usually decided by a selection panel.",
    defaultDocuments: ["academic_cv", "motivation_letter"],
    // Panels routinely accept a professional résumé, so `career` is permitted here.
    families: ["academic", "career", "supporting"],
  },
  university_admission: {
    key: "university_admission",
    label: "Applying to a university programme",
    description: "Admission to a degree or a taught programme.",
    defaultDocuments: ["academic_cv", "motivation_letter"],
    families: ["academic", "supporting"],
  },
  fellowship: {
    key: "fellowship",
    label: "Applying for a fellowship",
    description: "A funded placement or programme, often international.",
    defaultDocuments: ["academic_cv", "motivation_letter"],
    families: ["academic", "international", "supporting"],
  },
  research: {
    key: "research",
    label: "Applying for a research position",
    description: "A research post, doctoral place, or academic appointment.",
    defaultDocuments: ["academic_cv", "research_statement", "motivation_letter"],
    families: ["academic", "international", "supporting"],
  },
  grant: {
    key: "grant",
    label: "Applying for a grant",
    description: "Funding for a project or a piece of work.",
    defaultDocuments: ["academic_cv", "research_statement"],
    families: ["academic", "supporting"],
  },
  international_programme: {
    key: "international_programme",
    label: "Applying to an international programme",
    description: "An opportunity abroad, where a fuller history is expected.",
    defaultDocuments: ["academic_cv", "motivation_letter"],
    families: ["international", "academic", "career", "supporting"],
  },
  professional_opportunity: {
    key: "professional_opportunity",
    label: "Pursuing a professional opportunity",
    description: "A board seat, consultancy, speaking engagement, or similar.",
    defaultDocuments: ["professional_cv", "cover_letter"],
    families: ["career", "supporting"],
  },
  general_profile: {
    key: "general_profile",
    label: "Keeping a current CV",
    description: "Not applying for anything specific — a professional record to have ready.",
    defaultDocuments: ["professional_cv"],
    // Someone keeping a standing record may reasonably want either kind of CV.
    families: ["career", "academic"],
  },
};

export const applicationObjectiveKindList: readonly ApplicationObjectiveKindDefinition[] =
  applicationObjectiveKinds.map((key) => applicationObjectiveKindRegistry[key]);

/**
 * A `Set`, not `value in registry` — `in` walks the prototype chain and would accept
 * `"constructor"`. An objective kind arrives from a form post.
 */
const objectiveKindSet: ReadonlySet<string> = new Set(applicationObjectiveKinds);

export function isApplicationObjectiveKind(value: unknown): value is ApplicationObjectiveKind {
  return typeof value === "string" && objectiveKindSet.has(value);
}

export function applicationObjectiveKindLabel(kind: ApplicationObjectiveKind): string {
  return applicationObjectiveKindRegistry[kind].label;
}

export function applicationObjectiveKindDescription(kind: ApplicationObjectiveKind): string {
  return applicationObjectiveKindRegistry[kind].description;
}

export function defaultDocumentsFor(
  kind: ApplicationObjectiveKind,
): readonly DocumentTypeKey[] {
  return applicationObjectiveKindRegistry[kind].defaultDocuments;
}

/** The document families this objective can reasonably draw from. */
export function familiesFor(kind: ApplicationObjectiveKind): readonly DocumentFamilyKey[] {
  return applicationObjectiveKindRegistry[kind].families;
}

/** The objective a user is treated as having when they have not said. */
export const defaultApplicationObjectiveKind: ApplicationObjectiveKind = "general_profile";
