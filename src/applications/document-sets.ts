/**
 * Document sets — the several documents one application actually needs.
 *
 * A job application is a résumé *and* a cover letter. A research fellowship is an academic
 * CV, a research statement and a motivation letter. Treating "which document?" as a single
 * choice is what makes a product that answers half the question, so the set is modelled as
 * a first-class thing rather than assembled ad hoc wherever it happens to be needed.
 *
 * ## What this module refuses to do
 *
 * **It does not grant access.** Every member carries the plan its document type requires,
 * because a set for a scholarship genuinely does include a motivation letter and hiding
 * that from a Basic user would be dishonest about what their application needs. Whether a
 * given user may *create* a member is decided server-side by the entitlement layer, from
 * their subscription — never from this function, never from a flag the browser sent.
 * `minPlan` here is a stated requirement, not a permission.
 *
 * **It does not pretend.** A member whose type the engine cannot yet produce is marked
 * `available: false` and kept in the set. That is the whole reason `planned` document types
 * are registered: the product can say *your application needs a CV and a motivation letter;
 * we can produce the CV now* instead of silently shortening the list, which would leave a
 * user believing they were finished when they were not.
 *
 * **It does not read the user's pasted requirements.** Resolution is by objective kind
 * only, and deterministically — no model involved, no text parsing. Refining a set from
 * what a specific advert asks for is the matching engine's job in a later phase, and it
 * will refine *this* result rather than replace it, so the deterministic answer stays the
 * floor when a provider is unavailable.
 */

import {
  documentTypeIsAvailable,
  documentTypeLabel,
  documentTypeMinPlan,
  documentTypeStructure,
  type DocumentStructure,
  type DocumentTypeKey,
} from "@/documents/catalogue";
import { defaultPlanKey, planRank, type PlanKey } from "@/entitlements/plan-keys";
import {
  applicationObjectiveKindRegistry,
  type ApplicationObjectiveKind,
} from "./objective-kinds";

/**
 * A document's part in a set.
 *
 * `primary` is the document that carries the user's history; `supporting` documents
 * accompany it. Derived from position rather than declared, because a set's order already
 * encodes it: the conventional first document is the substantial one.
 */
export type DocumentSetRole = "primary" | "supporting";

export type DocumentSetMember = {
  type: DocumentTypeKey;
  label: string;
  structure: DocumentStructure;
  role: DocumentSetRole;
  /** Whether the engine can produce this today. Not a statement about the user. */
  available: boolean;
  /** The plan this type requires. Not a statement about the user's plan. */
  minPlan: PlanKey;
};

export type DocumentSet = {
  objective: ApplicationObjectiveKind;
  /** Every document the application conventionally needs, in submission order. */
  members: readonly DocumentSetMember[];
  /**
   * True when the engine can produce every member.
   *
   * The honest headline for a user: a set that is not complete needs saying so, in the
   * product's voice, rather than being presented as the full answer.
   */
  complete: boolean;
};

function toMember(type: DocumentTypeKey, index: number): DocumentSetMember {
  return {
    type,
    label: documentTypeLabel(type),
    structure: documentTypeStructure(type),
    role: index === 0 ? "primary" : "supporting",
    available: documentTypeIsAvailable(type),
    minPlan: documentTypeMinPlan(type),
  };
}

/**
 * The set an objective kind calls for.
 *
 * Pure, total over the kinds, and free of any notion of who is asking. Given the same kind
 * it returns the same set on every call, which is what lets the rest of the product treat
 * it as the dependable baseline.
 */
export function documentSetFor(kind: ApplicationObjectiveKind): DocumentSet {
  const members = applicationObjectiveKindRegistry[kind].defaultDocuments.map(toMember);

  return {
    objective: kind,
    members,
    complete: members.every((member) => member.available),
  };
}

/** The members the engine can produce today — what a create screen may offer. */
export function producibleMembers(set: DocumentSet): readonly DocumentSetMember[] {
  return set.members.filter((member) => member.available);
}

/** The members it cannot yet — what the product should tell the user it does not cover. */
export function unproducibleMembers(set: DocumentSet): readonly DocumentSetMember[] {
  return set.members.filter((member) => !member.available);
}

/**
 * The one document to start with, if any can be produced.
 *
 * `primary` when it is producible, otherwise the first producible supporting document, so
 * a user is never handed nothing merely because the headline document of their set is
 * still being built. `null` only when the whole set is unproducible.
 */
export function leadDocument(set: DocumentSet): DocumentSetMember | null {
  return producibleMembers(set)[0] ?? null;
}

/**
 * The plan needed to create everything in a set.
 *
 * Reported so the product can be straight about cost before a user invests time, rather
 * than at the moment they press a button. Still not an access decision: the entitlement
 * layer compares this against a live subscription. Ranking comes from `planRank` rather
 * than a comparison written here, so plan ordering keeps exactly one definition.
 */
export function highestPlanRequiredBy(set: DocumentSet): PlanKey {
  return set.members.reduce<PlanKey>(
    (highest, member) => (planRank(member.minPlan) > planRank(highest) ? member.minPlan : highest),
    defaultPlanKey,
  );
}
