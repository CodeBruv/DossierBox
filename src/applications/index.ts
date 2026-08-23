/**
 * Application objectives — the module that knows *why* a document is being made.
 *
 * The one-way dependency matters and is worth stating: this module imports the document
 * catalogue, and the catalogue does not import this. A document type must be describable
 * without reference to any particular pursuit, or the same résumé could not serve a job
 * application and a consultancy pitch. Engineering rule 11, made structural rather than
 * merely intended.
 *
 * Nothing here touches a database, a session or React. The objective is not yet persisted:
 * these are the types and the deterministic resolution that persistence, the create flow
 * and the matching engine will all be built on, and building them first means those three
 * agree by construction rather than by review.
 */

export {
  applicationObjectiveKindDescription,
  applicationObjectiveKindLabel,
  applicationObjectiveKindList,
  applicationObjectiveKindRegistry,
  applicationObjectiveKinds,
  defaultApplicationObjectiveKind,
  defaultDocumentsFor,
  familiesFor,
  isApplicationObjectiveKind,
} from "./objective-kinds";
export type {
  ApplicationObjectiveKind,
  ApplicationObjectiveKindDefinition,
} from "./objective-kinds";

export {
  compatibilityLevel,
  describeCompatibility,
  documentCompatibilityLevels,
  gradeDocumentTypes,
  isConventionalFor,
  suggestedDocumentTypes,
} from "./compatibility";
export type { DocumentCompatibility, DocumentCompatibilityLevel } from "./compatibility";

export {
  applicationObjectiveLimits,
  applicationObjectiveSchema,
  emptyApplicationObjective,
  hasObjectiveDetail,
  normalizeApplicationObjective,
  validateApplicationObjective,
} from "./objective";
export type {
  ApplicationObjective,
  ApplicationObjectiveInput,
  ApplicationObjectiveResult,
} from "./objective";

export {
  documentSetFor,
  highestPlanRequiredBy,
  leadDocument,
  producibleMembers,
  unproducibleMembers,
} from "./document-sets";
export type { DocumentSet, DocumentSetMember, DocumentSetRole } from "./document-sets";

import { documentSetFor, type DocumentSet } from "./document-sets";
import type { ApplicationObjective } from "./objective";

/**
 * The set an objective calls for.
 *
 * Currently equivalent to resolving from the kind alone, which is stated plainly rather
 * than disguised: the other fields are recorded and not yet consulted. This function
 * exists anyway, and callers should prefer it over {@link documentSetFor}, because the
 * matching engine will refine the set using `requirements`, `requestedDocuments` and
 * `country` — and when it does, every caller already passes the whole objective instead of
 * needing to be found and changed.
 */
export function documentSetForObjective(objective: ApplicationObjective): DocumentSet {
  return documentSetFor(objective.kind);
}
