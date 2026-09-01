"use server";

import { randomUUID } from "node:crypto";
import { redirect, unstable_rethrow } from "next/navigation";
import { validateApplicationObjective } from "@/applications";
import { freeEntitlement } from "@/entitlements/entitlements";
import { requireProfileUser } from "@/profile/authorization";
import { createDurableOpportunityInterpretationPersistence } from "./opportunity-interpretation-persistence";
import { orchestrateOpportunityInterpretation } from "./opportunity-interpretation-orchestrator";
import { opportunityCaptureLimits, saveApplicationOpportunityCapture } from "./opportunity-repository";
import { createApplication } from "./repository";

/**
 * Persists the Application and normalized Intent before recommendation is reached.
 * Every posted value is untrusted and passes through the existing objective schema.
 */
export async function createApplicationAction(formData: FormData) {
  const input = {
    kind: text(formData.get("kind")),
    targetRole: optionalText(formData.get("targetRole")),
    organisation: optionalText(formData.get("organisation")),
    institution: optionalText(formData.get("institution")),
    programme: optionalText(formData.get("programme")),
    field: optionalText(formData.get("field")),
    deadline: optionalText(formData.get("deadline")),
    requirements: null,
    instructions: null,
    wordLimit: null,
    pageLimit: null,
    requestedDocuments: [],
  };
  const result = validateApplicationObjective(input);

  if (!result.success || !hasMeaningfulContext(result.data)) {
    const kind = typeof input.kind === "string" ? `&kind=${encodeURIComponent(input.kind)}` : "";
    redirect(`/applications/new?error=context-required${kind}`);
  }

  const user = await requireProfileUser();
  try {
    const application = await createApplication(user.id, { objective: result.data });
    redirect(`/applications/${application.id}/opportunity`);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[applications] Failed to create Application", error);
    redirect("/applications/new?error=create-failed");
  }
}

/** Saves supplied source text only. Interpretation and IU activity are outside this action. */
export async function saveOpportunityCaptureAction(formData: FormData) {
  const applicationId = text(formData.get("applicationId")).trim();
  const opportunityText = text(formData.get("opportunityText")).trim();
  if (!applicationId) redirect("/applications/new?error=application-required");
  if (!opportunityText || opportunityText.length > opportunityCaptureLimits.pastedText) {
    redirect(`/applications/${encodeURIComponent(applicationId)}/opportunity?error=source-invalid`);
  }

  const user = await requireProfileUser();
  try {
    const capture = await saveApplicationOpportunityCapture(user.id, applicationId, opportunityText);
    if (!capture) redirect("/applications/new?error=application-required");
    redirect(`/applications/${encodeURIComponent(applicationId)}/recommendation`);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[applications] Failed to save Opportunity source", error);
    redirect(`/applications/${encodeURIComponent(applicationId)}/opportunity?error=save-failed`);
  }
}

/**
 * Runs the owner-scoped review boundary. Subscription persistence and a production provider do
 * not exist yet, so production deliberately resolves Free and uses the unavailable provider.
 */
export async function interpretOpportunityAction(formData: FormData) {
  const applicationId = text(formData.get("applicationId")).trim();
  const opportunityId = text(formData.get("opportunityId")).trim();
  const opportunitySourceId = text(formData.get("opportunitySourceId")).trim();
  if (!applicationId || !opportunityId || !opportunitySourceId) {
    redirect("/applications/new?error=application-required");
  }

  const user = await requireProfileUser();
  const result = await orchestrateOpportunityInterpretation({
    applicationId,
    opportunityId,
    opportunitySourceId,
    idempotencyKey: randomUUID(),
  }, {
    authenticate: async () => user.id,
    getEntitlement: async (_userId, now) => freeEntitlement(now),
    persistence: createDurableOpportunityInterpretationPersistence(),
  });

  const destination = `/applications/${encodeURIComponent(applicationId)}/opportunity`;
  if (result.ok) redirect(`${destination}?review=${result.code}`);
  redirect(`${destination}?review=${result.code}`);
}

function hasMeaningfulContext(objective: ReturnType<typeof validateApplicationObjective>["data"]): boolean {
  if (!objective) return false;
  switch (objective.kind) {
    case "employment":
    case "internship":
    case "professional_opportunity":
      return objective.targetRole !== null || objective.organisation !== null;
    case "scholarship":
    case "university_admission":
    case "fellowship":
    case "international_programme":
      return objective.programme !== null || objective.institution !== null || objective.organisation !== null;
    case "research":
      return objective.targetRole !== null || objective.programme !== null || objective.institution !== null;
    case "grant":
      return objective.programme !== null || objective.organisation !== null || objective.field !== null;
    case "general_profile":
      return true;
  }
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const valueText = text(value).trim();
  return valueText.length > 0 ? valueText : null;
}
