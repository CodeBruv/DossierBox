"use server";

import { redirect } from "next/navigation";
import { isDocumentTypeKey } from "@/documents/catalogue";
import { freeEntitlement } from "@/entitlements/entitlements";
import { requireProfileUser } from "@/profile/authorization";
import {
  getOwnedAdjustedRecommendation,
  persistRecommendationPlan,
  storedRecommendationIdentity,
  validateRecommendationSelection,
} from "./recommendation-persistence";
import { getOwnedRecommendationContext } from "./recommendation";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function selectedTypes(formData: FormData): string[] {
  return formData.getAll("documentType").filter((value): value is string => typeof value === "string");
}

export async function adjustRecommendationAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const identity = text(formData, "recommendationIdentity");
  if (!applicationId) redirect("/applications/new?error=application-required");

  const user = await requireProfileUser();
  const entitlement = freeEntitlement(new Date());
  const context = await getOwnedRecommendationContext(user.id, applicationId, entitlement.plan);
  if (!context) redirect("/applications/new?error=application-required");
  const destination = `/applications/${encodeURIComponent(applicationId)}/recommendation`;
  if (identity !== context.identity.fingerprint) redirect(`${destination}?error=stale`);

  const selection = validateRecommendationSelection(selectedTypes(formData), context);
  if (!selection) redirect(`${destination}?error=invalid-adjustment`);
  const created = await persistRecommendationPlan(user.id, context, {
    documentTypes: selection,
    resolutionSource: "user_adjusted",
  }, false);
  if (!created) redirect(`${destination}?error=save-failed`);
  redirect(`${destination}?planId=${encodeURIComponent(created.plan.id)}&status=adjusted`);
}

export async function acceptRecommendationAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const identity = text(formData, "recommendationIdentity");
  const adjustedPlanId = text(formData, "planId");
  if (!applicationId) redirect("/applications/new?error=application-required");

  const user = await requireProfileUser();
  const entitlement = freeEntitlement(new Date());
  const context = await getOwnedRecommendationContext(user.id, applicationId, entitlement.plan);
  if (!context) redirect("/applications/new?error=application-required");
  const destination = `/applications/${encodeURIComponent(applicationId)}/recommendation`;
  if (identity !== context.identity.fingerprint) redirect(`${destination}?error=stale`);

  let documentTypes = context.proposal.recommendedDocuments;
  let resolutionSource: "deterministic" | "user_adjusted" = "deterministic";
  if (adjustedPlanId) {
    const adjusted = await getOwnedAdjustedRecommendation(user.id, adjustedPlanId);
    if (!adjusted || storedRecommendationIdentity(adjusted.plan)?.fingerprint !== context.identity.fingerprint) {
      redirect(`${destination}?error=stale`);
    }
    documentTypes = adjusted.documentTypes.filter(isDocumentTypeKey);
    resolutionSource = "user_adjusted";
  }

  const validated = validateRecommendationSelection(documentTypes, context);
  if (!validated) redirect(`${destination}?error=invalid-adjustment`);
  const confirmed = await persistRecommendationPlan(user.id, context, {
    documentTypes: validated,
    resolutionSource,
  }, true);
  if (!confirmed) redirect(`${destination}?error=save-failed`);

  redirect(`/applications/${encodeURIComponent(applicationId)}/evidence?planId=${encodeURIComponent(confirmed.plan.id)}&packageId=${encodeURIComponent(confirmed.package.id)}&status=recommendation-confirmed`);
}
