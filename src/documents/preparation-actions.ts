"use server";

import { randomUUID } from "node:crypto";
import { redirect, unstable_rethrow } from "next/navigation";
import { createEvidence } from "@/applications/evidence-repository";
import { evidenceSourceType } from "@/applications/planning-schema";
import { requireProfileUser } from "@/profile/authorization";
import { isDocumentTypeKey } from "./catalogue";
import { getOwnedDocument } from "./repository";
import { getDocumentPreparation, initializeDocumentPreparation, runApprovedDocumentGeneration } from "./preparation";
import { createDocumentSpecification, getOwnedDocumentSpecification, transitionDocumentSpecification } from "./specification-repository";

const sourceTypes = new Set<string>(evidenceSourceType.enumValues);

function value(formData: FormData, name: string) {
  const candidate = formData.get(name);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function preparationUrl(documentId: string, parameters = "") {
  return `/documents/${documentId}/prepare${parameters ? `?${parameters}` : ""}`;
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
  const source = value(formData, "source");
  const separator = source.indexOf(":");
  const sourceType = source.slice(0, separator);
  const sourceRecordId = source.slice(separator + 1);
  const user = await requireProfileUser();
  const document = await getOwnedDocument(user.id, documentId);
  if (!document?.applicationId || separator < 1 || !sourceTypes.has(sourceType) || !sourceRecordId) redirect(preparationUrl(documentId, "error=evidence-invalid"));
  try {
    const created = await createEvidence(user.id, document.applicationId, {
      sourceType: sourceType as (typeof evidenceSourceType.enumValues)[number],
      sourceRecordId,
      confirmation: "confirmed",
      provenance: { selectedFrom: "dossier" },
    });
    if (!created) redirect(preparationUrl(documentId, "error=evidence-invalid"));
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[documents] Failed to add Evidence for ${documentId}`, error);
    redirect(preparationUrl(documentId, "error=evidence-failed"));
  }
  redirect(preparationUrl(documentId, "status=evidence-added"));
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
