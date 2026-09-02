"use server";

import { randomUUID } from "node:crypto";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireProfileUser } from "@/profile/authorization";
import { listValidPackageEvidenceSelections } from "@/applications/evidence-selection-repository";
import { isDocumentTypeKey, type DocumentTypeKey } from "./catalogue";
import { getOwnedDocument } from "./repository";
import { getDocumentPreparation, initializeDocumentPreparation, runApprovedDocumentGeneration } from "./preparation";
import { createDocumentSpecification, getOwnedDocumentSpecification, getOwnedPackageMemberContext, transitionDocumentSpecification } from "./specification-repository";

function value(formData: FormData, name: string) {
  const candidate = formData.get(name);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function preparationUrl(documentId: string, parameters = "") {
  return `/documents/${documentId}/prepare${parameters ? `?${parameters}` : ""}`;
}

function specificationUrl(applicationId: string, planId: string, packageId: string, parameters = "") {
  const query = new URLSearchParams({ planId, packageId });
  if (parameters) new URLSearchParams(parameters).forEach((value, key) => query.set(key, value));
  return `/applications/${encodeURIComponent(applicationId)}/specification?${query.toString()}`;
}

export async function initializeDocumentPreparationAction(formData: FormData) {
  const documentId = value(formData, "documentId");
  const user = await requireProfileUser();
  try {
    if (!documentId || !(await initializeDocumentPreparation(user.id, documentId))) redirect("/documents?error=unknown-document");
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[documents] Failed to initialize preparation for ${documentId}`, error);
    redirect(preparationUrl(documentId, "error=setup-failed"));
  }
  redirect(preparationUrl(documentId, "status=setup"));
}

export async function addDocumentEvidenceAction(formData: FormData) {
  const documentId = value(formData, "documentId");
  const user = await requireProfileUser();
  const document = await getOwnedDocument(user.id, documentId);
  if (!document?.applicationId) redirect(preparationUrl(documentId, "error=evidence-invalid"));
  redirect(`/applications/${encodeURIComponent(document.applicationId)}/recommendation?error=stale`);
}

export async function createDocumentSpecificationAction(formData: FormData) {
  const documentId = value(formData, "documentId");
  const purpose = value(formData, "purpose");
  const instructions = value(formData, "instructions");
  const user = await requireProfileUser();
  const preparation = await getDocumentPreparation(user.id, documentId);
  if (!preparation?.member || !isDocumentTypeKey(preparation.document.type)) redirect(preparationUrl(documentId, "error=setup-required"));
  const evidenceIds = formData.getAll("evidenceId").filter((candidate): candidate is string => typeof candidate === "string");
  if (!purpose || evidenceIds.length === 0) redirect(preparationUrl(documentId, "error=specification-incomplete"));
  try {
    const specification = await createDocumentSpecification(user.id, preparation.member.id, {
      documentType: preparation.document.type,
      purpose,
      evidenceIds,
      instructions: instructions || null,
      context: "Prepared from the Application context and the Evidence selected by the user.",
    });
    if (!specification) redirect(preparationUrl(documentId, "error=specification-invalid"));
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[documents] Failed to create specification for ${documentId}`, error);
    redirect(preparationUrl(documentId, "error=specification-failed"));
  }
  redirect(preparationUrl(documentId, "status=specification-created"));
}

