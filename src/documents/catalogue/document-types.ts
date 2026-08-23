/**
 * The document type registry.
 *
 * A document type is a *declaration*, not code. It states which sections it is built
 * from, in what order, how important each one is, what visual systems may present it,
 * which plan it needs and roughly how long it should run. Adding a document type is
 * therefore an entry in the record below — not a new branch in a composition function,
 * not a new template component, and never a new `switch` on document type.
 *
 * ## Why the ordered array carries four things at once
 *
 * A document type must express eligible sections, recommended sections, ordering, and
 * required/optional status. Four parallel lists would let them disagree — a key
 * recommended but not eligible, a key ordered but not listed. One ordered array of
 * `{ key, status }` cannot: presence *is* eligibility, position *is* order, and status
 * is attached to the thing it describes.
 *
 * ## What status means, and what it does not
 *
 * `required` — the document is not credible without it. A résumé with no experience is
 * not a résumé.
 * `recommended` — most readers expect it.
 * `optional` — include it when the user has something worth showing.
 *
 * Status is *guidance*. It tells the workspace what to prompt for and gives the
 * matching engine something to reason about. It does **not** gate generation: a user
 * who has not filled in their experience yet still gets their document, because
 * withholding someone's own document to punish an incomplete profile is hostile, and
 * because composition's contract is that nothing is silently dropped. Nothing in this
 * file changes what currently renders.
 *
 * ## Deliberately unwired fields
 *
 * `styleCategories`, `pageBudget` and `headingOverrides` are declared and not yet read
 * by anything. That is stated plainly rather than hidden: they are the fields the
 * extensible style catalogue, the length-control layer and academic heading conventions
 * need, and declaring them now means those phases add data instead of altering every
 * definition. `headingOverrides` is left unset on all three shipping types precisely so
 * that adding this registry changes no existing output.
 */

import { defaultPlanKey, type PlanKey } from "@/entitlements/plan-keys";
import type { DocumentSectionKey } from "./sections";
import type {
  DocumentFamilyKey,
  DocumentStructure,
  DocumentStyleCategory,
} from "./taxonomy";

export const documentSectionStatuses = ["required", "recommended", "optional"] as const;

export type DocumentSectionStatus = (typeof documentSectionStatuses)[number];

export type DocumentSectionSlot = {
  key: DocumentSectionKey;
  status: DocumentSectionStatus;
  /**
   * Word ceiling for an authored section, declared per document type because that is
   * where it actually varies: a cover letter's body and a research statement's body are
   * the same section drawn from the same place and are not remotely the same length.
   *
   * Putting this on the section definition instead — one number shared by every document
   * that uses the section — would have forced either a separate section key per document
   * type, or a length rule living outside the catalogue in a prompt string. Meaningless
   * on a slot whose source is not authored prose; `catalogue.test.ts` asserts none is set
   * there.
   */
  maxWords?: number;
};

/**
 * How long a document should run, in pages.
 *
 * `null` means the document has no meaningful page limit — an academic CV grows with a
 * career and truncating one would be a defect, not a feature. Not yet enforced; the
 * renderer does not read it. It exists because length control belongs to the document
 * type rather than to a prompt string or a CSS file, and because the alternative to a
 * declared budget is the failure mode the product forbids: shrinking type until
 * everything fits.
 */
export type DocumentPageBudget = { target: number; max: number } | null;

/**
 * Whether a type can actually be produced today.
 *
 * The registry is allowed to describe types the engine cannot yet render, because the
 * matching engine needs to distinguish "this application wants a motivation letter,
 * which we do not produce yet" from "no match found". Only `shipping` types are ever
 * offered to a user — see `availableDocumentTypeList` in `./index.ts`. A `planned` type
 * must never reach a button.
 */
export type DocumentAvailability = "shipping" | "planned";

export type DocumentTypeDefinition = {
  key: DocumentTypeKey;
  family: DocumentFamilyKey;
  structure: DocumentStructure;
  /** What the product calls this document, in the user's language. */
  label: string;
  /** One line on the create screen: who this is for and why. */
  description: string;
  /** Ordered. Presence means eligible; position means order. */
  sections: readonly DocumentSectionSlot[];
  /** Per-type heading conventions, e.g. an academic CV's "Appointments". */
  headingOverrides?: Readonly<Partial<Record<DocumentSectionKey, string>>>;
  styleCategories: readonly DocumentStyleCategory[];
  /** The lowest plan that may create this type. */
  minPlan: PlanKey;
  pageBudget: DocumentPageBudget;
  availability: DocumentAvailability;
};

