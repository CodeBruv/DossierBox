/**
 * The document catalogue — the single place the application asks what a document is.
 *
 * Everything above this module (composition, the workspace, the create screen, the
 * matching engine, entitlement checks) reads the catalogue instead of restating
 * document knowledge. Everything below it (the dossier, the database) knows nothing
 * about it. The module has no database, network or React dependencies, so it is
 * importable from a server component, a server action, a pure function or a test
 * without ceremony.
 *
 * The accessors here are narrow on purpose. Callers ask for the one thing they need —
 * an order, a heading, a label — rather than receiving a definition and reaching into
 * it, so that adding a field to `DocumentTypeDefinition` does not ripple outward.
 */

import type { PlanKey } from "@/entitlements/plan-keys";
import type { ProfileSectionKey } from "@/profile/types";
import { documentSections, sectionHeading, type DocumentSectionKey } from "./sections";
import {
  documentTypeKeys,
  documentTypeRegistry,
  shippingDocumentTypeKeys,
  shippingDocumentTypeKeySet,
  type DocumentPageBudget,
  type DocumentSectionSlot,
  type DocumentSectionStatus,
  type DocumentTypeDefinition,
  type DocumentTypeKey,
  type ShippingDocumentTypeKey,
} from "./document-types";
import {
  documentFamilies,
  documentFamilyList,
  type DocumentFamily,
  type DocumentFamilyKey,
  type DocumentStructure,
  type DocumentStyleCategory,
} from "./taxonomy";

export {
  basicsFields,
  correspondenceSectionKeys,
  documentSectionKeys,
  documentSections,
  dossierBackedSectionKeys,
  isDocumentSectionKey,
  letterFields,
  sectionHeading,
} from "./sections";
export type {
  BasicsField,
  CorrespondenceSectionKey,
  DocumentSectionDefinition,
  DocumentSectionLayout,
  DocumentSectionSource,
  DossierBackedSectionKey,
  LetterField,
} from "./sections";
export type { DocumentSectionKey } from "./sections";

export {
  documentFamilies,
  documentFamilyKeys,
  documentFamilyList,
  documentStructures,
  documentStyleCategories,
} from "./taxonomy";
export type {
  DocumentFamily,
  DocumentFamilyKey,
  DocumentStructure,
  DocumentStyleCategory,
} from "./taxonomy";

export {
  documentSectionStatuses,
  documentTypeKeys,
  documentTypeRegistry,
  plannedDocumentTypeKeys,
  shippingDocumentTypeKeys,
} from "./document-types";export type {
  DocumentAvailability,
  DocumentPageBudget,
  DocumentSectionSlot,
  DocumentSectionStatus,
  DocumentTypeDefinition,
  DocumentTypeKey,
  PlannedDocumentTypeKey,
  ShippingDocumentTypeKey,
} from "./document-types";

export {
  allSectionKeys,
  defaultSectionSelection,
  hideableSections,
  permittedSections,
  requiredSections,
  resolveSectionSelection,
  sectionIsPermitted,
} from "./section-selection";
export type { SectionSelectionResult } from "./section-selection";

export {
  describeCatalogueProblems,
  validateCatalogue,
  validateDocumentType,
} from "./validation";
export type { CatalogueProblem } from "./validation";

/** Every registered type, in catalogue order, including ones not yet producible. */
export const documentTypeList: readonly DocumentTypeDefinition[] = documentTypeKeys.map(
  (key) => documentTypeRegistry[key],
);

/**
 * The types a user may actually be offered.
 *
 * This is the list every screen and every server action should use. A `planned` type
 * appearing in a picker would be a button that cannot do anything, which the product
 * explicitly forbids.
 *
 * Derived from `shippingDocumentTypeKeys` rather than by filtering on `availability`, so
 * that `key` is typed as a *storable* key: a create screen can render this list and post
 * a value the repository accepts, with no cast anywhere. The catalogue test asserts this
 * derivation and the `availability` field agree, which is what would otherwise drift.
 */
export const availableDocumentTypeList: readonly (DocumentTypeDefinition & {
  key: ShippingDocumentTypeKey;
})[] = shippingDocumentTypeKeys.map((key) => documentTypeRegistry[key]);

/**
 * A `Set`, not `value in documentTypeRegistry` — `in` walks the prototype chain and
 * would answer `true` for `"constructor"`. A document type arrives from a form post, so
 * the guard has to be exact.
 */
const typeKeySet: ReadonlySet<string> = new Set(documentTypeKeys);

export function isDocumentTypeKey(value: unknown): value is DocumentTypeKey {
  return typeof value === "string" && typeKeySet.has(value);
}

/**
 * True only for types the engine can produce now — the check a create action needs.
 *
 * Narrows to `ShippingDocumentTypeKey`, which is deliberately the same union as the
 * database enum. That is what makes the guard load-bearing rather than decorative: a
 * server action that has passed a value through here can hand it to the repository, and
 * one that has not will not compile. Widening this to `DocumentTypeKey` would silently
 * re-open the path for a planned type to reach an insert.
 */
export function isAvailableDocumentType(value: unknown): value is ShippingDocumentTypeKey {
  return typeof value === "string" && shippingDocumentTypeKeySet.has(value);
}

export function getDocumentType(key: DocumentTypeKey): DocumentTypeDefinition {
  return documentTypeRegistry[key];
}