export async function createApplicationDocumentSpecificationAction(formData: FormData) {
  const applicationId = value(formData, "applicationId");
  const planId = value(formData, "planId");
  const packageId = value(formData, "packageId");
  const memberId = value(formData, "memberId");
  const purpose = value(formData, "purpose");
  const instructions = value(formData, "instructions");
  if (!applicationId || !planId || !packageId || !memberId || !purpose) {
    redirect(applicationId ? `/applications/${encodeURIComponent(applicationId)}/recommendation?error=stale` : "/applications/new?error=application-required");
  }
  const user = await requireProfileUser();
  try {
    const member = await getOwnedPackageMemberContext(user.id, memberId);
    if (!member || member.applicationId !== applicationId || member.plan.id !== planId || member.package.id !== packageId || !isDocumentTypeKey(member.member.documentType)) {
      redirect(specificationUrl(applicationId, planId, packageId, "error=invalid-specification"));
    }
    const selections = await listValidPackageEvidenceSelections(user.id, applicationId, packageId);
    if (!selections) redirect(specificationUrl(applicationId, planId, packageId, "error=specification-failed"));
    const requirementIds = [...new Set(selections.map((selection) => selection.requirementId))];
    const evidenceIds = [...new Set(selections.map((selection) => selection.evidenceId))];
    const specification = await createDocumentSpecification(user.id, memberId, {
      documentType: member.member.documentType as DocumentTypeKey,
      purpose,
      requirementIds,
      evidenceIds,
      instructions: instructions || null,
      context: "Prepared from the confirmed Application context and Evidence boundary.",
    });
    if (!specification) redirect(specificationUrl(applicationId, planId, packageId, "error=invalid-specification"));
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[documents] Failed to create application specification for ${memberId}`, error);
    redirect(specificationUrl(applicationId, planId, packageId, "error=specification-failed"));
  }
  redirect(specificationUrl(applicationId, planId, packageId, "status=created"));
}

export async function approveApplicationDocumentSpecificationAction(formData: FormData) {
  const applicationId = value(formData, "applicationId");
  const planId = value(formData, "planId");
  const packageId = value(formData, "packageId");
  const specificationId = value(formData, "specificationId");
  const user = await requireProfileUser();
  const specification = await getOwnedDocumentSpecification(user.id, specificationId);
  if (!applicationId || !planId || !packageId || !specification) redirect(applicationId ? `/applications/${encodeURIComponent(applicationId)}/recommendation?error=stale` : "/applications/new?error=application-required");
  const member = await getOwnedPackageMemberContext(user.id, specification.packageMemberId);
  if (!member || member.applicationId !== applicationId || member.plan.id !== planId || member.package.id !== packageId) redirect(specificationUrl(applicationId, planId, packageId, "error=approval-failed"));
  try {
    let reviewed = specification;
    if (reviewed.status === "draft") reviewed = await transitionDocumentSpecification(user.id, specificationId, "ready_for_review") ?? reviewed;
    if (reviewed.status === "ready_for_review") reviewed = await transitionDocumentSpecification(user.id, specificationId, "approved") ?? reviewed;
    if (reviewed.status !== "approved") redirect(specificationUrl(applicationId, planId, packageId, "error=approval-failed"));
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[documents] Failed to approve application specification ${specificationId}`, error);
    redirect(specificationUrl(applicationId, planId, packageId, "error=approval-failed"));
  }
  redirect(specificationUrl(applicationId, planId, packageId, "status=approved"));
}

export async function approveDocumentSpecificationAction(formData: FormData) {
  const documentId = value(formData, "documentId");
  const specificationId = value(formData, "specificationId");
  const user = await requireProfileUser();
  const specification = await getOwnedDocumentSpecification(user.id, specificationId);
  if (!specification) redirect(preparationUrl(documentId, "error=specification-invalid"));
  try {
    let reviewed = specification;
    if (reviewed.status === "draft") reviewed = await transitionDocumentSpecification(user.id, specificationId, "ready_for_review") ?? reviewed;
    if (reviewed.status === "ready_for_review") reviewed = await transitionDocumentSpecification(user.id, specificationId, "approved") ?? reviewed;
    if (reviewed.status !== "approved") redirect(preparationUrl(documentId, "error=approval-failed"));
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[documents] Failed to approve specification ${specificationId}`, error);
    redirect(preparationUrl(documentId, "error=approval-failed"));
  }
  redirect(preparationUrl(documentId, "status=approved"));
}

export async function generatePreparedDocumentAction(formData: FormData) {
  const documentId = value(formData, "documentId");
  const specificationId = value(formData, "specificationId");
  const revision = Number(value(formData, "revision"));
  const user = await requireProfileUser();
  const result = await runApprovedDocumentGeneration({ userId: user.id, specificationId, revision, idempotencyKey: randomUUID() });
  if (!result.ok) {
    const reason = result.failure.kind === "provider" ? "provider-unavailable" : result.failure.kind === "entitlement" ? "units-unavailable" : "generation-failed";
    redirect(preparationUrl(documentId, `error=${reason}`));
  }
  redirect(preparationUrl(documentId, "status=generated"));
}
