/**
 * The taxonomy documents are classified by.
 *
 * Three independent axes, deliberately kept apart because they answer different
 * questions and change at different rates:
 *
 * - **Family** — what kind of pursuit is this document for? Groups the catalogue for a
 *   human choosing from it, and gives the matching engine a coarse filter.
 * - **Structure** — what shape is the document? Determines which composition and
 *   renderer paths apply. A letter is not a sectioned document with different content;
 *   it is a different structure.
 * - **Style category** — which visual systems may present it? A résumé style applied
 *   to a motivation letter would be nonsense, and the catalogue should make that
 *   unrepresentable rather than merely unlikely.
 *
 * Collapsing any two of these into one field is the mistake that would force a rewrite
 * later: an academic CV and a scholarship CV share a family and a structure but want
 * different styles; a cover letter and a motivation letter share a structure and a
 * style category but not a family.
 */

export const documentFamilyKeys = [
  "career",
  "academic",
  "international",
  "supporting",
] as const;

export type DocumentFamilyKey = (typeof documentFamilyKeys)[number];

export type DocumentFamily = {
  key: DocumentFamilyKey;
  label: string;
  /** One line, in the product's voice: what someone in this situation is doing. */
  description: string;
  sortOrder: number;
};

export const documentFamilies: Readonly<Record<DocumentFamilyKey, DocumentFamily>> = {
  career: {
    key: "career",
    label: "Work and career",
    description: "Applying for a role, or presenting your professional history.",
    sortOrder: 10,
  },
  academic: {
    key: "academic",
    label: "Study and scholarship",
    description: "Applying to a programme, a scholarship, or an academic position.",
    sortOrder: 20,
  },
  international: {
    key: "international",
    label: "Fellowships and international programmes",
    description: "Applying across borders, where a fuller history is expected.",
    sortOrder: 30,
  },
  supporting: {
    key: "supporting",
    label: "Supporting documents",
    description: "Shorter pieces that accompany an application or introduce you.",
    sortOrder: 40,
  },
};

export const documentFamilyList: readonly DocumentFamily[] = documentFamilyKeys
  .map((key) => documentFamilies[key])
  .sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * The shape of a document, which decides how it is composed and rendered.
 *
 * `sectioned` — ordered sections drawn largely from the dossier. Résumés and CVs.
 *
 * `letter` — correspondence: a sender block, a date, a recipient, a salutation, body
 * prose, a closing and a signature. Cover, motivation and application letters.
 *
 * `statement` — continuous authored prose under an optional title, with no letter
 * apparatus. Statements of purpose, personal and research statements.
 *
 * Only `sectioned` is implemented today. The other two are named here because the
 * composition layer must be able to *switch* on structure — a function that assumes
 * every document is sectioned is the thing that has to be rewritten later, and
 * declaring the union now costs nothing while making the omission explicit.
 */
export const documentStructures = ["sectioned", "letter", "statement"] as const;

export type DocumentStructure = (typeof documentStructures)[number];

/**
 * Which visual systems may present a document.
 *
 * A style declares the categories it serves and a document type declares the
 * categories it accepts; the intersection is what a user may choose from. This is the
 * mechanism that lets one style be reused across compatible types — a Modern
 * Professional system can present both a résumé and a cover letter — without letting
 * it present something it was never designed for.
 */
export const documentStyleCategories = ["resume", "cv", "letter", "statement"] as const;

export type DocumentStyleCategory = (typeof documentStyleCategories)[number];