export function documentTypeLabel(key: DocumentTypeKey): string {
  return documentTypeRegistry[key].label;
}

export function documentTypeDescription(key: DocumentTypeKey): string {
  return documentTypeRegistry[key].description;
}

export function documentTypeFamily(key: DocumentTypeKey): DocumentFamily {
  return documentFamilies[documentTypeRegistry[key].family];
}

export function documentTypeStructure(key: DocumentTypeKey): DocumentStructure {
  return documentTypeRegistry[key].structure;
}

/**
 * The visual style categories a type accepts.
 *
 * Read by the presentation layer, which declares the same vocabulary from the other side:
 * a style says which categories it serves, a type says which it accepts, and a user
 * chooses from the intersection. Stated here rather than in the presentation layer so the
 * catalogue keeps saying what a document *is* while the styles stay replaceable.
 */
export function documentTypeStyleCategories(
  key: DocumentTypeKey,
): readonly DocumentStyleCategory[] {
  return documentTypeRegistry[key].styleCategories;
}

/** The page budget the type aims for, or `null` where length is genuinely open. */
export function documentTypePageBudget(key: DocumentTypeKey): DocumentPageBudget {
  return documentTypeRegistry[key].pageBudget;
}

/**
 * The lowest plan that may create a type.
 *
 * Read by the entitlement layer, which is the only thing allowed to decide whether a
 * given user clears it. The catalogue states the requirement; it does not grant access.
 */
export function documentTypeMinPlan(key: DocumentTypeKey): PlanKey {
  return documentTypeRegistry[key].minPlan;
}

/** Whether the engine can produce this type today — the honest answer, not a permission. */
export function documentTypeIsAvailable(key: DocumentTypeKey): boolean {
  return documentTypeRegistry[key].availability === "shipping";
}

/** The ordered section slots — order, eligibility and status together. */
export function documentSectionSlots(key: DocumentTypeKey): readonly DocumentSectionSlot[] {
  return documentTypeRegistry[key].sections;
}

/**
 * The section keys a type shows, in order.
 *
 * The composition layer's entire need from the catalogue. Derived from the slots rather
 * than stored separately, so an order and an eligibility list cannot drift apart.
 */
export function documentSectionOrder(key: DocumentTypeKey): readonly DocumentSectionKey[] {
  return documentTypeRegistry[key].sections.map((slot) => slot.key);
}

/** The status of one section within one type, or `null` if the type never shows it. */
export function documentSectionStatus(
  key: DocumentTypeKey,
  section: DocumentSectionKey,
): DocumentSectionStatus | null {
  return documentTypeRegistry[key].sections.find((slot) => slot.key === section)?.status ?? null;
}

export function documentTypeAllowsSection(
  key: DocumentTypeKey,
  section: DocumentSectionKey,
): boolean {
  return documentSectionStatus(key, section) !== null;
}

/**
 * The word ceiling a type places on one of its authored sections, or `null` for none.
 *
 * `null` covers both "this type does not show that section" and "that section has no
 * ceiling", because a caller about to enforce a limit needs the same answer in both
 * cases: there is nothing to enforce.
 */
export function documentSectionMaxWords(
  key: DocumentTypeKey,
  section: DocumentSectionKey,
): number | null {
  return documentTypeRegistry[key].sections.find((slot) => slot.key === section)?.maxWords ?? null;
}

/**
 * The heading a given type prints for a given section, honouring its overrides.
 *
 * The composition layer calls `sectionHeading` directly with the override map it was
 * handed; this is the convenience form for callers that have a type key.
 */
export function documentSectionHeading(
  key: DocumentTypeKey,
  section: DocumentSectionKey,
): string {
  return sectionHeading(section, documentTypeRegistry[key].headingOverrides);
}

export function documentHeadingOverrides(
  key: DocumentTypeKey,
): Readonly<Partial<Record<DocumentSectionKey, string>>> | undefined {
  return documentTypeRegistry[key].headingOverrides;
}

/**
 * Available types grouped by family, families in their declared order, empty families
 * omitted.
 *
 * What a create screen wants when the catalogue outgrows a flat list of three. Empty
 * families are dropped rather than rendered as headings with nothing under them, which
 * matters now: three families of the four have no shipping type.
 */
export function availableDocumentTypesByFamily(): readonly {
  family: DocumentFamily;
  types: readonly DocumentTypeDefinition[];
}[] {
  return documentFamilyList
    .map((family) => ({
      family,
      types: availableDocumentTypeList.filter((definition) => definition.family === family.key),
    }))
    .filter((group) => group.types.length > 0);
}

/** Every family that has at least one producible type. */
export function availableDocumentFamilyKeys(): readonly DocumentFamilyKey[] {
  return availableDocumentTypesByFamily().map((group) => group.family.key);
}

/**
 * The dossier sections a document type can draw facts from.
 *
 * Used to answer "what does this document need from the profile?" without the caller
 * having to understand section sources. Sections sourced from basics, authored prose or
 * letter fields are not profile sections and are excluded.
 */
export function profileSectionsUsedBy(
  key: DocumentTypeKey,
): readonly ProfileSectionKey[] {
  const used: ProfileSectionKey[] = [];
  for (const slot of documentTypeRegistry[key].sections) {
    const source = documentSections[slot.key].source;
    if (source.kind === "profile") used.push(source.section);
  }
  return used;
}