/**
 * The registered type keys, in two groups.
 *
 * The split is not cosmetic: it is what lets the *type system* keep a planned document
 * out of the database. `shippingDocumentTypeKeys` matches the `documentType` database
 * enum exactly, so `ShippingDocumentTypeKey` is assignable where a stored type is
 * expected and `DocumentTypeKey` is not. A create action that has narrowed a form value
 * with `isAvailableDocumentType` can therefore hand it straight to the repository, and an
 * action that forgets to narrow will not compile.
 *
 * Planned keys are registered so that application objectives and document sets can name a
 * real document instead of a loose string, and are refused everywhere a user could act on
 * one. A planned type needs no enum value because no row can hold it; `catalogue.test.ts`
 * asserts the enum and the shipping keys agree in both directions, so the day a planned
 * type ships is the day a test demands the migration.
 */
export const shippingDocumentTypeKeys = [
  "professional_cv",
  "professional_resume",
  "academic_cv",
] as const;

export type ShippingDocumentTypeKey = (typeof shippingDocumentTypeKeys)[number];

export const plannedDocumentTypeKeys = [
  "cover_letter",
  "motivation_letter",
  "research_statement",
] as const;

export type PlannedDocumentTypeKey = (typeof plannedDocumentTypeKeys)[number];

export const documentTypeKeys = [
  ...shippingDocumentTypeKeys,
  ...plannedDocumentTypeKeys,
] as const;

export type DocumentTypeKey = (typeof documentTypeKeys)[number];

/**
 * The set form, for guards. `in` would walk the prototype chain and accept
 * `"constructor"`; these keys arrive from form posts and database columns.
 */
export const shippingDocumentTypeKeySet: ReadonlySet<string> = new Set(shippingDocumentTypeKeys);

/**
 * Section orders reproduced exactly from the composition layer they replace.
 *
 * The judgement in each order is real and was arrived at deliberately: a résumé leads
 * with what a hiring decision turns on; a general CV keeps the conventional
 * experience-then-education spine; an academic or international CV leads with education
 * and published work. Moving anything here would change documents that already exist,
 * so nothing here moves.
 *
 * The three sectioned types list every dossier-backed section exactly once. That is not a
 * rule about documents — the letter types below list six keys and none of those eleven —
 * it is a property of *those three*, which are all full-history sectioned documents that
 * differ by emphasis rather than by content. The test asserts it for those three only.
 *
 * The two-part annotation is what keeps `availability` honest: a key listed as shipping
 * cannot declare itself planned, or vice versa, because the compiler requires the literal
 * to match. Without it the tuples and the field could drift, and the drift would show up
 * as a document type that is offered but cannot be stored. Pinning `key` the same way
 * makes `documentTypeRegistry.professional_cv.key` provably `"professional_cv"`, which is
 * what lets `availableDocumentTypeList` be typed as storable keys — and turns a
 * copy-paste slip in the record below into a compile error rather than a runtime test.
 */
type RegisteredAs<K extends DocumentTypeKey, A extends DocumentAvailability> =
  DocumentTypeDefinition & { key: K; availability: A };

export const documentTypeRegistry: Readonly<
  { [K in ShippingDocumentTypeKey]: RegisteredAs<K, "shipping"> } & {
    [K in PlannedDocumentTypeKey]: RegisteredAs<K, "planned">;
  }
