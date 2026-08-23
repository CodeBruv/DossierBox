/**
 * Compatibility between an application objective and a document type.
 *
 * The question this answers is "does this document make sense for what the user is doing?",
 * and the answer is deliberately *graded* rather than binary.
 *
 * ## Why nothing here is forbidden
 *
 * There is no `forbidden` level, and its absence is a product decision rather than an
 * omission. A person who wants a professional résumé for a doctoral application may know
 * something we do not: that this particular department asked for one, that the panel is
 * industry-facing, that last year's successful applicants all sent one. A product that
 * refuses is not being careful, it is being wrong in public — and it would be wrong in a
 * way the user cannot work around.
 *
 * So the grades are advice:
 *
 * - `recommended` — what this objective conventionally calls for. Offer it first.
 * - `permitted` — a normal choice for this objective. Offer it without comment.
 * - `unconventional` — allowed, but not what this objective usually calls for. Offer it
 *   with a note, never a block.
 *
 * The word is `unconventional` rather than `discouraged` because the difference is
 * convention, not correctness, and the label leaks into the interface.
 *
 * Hard rules do exist, but one level down: which *sections* a document may contain is
 * structural, provable from the catalogue, and enforced in
 * `@/documents/catalogue/section-selection`. A cover letter containing a publications list
 * is a malformed document; a résumé sent to a research panel is merely unusual. Collapsing
 * those two into one mechanism would mean either enforcing taste or permitting nonsense.
 *
 * ## Availability is a separate question again
 *
 * Compatibility says whether a document *suits* an objective. It says nothing about whether
 * the engine can produce it, and nothing about whether the user's plan allows it. Those are
 * `documentTypeIsAvailable` and the entitlement layer respectively. Three questions, three
 * answers, so that a UI can say "your application wants a motivation letter, we cannot
 * produce those yet" instead of collapsing all three into a missing button.
 */

import {
  documentTypeIsAvailable,
  documentTypeMinPlan,
  documentTypeRegistry,
  type DocumentTypeKey,
} from "@/documents/catalogue";
import type { PlanKey } from "@/entitlements/plan-keys";
import {
  applicationObjectiveKindRegistry,
  type ApplicationObjectiveKind,
} from "./objective-kinds";

export const documentCompatibilityLevels = ["recommended", "permitted", "unconventional"] as const;

export type DocumentCompatibilityLevel = (typeof documentCompatibilityLevels)[number];

export type DocumentCompatibility = {
  type: DocumentTypeKey;
  level: DocumentCompatibilityLevel;
  /** Whether the engine can produce it today. Not a permission, and not a judgement. */
  available: boolean;
  /** The plan the catalogue says this type needs. A stated requirement, not a grant. */
  minPlan: PlanKey;
};

/**
 * How well one document type suits one objective kind.
 *
 * Derived from two declared fields rather than from a table of ninety judgements: the
 * kind's `defaultDocuments` give `recommended`, its `families` give `permitted`, and
 * anything else is `unconventional`. That is why adding a document type does not mean
 * revisiting every objective — it inherits a sensible grade from its family on the day it
 * is registered.
 */
export function compatibilityLevel(
  kind: ApplicationObjectiveKind,
  type: DocumentTypeKey,
): DocumentCompatibilityLevel {
  const objective = applicationObjectiveKindRegistry[kind];

  if (objective.defaultDocuments.includes(type)) return "recommended";
  if (objective.families.includes(documentTypeRegistry[type].family)) return "permitted";
  return "unconventional";
}

export function describeCompatibility(
  kind: ApplicationObjectiveKind,
  type: DocumentTypeKey,
): DocumentCompatibility {
  return {
    type,
    level: compatibilityLevel(kind, type),
    available: documentTypeIsAvailable(type),
    minPlan: documentTypeMinPlan(type),
  };
}

const levelOrder: Readonly<Record<DocumentCompatibilityLevel, number>> = {
  recommended: 0,
  permitted: 1,
  unconventional: 2,
};

/**
 * Every document type graded against an objective, best fit first.
 *
 * Includes types the engine cannot yet produce, flagged rather than filtered. A caller
 * building a picker filters on `available`; a caller explaining what an application needs
 * does not, and would be misled by a list that had quietly dropped half the answer.
 *
 * Within a level, catalogue order is preserved — the recommended documents come out in the
 * order they would be submitted, which is the order `defaultDocuments` declares.
 */
export function gradeDocumentTypes(
  kind: ApplicationObjectiveKind,
): readonly DocumentCompatibility[] {
  const objective = applicationObjectiveKindRegistry[kind];
  const graded = Object.values(documentTypeRegistry).map((definition) =>
    describeCompatibility(kind, definition.key),
  );

  return graded.sort((a, b) => {
    const byLevel = levelOrder[a.level] - levelOrder[b.level];
    if (byLevel !== 0) return byLevel;

    /* Recommended documents keep submission order; everything else keeps catalogue order. */
    if (a.level === "recommended") {
      return (
        objective.defaultDocuments.indexOf(a.type) - objective.defaultDocuments.indexOf(b.type)
      );
    }
    return catalogueIndex(a.type) - catalogueIndex(b.type);
  });
}

const catalogueOrder: readonly DocumentTypeKey[] = Object.values(documentTypeRegistry).map(
  (definition) => definition.key,
);

function catalogueIndex(type: DocumentTypeKey): number {
  return catalogueOrder.indexOf(type);
}

/**
 * The types worth offering for an objective: suitable *and* producible.
 *
 * What a create screen wants. `unconventional` types are excluded here — not because they
 * are refused, but because a list of every document in the catalogue is not an offer, it is
 * a shrug. A user who wants one asks for it, and `compatibilityLevel` will grade it rather
 * than reject it.
 */
export function suggestedDocumentTypes(
  kind: ApplicationObjectiveKind,
): readonly DocumentCompatibility[] {
  return gradeDocumentTypes(kind).filter(
    (entry) => entry.available && entry.level !== "unconventional",
  );
}

/**
 * Whether the product would produce this document for this objective without being argued
 * with. Convenience for a caller that does not want to compare level strings.
 */
export function isConventionalFor(
  kind: ApplicationObjectiveKind,
  type: DocumentTypeKey,
): boolean {
  return compatibilityLevel(kind, type) !== "unconventional";
}
