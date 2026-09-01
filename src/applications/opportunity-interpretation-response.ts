import type {
  RequirementCategory,
  RequirementPriority,
} from "./opportunity-schema";

export const interpretationSupportKinds = ["explicit", "inferred"] as const;
export type InterpretationSupport = (typeof interpretationSupportKinds)[number];

export type InterpretedContext = {
  label: string;
  value: string;
  support: InterpretationSupport;
  confidence: number;
  sourceReference: string;
};

export type InterpretedRequirement = {
  text: string;
  normalized: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  support: InterpretationSupport;
  confidence: number;
  sourceReference: string;
  constraints: readonly string[];
};

export type InterpretedRequestedDocument = {
  name: string;
  details: string | null;
  priority: RequirementPriority;
  support: InterpretationSupport;
  confidence: number;
  sourceReference: string;
  constraints: readonly string[];
};

export type InterpretedConstraint = {
  text: string;
  category: "format" | "administrative_constraint" | "other";
  support: InterpretationSupport;
  confidence: number;
  sourceReference: string;
};

export type OpportunityInterpretation = {
  context: readonly InterpretedContext[];
  requirements: readonly InterpretedRequirement[];
  requestedDocuments: readonly InterpretedRequestedDocument[];
  constraints: readonly InterpretedConstraint[];
};

export type InterpretationParse =
  | { ok: true; interpretation: OpportunityInterpretation }
  | { ok: false; problem: "malformed_json" | "invalid_shape" | "unsupported_source_reference"; detail: string };

const rootKeys = ["context", "requirements", "requestedDocuments", "constraints"] as const;
const categories: ReadonlySet<string> = new Set([
  "skill",
  "credential",
  "experience",
  "document",
  "format",
  "administrative_constraint",
  "other",
]);
const priorities: ReadonlySet<string> = new Set(["required", "recommended"]);
const supports: ReadonlySet<string> = new Set(interpretationSupportKinds);
const constraintCategories: ReadonlySet<string> = new Set([
  "format",
  "administrative_constraint",
  "other",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function text(value: unknown, maximum: number, nullable = false): string | null | undefined {
  if (nullable && value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

function confidence(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}

function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > 12) return undefined;
  const result = value.map((entry) => text(entry, 300));
  return result.every((entry): entry is string => typeof entry === "string") ? result : undefined;
}

function list<T>(value: unknown, maximum: number, parse: (entry: unknown) => T | null): readonly T[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map(parse);
  return parsed.every((entry): entry is T => entry !== null) ? parsed : null;
}

function parseCommon(
  record: Record<string, unknown>,
): { support: InterpretationSupport; confidence: number; sourceReference: string } | null {
  const support = record.support;
  const score = confidence(record.confidence);
  const sourceReference = text(record.sourceReference, 500);
  if (typeof support !== "string" || !supports.has(support) || score === undefined || !sourceReference) return null;
  return { support: support as InterpretationSupport, confidence: score, sourceReference };
}

function sourceSupports(sourceText: string, reference: string): boolean {
  const source = sourceText.toLocaleLowerCase();
  const normalized = reference.toLocaleLowerCase();
  return normalized.length >= 3 && source.includes(normalized);
}

export function parseOpportunityInterpretation(raw: string, sourceText: string): InterpretationParse {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "malformed_json", detail: "The response was not valid JSON." };
  }

  if (!isRecord(value) || !exactKeys(value, rootKeys)) {
    return { ok: false, problem: "invalid_shape", detail: "The response root did not match the contract." };
  }

  const context = list(value.context, 20, (entry): InterpretedContext | null => {
    if (!isRecord(entry) || !exactKeys(entry, ["label", "value", "support", "confidence", "sourceReference"])) return null;
    const common = parseCommon(entry);
    const label = text(entry.label, 100);
    const itemValue = text(entry.value, 500);
    return common && label && itemValue ? { label, value: itemValue, ...common } : null;
  });

  const requirements = list(value.requirements, 40, (entry): InterpretedRequirement | null => {
    if (!isRecord(entry) || !exactKeys(entry, ["text", "normalized", "category", "priority", "support", "confidence", "sourceReference", "constraints"])) return null;
    const common = parseCommon(entry);
    const itemText = text(entry.text, 1_000);
    const normalized = text(entry.normalized, 500);
    const itemConstraints = stringList(entry.constraints);
    if (!common || !itemText || !normalized || !itemConstraints || typeof entry.category !== "string" || !categories.has(entry.category) || typeof entry.priority !== "string" || !priorities.has(entry.priority)) return null;
    return { text: itemText, normalized, category: entry.category as RequirementCategory, priority: entry.priority as RequirementPriority, constraints: itemConstraints, ...common };
  });

  const requestedDocuments = list(value.requestedDocuments, 20, (entry): InterpretedRequestedDocument | null => {
    if (!isRecord(entry) || !exactKeys(entry, ["name", "details", "priority", "support", "confidence", "sourceReference", "constraints"])) return null;
    const common = parseCommon(entry);
    const name = text(entry.name, 200);
    const details = text(entry.details, 500, true);
    const itemConstraints = stringList(entry.constraints);
    if (!common || !name || details === undefined || !itemConstraints || typeof entry.priority !== "string" || !priorities.has(entry.priority)) return null;
    return { name, details, priority: entry.priority as RequirementPriority, constraints: itemConstraints, ...common };
  });

  const constraints = list(value.constraints, 30, (entry): InterpretedConstraint | null => {
    if (!isRecord(entry) || !exactKeys(entry, ["text", "category", "support", "confidence", "sourceReference"])) return null;
    const common = parseCommon(entry);
    const itemText = text(entry.text, 500);
    if (!common || !itemText || typeof entry.category !== "string" || !constraintCategories.has(entry.category)) return null;
    return { text: itemText, category: entry.category as InterpretedConstraint["category"], ...common };
  });

  if (!context || !requirements || !requestedDocuments || !constraints) {
    return { ok: false, problem: "invalid_shape", detail: "One or more response items did not match the contract." };
  }

  const references = [
    ...context.map((item) => item.sourceReference),
    ...requirements.map((item) => item.sourceReference),
    ...requestedDocuments.map((item) => item.sourceReference),
    ...constraints.map((item) => item.sourceReference),
  ];
  if (references.some((reference) => !sourceSupports(sourceText, reference))) {
    return {
      ok: false,
      problem: "unsupported_source_reference",
      detail: "One or more items could not be traced to the supplied source.",
    };
  }

  return { ok: true, interpretation: { context, requirements, requestedDocuments, constraints } };
}
