import {
  documentSectionSlots,
  documentSections,
  type DocumentSectionKey,
  type DocumentTypeKey,
} from "./catalogue";
import type {
  ComposedDetail,
  ComposedEntry,
  ComposedHeader,
  ComposedSection,
  DocumentSpecificationSemantics,
  SelectedEvidence,
  StructuredDocumentContent,
} from "./composition";

/** A candidate supplied by a future writer, fixture, or other content source. */
export type StructuredDocumentContentCandidate = {
  readonly header: unknown;
  readonly sections: Readonly<Record<string, unknown>>;
};

/** References supporting one candidate section. */
export type ContentProvenance = {
  readonly evidenceIds?: readonly string[];
  readonly requirementIds?: readonly string[];
};

export type StructuredDocumentContentCompilerInput = {
  readonly documentType: DocumentTypeKey;
  readonly specification: DocumentSpecificationSemantics;
  readonly selectedEvidence: readonly SelectedEvidence[];
  readonly content: unknown;
  readonly provenance?: Readonly<Record<string, ContentProvenance>>;
};

export type CompilationIssueKind =
  | "type_mismatch"
  | "invalid_specification"
  | "invalid_content"
  | "unsupported_section"
  | "unsupported_layout"
  | "missing_content"
  | "invalid_provenance";

export type CompilationIssue = {
  readonly kind: CompilationIssueKind;
  readonly path: string;
  readonly message: string;
};

export type CompilationWarning = {
  readonly path: string;
  readonly message: string;
};

export type CompiledContentProvenance = ContentProvenance & {
  readonly sectionKey: DocumentSectionKey;
};

export type StructuredDocumentContentCompilation =
  | {
      readonly ok: true;
      readonly content: StructuredDocumentContent;
      readonly provenance: readonly CompiledContentProvenance[];
      readonly warnings: readonly CompilationWarning[];
    }
  | {
      readonly ok: false;
      readonly issues: readonly CompilationIssue[];
    };

const MAX_CONTACTS = 12;
const MAX_SECTION_ITEMS = 100;
const MAX_LINES = 100;
const MAX_LINE_LENGTH = 2_000;
const MAX_GROUPS = 50;

/**
 * Normalize and validate an untrusted content candidate into the only shape Composition accepts.
 *
 * This function is deliberately pure. It does not resolve ownership, read persistence, select
 * Evidence, call a provider, persist output, or render markup.
 */