> = {
  professional_cv: {
    key: "professional_cv",
    family: "career",
    structure: "sectioned",
    label: "Professional CV",
    description: "A clear, general-purpose record of your experience.",
    sections: [
      { key: "summary", status: "recommended" },
      { key: "experience", status: "required" },
      { key: "education", status: "required" },
      { key: "skills", status: "recommended" },
      { key: "projects", status: "optional" },
      { key: "credentials", status: "optional" },
      { key: "achievements", status: "optional" },
      { key: "publications", status: "optional" },
      { key: "memberships", status: "optional" },
      { key: "languages", status: "optional" },
      { key: "links", status: "optional" },
    ],
    styleCategories: ["cv"],
    minPlan: defaultPlanKey,
    pageBudget: { target: 2, max: 3 },
    availability: "shipping",
  },
  professional_resume: {
    key: "professional_resume",
    family: "career",
    structure: "sectioned",
    label: "Professional résumé",
    description: "A focused, achievement-oriented document for an application.",
    sections: [
      { key: "summary", status: "recommended" },
      { key: "experience", status: "required" },
      { key: "skills", status: "required" },
      { key: "achievements", status: "recommended" },
      { key: "projects", status: "optional" },
      { key: "education", status: "required" },
      { key: "credentials", status: "optional" },
      { key: "languages", status: "optional" },
      { key: "links", status: "optional" },
      { key: "memberships", status: "optional" },
      { key: "publications", status: "optional" },
    ],
    styleCategories: ["resume"],
    minPlan: defaultPlanKey,
    pageBudget: { target: 1, max: 2 },
    availability: "shipping",
  },
  academic_cv: {
    key: "academic_cv",
    family: "academic",
    structure: "sectioned",
    label: "Academic or international CV",
    description: "A fuller document for academic, research, or cross-border contexts.",
    sections: [
      { key: "summary", status: "recommended" },
      { key: "education", status: "required" },
      { key: "publications", status: "recommended" },
      { key: "experience", status: "required" },
      { key: "credentials", status: "optional" },
      { key: "achievements", status: "optional" },
      { key: "projects", status: "optional" },
      { key: "memberships", status: "optional" },
      { key: "skills", status: "optional" },
      { key: "languages", status: "optional" },
      { key: "links", status: "optional" },
    ],
    styleCategories: ["cv"],
    minPlan: defaultPlanKey,
    // An academic CV grows with a career. A page ceiling would be a defect.
    pageBudget: null,
    availability: "shipping",
  },

  /*
   * Planned types.
   *
   * These are declarations, not features. They exist because a document set for a job
   * application is "a résumé and a cover letter", and modelling the second half of that
   * as a loose string would mean the matching engine could not tell the difference
   * between a document it cannot produce yet and one that does not exist. Registered
   * here, the engine can say honestly: *this application wants a cover letter; we can
   * produce your résumé today.*
   *
   * Nothing offers them. `availableDocumentTypeList` filters them out of every picker and
   * `isAvailableDocumentType` refuses them in the create action, so no button appears
   * that cannot do anything. They ship when the letter and statement structures are
   * composed and rendered — at which point they need database enum values, a test
   * enforces that, and the plan gates below start being enforced by the entitlement
   * layer rather than merely declared.
   */
  cover_letter: {
    key: "cover_letter",
    family: "career",
    structure: "letter",
    label: "Cover letter",
    description: "A short letter to one employer, sent alongside a résumé.",
    sections: [
      { key: "letter_date", status: "required" },
      { key: "recipient", status: "required" },
      { key: "salutation", status: "required" },
      { key: "body", status: "required", maxWords: 400 },
      { key: "closing", status: "required" },
      { key: "signature", status: "required" },
    ],
    styleCategories: ["letter"],
    minPlan: "plus",
    pageBudget: { target: 1, max: 1 },
    availability: "planned",
  },
  motivation_letter: {
    key: "motivation_letter",
    family: "academic",
    structure: "letter",
    label: "Motivation letter",
    description:
      "A letter explaining why you are applying to a programme, and why you are suited to it.",
    sections: [
      { key: "letter_date", status: "required" },
      { key: "recipient", status: "required" },
      { key: "salutation", status: "required" },
      // Longer than a cover letter by convention: selection panels expect reasoning.
      { key: "body", status: "required", maxWords: 700 },
      { key: "closing", status: "required" },
      { key: "signature", status: "required" },
    ],
    styleCategories: ["letter"],
    minPlan: "plus",
    pageBudget: { target: 1, max: 2 },
    availability: "planned",
  },
  research_statement: {
    key: "research_statement",
    // Academic, not `international`: what makes a research statement a research statement
    // is the pursuit, not the border it crosses.
    family: "academic",
    structure: "statement",
    label: "Research statement",
    description: "An account of your research background, current work, and intended direction.",
    sections: [{ key: "body", status: "required", maxWords: 1200 }],
    styleCategories: ["statement"],
    minPlan: "professional",
    pageBudget: { target: 2, max: 3 },
    availability: "planned",
  },
};
