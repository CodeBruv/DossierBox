/**
 * Capability names — what a user may do, said without naming a plan.
 *
 * The rule this file exists to keep: no gate anywhere in the product asks
 * `if (plan === "professional")`. It asks whether the user's entitlement includes a
 * capability. The difference matters the first time a plan is renamed, split, given away
 * during a promotion, or granted to an individual account by support — every one of those
 * changes the *plan* a capability belongs to, and none of them should require finding every
 * gate in the codebase.
 *
 * So a capability is a stable name for a thing the product can do. Which plans include it
 * is data, in `plans.ts`. Whether a particular user has it is a decision, in
 * `entitlements.ts`. This file is only the vocabulary, which is why it imports nothing.
 *
 * ## Why the labels are here and not in a pricing page
 *
 * A plan-comparison screen has to say what a plan gets you. Written in the component, that
 * text becomes a second definition of the product that drifts from the first — and the
 * spec is explicit that plans and entitlements are configuration, not markup. So the words
 * live beside the capability they describe, and the page renders them.
 *
 * ## What is deliberately not a capability
 *
 * Live preview, share links, PDF download and profile reuse. Those are the product, not
 * upsells: the spec requires that the free tier be genuinely useful rather than a crippled
 * demonstration, and that an expired subscription keeps existing documents, previews and
 * PDFs reachable. Gating them would contradict both. Their absence here is the decision.
 */

/**
 * Every capability the product can grant.
 *
 * Each one is drawn from a stated plan boundary in the product spec rather than invented to
 * fill out a pricing table. A capability with no feature behind it is a promise the product
 * has to keep later.
 */
export const capabilityKeys = [
  "document_set_generation",
  "objective_tailoring",
  "document_rewrite",
  "advanced_writing_assistance",
] as const;

export type CapabilityKey = (typeof capabilityKeys)[number];

export type CapabilityDescriptor = {
  key: CapabilityKey;
  /** How the capability is named to a user choosing a plan. */
  label: string;
  /** What the user actually gets, in their terms. No feature jargon. */
  description: string;
};

export const capabilities: Readonly<Record<CapabilityKey, CapabilityDescriptor>> = {
  /** Spec: more than one document, and intelligently paired documents from one profile. */
  document_set_generation: {
    key: "document_set_generation",
    label: "Complete application sets",
    description:
      "Produce every document an application needs together — a résumé and its cover letter, " +
      "or a CV with a motivation letter — from the same career profile.",
  },
  /** Spec: job-specific documents, destination-specific documents, advanced adaptation. */
  objective_tailoring: {
    key: "objective_tailoring",
    label: "Tailoring to a specific opportunity",
    description:
      "Adapt a document to the role, organisation, programme or country you are applying " +
      "to, using what you have recorded.",
  },
  /** Spec §16: document rewriting can be a future or premium capability. */
  document_rewrite: {
    key: "document_rewrite",
    label: "Rewriting an existing document",
    description:
      "Rebuild a document you already have as a DossierBox document, rather than only " +
      "reading your history out of it.",
  },
  /** Spec: advanced writing assistance. */
  advanced_writing_assistance: {
    key: "advanced_writing_assistance",
    label: "Advanced writing assistance",
    description:
      "Stronger phrasing across a whole document, and consistency checks between the " +
      "documents in one application.",
  },
};

export const capabilityList: readonly CapabilityDescriptor[] = capabilityKeys.map(
  (key) => capabilities[key],
);

/**
 * A `Set`, not `value in capabilities`.
 *
 * `in` walks the prototype chain, so it answers `true` for `"constructor"`. That has already
 * been a live defect in this codebase once, in the document style guard, where a posted
 * inherited property name passed validation and was stored. A capability name can reach this
 * function from an admin form or a stored grant, and a guard that accepts `"toString"` as a
 * capability is a guard that eventually grants one.
 */
const capabilityKeySet: ReadonlySet<string> = new Set(capabilityKeys);

export function isCapabilityKey(value: unknown): value is CapabilityKey {
  return typeof value === "string" && capabilityKeySet.has(value);
}
