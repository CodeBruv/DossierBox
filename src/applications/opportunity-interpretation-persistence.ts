import "server-only";

import {
  appendProviderExecution,
  completeOpportunityInterpretationAttempt,
  countOwnedSuccessfulOpportunityInterpretations,
  createOpportunityInterpretationAttempt,
  failGenerationAttempt,
  findOwnedOpportunityInterpretationAttempt,
  getOwnedOpportunityInterpretationContext,
  reserveGenerationUnits,
  transitionGenerationAttempt,
} from "@/documents/generation-repository";
import type { OpportunityInterpretationPersistence } from "./opportunity-interpretation-orchestrator";

export function createDurableOpportunityInterpretationPersistence(): OpportunityInterpretationPersistence {
  return {
    getTarget(userId, request) {
      return getOwnedOpportunityInterpretationContext(
        userId,
        request.applicationId,
        request.opportunityId,
        request.opportunitySourceId,
      );
    },
    findAttempt: findOwnedOpportunityInterpretationAttempt,
    countSuccessful: countOwnedSuccessfulOpportunityInterpretations,
    createAttempt: createOpportunityInterpretationAttempt,
    reserve: reserveGenerationUnits,
    transition(userId, attemptId, status) {
      return transitionGenerationAttempt(userId, attemptId, status);
    },
    recordProviderExecution(input) {
      return appendProviderExecution(input.userId, {
        attemptId: input.attemptId,
        workItemId: null,
        sequence: 1,
        promptId: "opportunity-interpretation@1",
        requestFingerprint: input.requestFingerprint,
        provider: input.provider,
        model: input.model,
        status: input.status,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        failure: input.failure,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      });
    },
    fail(input) {
      return failGenerationAttempt({
        userId: input.userId,
        attemptId: input.attemptId,
        failureKind: input.failureKind,
        failureDetail: input.failureDetail,
        validation: {
          kind: input.validationKind,
          status: "failed",
          fingerprint: input.validationFingerprint,
          issues: input.failureDetail,
        },
      });
    },
    complete: completeOpportunityInterpretationAttempt,
  };
}
