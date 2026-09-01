"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireProfileUser } from "@/profile/authorization";
import {
  confirmEvidenceSelections,
  rejectEvidenceCandidate,
} from "./evidence-selection-repository";

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function evidenceUrl(applicationId: string, planId: string, packageId: string, parameters = "") {
  const query = new URLSearchParams({ planId, packageId });
  if (parameters) {
    const extra = new URLSearchParams(parameters);
    extra.forEach((value, key) => query.set(key, value));
  }
  return `/applications/${encodeURIComponent(applicationId)}/evidence?${query.toString()}`;
}

export async function confirmEvidenceSelectionAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const planId = text(formData, "planId");
  const packageId = text(formData, "packageId");
  if (!applicationId || !planId || !packageId) redirect("/applications/new?error=application-required");
  const user = await requireProfileUser();
  const decisions = formData.getAll("selection").flatMap((value) => {
    if (typeof value !== "string") return [];
    const [requirementId, evidenceId, matchingResultId] = value.split(":");
    return requirementId && evidenceId ? [{ requirementId, evidenceId, matchingResultId: matchingResultId || null }] : [];
  });
  try {
    const result = await confirmEvidenceSelections(user.id, applicationId, packageId, decisions);
    if (!result) redirect(evidenceUrl(applicationId, planId, packageId, "error=invalid-selection"));
    redirect(evidenceUrl(applicationId, planId, packageId, `status=confirmed&unresolved=${result.unresolved}`));
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[evidence] Failed to confirm selections for package ${packageId}`, error);
    redirect(evidenceUrl(applicationId, planId, packageId, "error=save-failed"));
  }
}

export async function rejectEvidenceCandidateAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const planId = text(formData, "planId");
  const packageId = text(formData, "packageId");
  const [requirementId = "", evidenceId = "", matchingResultId = ""] = text(formData, "rejection").split(":");
  if (!applicationId || !planId || !packageId || !requirementId || !evidenceId) redirect("/applications/new?error=application-required");
  const user = await requireProfileUser();
  const rejected = await rejectEvidenceCandidate(user.id, applicationId, packageId, { requirementId, evidenceId, matchingResultId });
  if (!rejected) redirect(evidenceUrl(applicationId, planId, packageId, "error=invalid-selection"));
  redirect(evidenceUrl(applicationId, planId, packageId, "status=rejected"));
}