export function compileStructuredDocumentContent(
  input: StructuredDocumentContentCompilerInput,
): StructuredDocumentContentCompilation {
  const issues: CompilationIssue[] = [];
  const warnings: CompilationWarning[] = [];

  if (input.specification.documentType !== input.documentType) {
    issues.push({
      kind: "type_mismatch",
      path: "specification.documentType",
      message: "Document Specification type must match the document type being compiled.",
    });
  }
  if (typeof input.specification.purpose !== "string" || input.specification.purpose.trim().length === 0) {
    issues.push({
      kind: "invalid_specification",
      path: "specification.purpose",
      message: "Document Specification purpose must not be blank.",
    });
  }

  const evidenceIds = new Set<string>();
  for (const [index, evidence] of input.selectedEvidence.entries()) {
    if (
      !nonBlank(evidence.evidenceId) ||
      !nonBlank(evidence.sourceType) ||
      !nonBlank(evidence.sourceRecordId)
    ) {
      issues.push({
        kind: "invalid_provenance",
        path: `selectedEvidence[${index}]`,
        message: "Selected Evidence must have stable identifiers.",
      });
    } else {
      evidenceIds.add(evidence.evidenceId);
    }
  }

  if (!isCandidate(input.content)) {
    issues.push({
      kind: "invalid_content",
      path: "content",
      message: "Content must provide a header and a section map.",
    });
    return failure(issues);
  }

  const header = compileHeader(input.content.header, issues);
  const permitted = new Set(documentSectionSlots(input.documentType).map((slot) => slot.key));
  const compiledSections: Partial<Record<DocumentSectionKey, ComposedSection>> = {};
  const provenance: CompiledContentProvenance[] = [];

  for (const [key, value] of Object.entries(input.content.sections)) {
    if (!permitted.has(key as DocumentSectionKey)) {
      issues.push({
        kind: "unsupported_section",
        path: `content.sections.${key}`,
        message: `${key} is not permitted for ${input.documentType}.`,
      });
      continue;
    }

    const sectionKey = key as DocumentSectionKey;
    const expectedLayout = documentSections[sectionKey].layout;
    const section = compileSection(sectionKey, expectedLayout, value, issues);
    if (section) compiledSections[sectionKey] = section;

    const sectionProvenance = input.provenance?.[key];
    if (sectionProvenance) {
      const invalidEvidence = (sectionProvenance.evidenceIds ?? []).some((id) => !evidenceIds.has(id));
      if (invalidEvidence || (sectionProvenance.requirementIds ?? []).some((id) => !nonBlank(id))) {
        issues.push({
          kind: "invalid_provenance",
          path: `provenance.${key}`,
          message: "Content provenance must reference selected Evidence and non-blank Requirement identifiers.",
        });
      } else {
        provenance.push({ sectionKey, ...sectionProvenance });
      }
    }
  }

  for (const slot of documentSectionSlots(input.documentType)) {
    if (slot.status === "required" && !compiledSections[slot.key]) {
      issues.push({
        kind: "missing_content",
        path: `content.sections.${slot.key}`,
        message: `Required section ${slot.key} has no valid content.`,
      });
    }
  }

  if (issues.length > 0) return failure(issues);

  return {
    ok: true,
    content: { header, sections: compiledSections },
    provenance,
    warnings,
  };
}

function failure(issues: readonly CompilationIssue[]): StructuredDocumentContentCompilation {
  return { ok: false, issues };
}

function isCandidate(value: unknown): value is StructuredDocumentContentCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return isRecord(candidate.sections) && "header" in candidate;
}

function compileHeader(value: unknown, issues: CompilationIssue[]): ComposedHeader {
  if (!isRecord(value)) {
    issues.push({ kind: "invalid_content", path: "content.header", message: "Header must be an object." });
    return { name: null, headline: null, contacts: [] };
  }

  const name = boundedNullableString(value.name, "content.header.name", issues);
  const headline = boundedNullableString(value.headline, "content.header.headline", issues);
  const contactsValue = value.contacts;
  if (!Array.isArray(contactsValue) || contactsValue.length > MAX_CONTACTS) {
    issues.push({
      kind: "invalid_content",
      path: "content.header.contacts",
      message: `Contacts must be an array with at most ${MAX_CONTACTS} items.`,
    });
    return { name, headline, contacts: [] };
  }
  const contacts = contactsValue.map((item, index) =>
    boundedString(item, `content.header.contacts[${index}]`, issues),
  ).filter((item): item is string => item !== null);
  return { name, headline, contacts };
}

