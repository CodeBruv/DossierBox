import { createHash } from "node:crypto";
import type { WorkloadKind } from "@/entitlements/usage";

export const intelligenceOperationKinds = [
  "document_generation",
  "opportunity_interpretation",
] as const;
export type IntelligenceOperationKind = (typeof intelligenceOperationKinds)[number];

export const generationAttemptStatuses = [
  "created",
  "reserved",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type GenerationAttemptStatus = (typeof generationAttemptStatuses)[number];

export const generationWorkItemStatuses = ["pending", "running", "succeeded", "failed"] as const;
export type GenerationWorkItemStatus = (typeof generationWorkItemStatuses)[number];

export const providerExecutionStatuses = ["succeeded", "failed"] as const;
export type ProviderExecutionStatus = (typeof providerExecutionStatuses)[number];

export const validationKinds = [
  "provider",
  "response",
  "normalization",
  "integrity",
  "provenance",
  "compiler",
  "required_sections",
] as const;
export type ValidationKind = (typeof validationKinds)[number];

export const validationStatuses = ["passed", "failed", "warning"] as const;
export type ValidationStatus = (typeof validationStatuses)[number];

export const iuLedgerEntryKinds = ["reservation", "allocation", "release", "refund", "compensation"] as const;
export type IuLedgerEntryKind = (typeof iuLedgerEntryKinds)[number];

export type GenerationFingerprintInput = {
  readonly userId: string;
  readonly applicationId: string;
  readonly specificationId: string;
  readonly specificationRevision: number;
  readonly specificationFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly requestedWorkloads: readonly WorkloadKind[];
};

export function fingerprintGenerationRequest(input: GenerationFingerprintInput): string {
  return sha256(JSON.stringify({
    userId: input.userId,
    applicationId: input.applicationId,
    specificationId: input.specificationId,
    specificationRevision: input.specificationRevision,
    specificationFingerprint: input.specificationFingerprint,
    evidenceFingerprint: input.evidenceFingerprint,
    requestedWorkloads: input.requestedWorkloads,
  }));
}

export function fingerprintJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

export function canTransitionAttempt(from: GenerationAttemptStatus, to: GenerationAttemptStatus): boolean {
  if (from === to) return true;
  const transitions: Readonly<Record<GenerationAttemptStatus, readonly GenerationAttemptStatus[]>> = {
    created: ["reserved", "failed", "cancelled"],
    reserved: ["running", "failed", "cancelled"],
    running: ["succeeded", "failed", "cancelled"],
    succeeded: [],
    failed: [],
    cancelled: [],
  };
  return transitions[from].includes(to);
}

export function assertAttemptTransition(from: GenerationAttemptStatus, to: GenerationAttemptStatus): void {
  if (!canTransitionAttempt(from, to)) {
    throw new Error(`Generation Attempt cannot transition from ${from} to ${to}.`);
  }
}

export function assertAppendOnlyUpdate<T extends Record<string, unknown>>(
  original: T,
  next: T,
  immutableKeys: readonly (keyof T)[],
): void {
  for (const key of immutableKeys) {
    if (JSON.stringify(original[key]) !== JSON.stringify(next[key])) {
      throw new Error(`Append-only record field ${String(key)} cannot be changed.`);
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
