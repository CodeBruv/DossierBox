/**
 * Resolving a requested set of sections against what a document type actually permits.
 *
 * This is the enforcement half of the composable-section model. The catalogue declares
 * which sections a document type is built from; this module is what stops anything else
 * getting in. Without it, "composable" degrades into "whatever the caller passed", and the
 * first consequence would be a publications list inside a cover letter — not because
 * anyone decided that, but because the user's dossier happened to contain one.
 *
 * ## Where the hard line is, and where it is not
 *
 * The rules here are *structural* and derived entirely from the catalogue, so they are
 * provable rather than a matter of taste:
 *
 * - A section the type does not list cannot appear. A letter has a body and a salutation;
 *   it does not have an employment history, and no amount of user preference makes it
 *   have one.
 * - A `required` section cannot be hidden. It is what makes the type that type — a résumé
 *   with the experience section removed is not a shorter résumé, it is a different
 *   document, and if that is what the user wants they should be choosing a different type.
 * - Everything else is the user's call: `recommended` and `optional` sections can be
 *   hidden, and any permitted section can be reordered.
 *
 * Soft judgements about which *document type* suits which objective live in
 * `@/applications/compatibility` and are graded advice, not veto. The two are deliberately
 * different in kind.
 *
 * ## Hiding a section is not the same as a section being empty
 *
 * The catalogue's `status` field is guidance and does not gate generation: a user who has
 * not filled in their experience yet still gets their document, and the section simply
 * renders nothing. That is unchanged. What this module governs is a different act — the
 * user explicitly removing a section from a document — and there the required/optional
 * distinction does bite. Conflating the two would either paywall an incomplete profile or
 * let someone produce a résumé with no experience section at all.
 */

import { documentSectionKeys, isDocumentSectionKey, type DocumentSectionKey } from "./sections";
import { documentTypeRegistry, type DocumentTypeKey } from "./document-types";

export type SectionSelectionResult = {
  /**
   * The sections to render, in order. Honours the requested order for everything the type
   * permits, then restores any `required` section the request left out.
   */
  sections: readonly DocumentSectionKey[];
  /** Permitted sections the user chose not to show. */
  hidden: readonly DocumentSectionKey[];
  /**
   * Requested entries that were refused, in the form they arrived.
   *
   * `string`, not `DocumentSectionKey`, because the interesting rejections are the ones
   * that are not section keys at all — a stale key from an older build, a value from a
   * tampered form post. A caller that wants to warn the user needs to see what was sent.
   */
  rejected: readonly string[];
  /**
   * `required` sections that were missing from the request and put back.
   *
   * Reported rather than silently corrected: a UI that lets someone deselect a required
   * section and then quietly overrules them is worse than one that does not offer the
   * choice, and this is what tells it which controls to lock.
   */
  restored: readonly DocumentSectionKey[];
};

/** Every section a type permits, in catalogue order. Presence in the slots is the rule. */
export function permittedSections(key: DocumentTypeKey): readonly DocumentSectionKey[] {
  return documentTypeRegistry[key].sections.map((slot) => slot.key);
}

/** The sections a type will not let go of. */
export function requiredSections(key: DocumentTypeKey): readonly DocumentSectionKey[] {
  return documentTypeRegistry[key].sections
    .filter((slot) => slot.status === "required")
    .map((slot) => slot.key);
}

/** The sections a user may hide — everything permitted that is not required. */
export function hideableSections(key: DocumentTypeKey): readonly DocumentSectionKey[] {
  return documentTypeRegistry[key].sections
    .filter((slot) => slot.status !== "required")
    .map((slot) => slot.key);
}

export function sectionIsPermitted(key: DocumentTypeKey, section: string): boolean {
  return isDocumentSectionKey(section) && permittedSections(key).includes(section);
}

/**
 * Resolve a requested selection into something the renderer can be handed safely.
 *
 * Takes `readonly string[]` rather than `DocumentSectionKey[]` on purpose. The realistic
 * callers are a form post, a JSON column written by an older build, and a URL — none of
 * which can be trusted to contain valid keys, and a signature that claims otherwise would
 * just move the cast to the caller and lose the audit trail of what was refused.
 *
 * Deterministic, total, and it never throws: an empty request yields the type's required
 * sections, and a request of pure nonsense yields the same plus every item in `rejected`.
 * There is no input for which the correct behaviour is to fail, because failing here would
 * mean refusing to render someone's document over a section list.
 */
export function resolveSectionSelection(
  key: DocumentTypeKey,
  requested: readonly string[],
): SectionSelectionResult {
  const permitted = permittedSections(key);
  const permittedSet = new Set<string>(permitted);
  const required = new Set<DocumentSectionKey>(requiredSections(key));

  const chosen: DocumentSectionKey[] = [];
  const seen = new Set<string>();
  const rejected: string[] = [];

  for (const entry of requested) {
    if (!permittedSet.has(entry)) {
      /* Report each distinct bad entry once; a form that posts the same stale key twenty
       * times should not produce twenty warnings. */
      if (!rejected.includes(entry)) rejected.push(entry);
      continue;
    }
    /* A duplicate is not an error — a drag-and-drop list can produce one — but rendering
     * the section twice would be. */
    if (seen.has(entry)) continue;
    seen.add(entry);
    chosen.push(entry as DocumentSectionKey);
  }

  /* Restore omitted required sections at their catalogue position, so a document that
   * loses one to a stale selection still reads in the order the type intends rather than
   * with experience appended after the links. */
  const restored: DocumentSectionKey[] = [];
  const sections: DocumentSectionKey[] = [...chosen];
  for (const [index, section] of permitted.entries()) {
    if (!required.has(section) || seen.has(section)) continue;

    restored.push(section);
    sections.splice(insertionPoint(sections, permitted, index), 0, section);
    seen.add(section);
  }

  return {
    sections,
    hidden: permitted.filter((section) => !seen.has(section)),
    rejected,
    restored,
  };
}

/**
 * Where a restored section goes: before the first already-chosen section that follows it
 * in catalogue order, or at the end if there is none.
 *
 * Sections the user reordered are respected, so this cannot be an exact catalogue index —
 * it is the closest position that keeps the restored section on the correct side of its
 * neighbours.
 */
function insertionPoint(
  sections: readonly DocumentSectionKey[],
  permitted: readonly DocumentSectionKey[],
  catalogueIndex: number,
): number {
  for (const [position, section] of sections.entries()) {
    if (permitted.indexOf(section) > catalogueIndex) return position;
  }
  return sections.length;
}

/**
 * The default selection for a type: everything it permits.
 *
 * Not "everything required" — a new document should show the user what the type is capable
 * of and let them subtract, because a section that renders nothing when empty costs them
 * nothing and a section they never knew was available costs them the document they wanted.
 * This is also exactly what composition does today, so adopting it changes no output.
 */
export function defaultSectionSelection(key: DocumentTypeKey): readonly DocumentSectionKey[] {
  return permittedSections(key);
}

/**
 * Every section key, for a caller that needs the vocabulary rather than one type's slice —
 * a migration checking stored selections, or a test.
 */
export const allSectionKeys: readonly DocumentSectionKey[] = documentSectionKeys;