function compileSection(
  key: DocumentSectionKey,
  expectedLayout: (typeof documentSections)[DocumentSectionKey]["layout"],
  value: unknown,
  issues: CompilationIssue[],
): ComposedSection | null {
  if (!isRecord(value)) {
    issues.push({ kind: "invalid_content", path: `content.sections.${key}`, message: "Section must be an object." });
    return null;
  }
  if (value.key !== key) {
    issues.push({ kind: "invalid_content", path: `content.sections.${key}.key`, message: "Section key does not match its map key." });
    return null;
  }
  if (value.layout !== expectedLayout) {
    issues.push({
      kind: "unsupported_layout",
      path: `content.sections.${key}.layout`,
      message: `${key} must use the catalogue layout ${expectedLayout}.`,
    });
    return null;
  }

  const heading = boundedString(value.heading, `content.sections.${key}.heading`, issues);
  if (!heading) return null;

  switch (expectedLayout) {
    case "prose": {
      const body = compileDetail(value.body, `content.sections.${key}.body`, issues);
      return body ? { key, heading, layout: "prose", body } : null;
    }
    case "entries": {
      if (!Array.isArray(value.entries) || value.entries.length > MAX_SECTION_ITEMS) {
        issues.push({ kind: "invalid_content", path: `content.sections.${key}.entries`, message: `Entries must contain at most ${MAX_SECTION_ITEMS} items.` });
        return null;
      }
      const entries = value.entries.map((entry, index) => compileEntry(entry, `content.sections.${key}.entries[${index}]`, issues)).filter((entry): entry is ComposedEntry => entry !== null);
      return entries.length === value.entries.length ? { key, heading, layout: "entries", entries } : null;
    }
    case "inline": {
      const items = compileStringList(value.items, `content.sections.${key}.items`, issues);
      return items ? { key, heading, layout: "inline", items } : null;
    }
    case "grouped": {
      if (!Array.isArray(value.groups) || value.groups.length > MAX_GROUPS) {
        issues.push({ kind: "invalid_content", path: `content.sections.${key}.groups`, message: `Groups must contain at most ${MAX_GROUPS} items.` });
        return null;
      }
      const groups = value.groups.map((group, index) => {
        if (!isRecord(group)) {
          issues.push({ kind: "invalid_content", path: `content.sections.${key}.groups[${index}]`, message: "Group must be an object." });
          return null;
        }
        const label = boundedString(group.label, `content.sections.${key}.groups[${index}].label`, issues);
        const items = compileStringList(group.items, `content.sections.${key}.groups[${index}].items`, issues);
        return label && items ? { label, items } : null;
      }).filter((group): group is { label: string; items: string[] } => group !== null);
      return groups.length === value.groups.length ? { key, heading, layout: "grouped", groups } : null;
    }
    case "field":
      issues.push({ kind: "unsupported_layout", path: `content.sections.${key}.layout`, message: "Field sections are not yet representable by Composition." });
      return null;
  }
}

function compileDetail(value: unknown, path: string, issues: CompilationIssue[]): ComposedDetail | null {
  if (!isRecord(value) || (value.kind !== "paragraphs" && value.kind !== "bullets")) {
    issues.push({ kind: "invalid_content", path, message: "Detail must be paragraphs or bullets." });
    return null;
  }
  const lines = compileStringList(value.lines, `${path}.lines`, issues);
  return lines ? { kind: value.kind, lines } : null;
}

function compileEntry(value: unknown, path: string, issues: CompilationIssue[]): ComposedEntry | null {
  if (!isRecord(value)) {
    issues.push({ kind: "invalid_content", path, message: "Entry must be an object." });
    return null;
  }
  const title = boundedString(value.title, `${path}.title`, issues);
  const subtitle = boundedNullableString(value.subtitle, `${path}.subtitle`, issues);
  const meta = boundedNullableString(value.meta, `${path}.meta`, issues);
  const detail = value.detail === null || value.detail === undefined ? null : compileDetail(value.detail, `${path}.detail`, issues);
  const url = boundedNullableString(value.url, `${path}.url`, issues);
  return title && (value.detail === null || value.detail === undefined || detail) ? { title, subtitle, meta, detail, url } : null;
}

function compileStringList(value: unknown, path: string, issues: CompilationIssue[]): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LINES) {
    issues.push({ kind: "invalid_content", path, message: `Value must be an array with at most ${MAX_LINES} items.` });
    return null;
  }
  const items = value.map((item, index) => boundedString(item, `${path}[${index}]`, issues)).filter((item): item is string => item !== null);
  return items.length === value.length ? items : null;
}

function boundedString(value: unknown, path: string, issues: CompilationIssue[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_LINE_LENGTH) {
    issues.push({ kind: "invalid_content", path, message: `Value must be non-blank text of at most ${MAX_LINE_LENGTH} characters.` });
    return null;
  }
  return value.trim();
}

function boundedNullableString(value: unknown, path: string, issues: CompilationIssue[]): string | null {
  if (value === null || value === undefined || value === "") return null;
  return boundedString(value, path, issues);
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
