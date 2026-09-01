import { createHash } from "node:crypto";

export type RequirementFingerprintInput = {
  text: string;
  category: string;
  constraints: Record<string, unknown> | null;
  normalizedInterpretation: string | null;
  sourceId: string | null;
  sourceReference: string | null;
};

export type EvidenceFingerprintInput = {
  sourceType: string;
  sourceRecordId: string;
  searchableText: string;
  excerpt: string | null;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  return value;
}

export function stableFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex")}`;
}

export function fingerprintRequirement(input: RequirementFingerprintInput): string {
  return stableFingerprint({
    text: input.text,
    category: input.category,
    constraints: input.constraints,
    normalizedInterpretation: input.normalizedInterpretation,
    sourceId: input.sourceId,
    sourceReference: input.sourceReference,
  });
}

export function fingerprintEvidence(input: EvidenceFingerprintInput): string {
  return stableFingerprint({
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    searchableText: input.searchableText,
    excerpt: input.excerpt,
  });
}
