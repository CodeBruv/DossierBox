import type { ComposedDocument, ComposedEntry, ComposedSection } from "./composition";
import {
  isPresentationStyleId,
  presentationStyleSuitsType,
  presentationStyles,
  type PresentationStyleId,
} from "./presentation";
import type { DocumentTypeKey } from "./catalogue";

export const PRESENTATION_CONTRACT_VERSION = "presentation-v1" as const;
export type PresentationContractVersion = typeof PRESENTATION_CONTRACT_VERSION;

type PresentationTextBlock = { readonly kind: "text"; readonly text: string; readonly role: "name" | "headline" | "contact" | "heading" | "body" | "meta" | "label"; readonly bold?: boolean; readonly italic?: boolean };
export type PresentationBlock =
  | PresentationTextBlock
  | { readonly kind: "bullet"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly url: string };

export type PresentationModel = {
  readonly contractVersion: PresentationContractVersion;
  readonly compilerVersion: "presentation-compiler-v1";
  readonly styleId: PresentationStyleId;
  readonly documentType: DocumentTypeKey;
  readonly paper: { readonly widthPoints: number; readonly heightPoints: number };
  readonly margins: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly typography: { readonly family: "Open Sans"; readonly regularFont: "open-sans-latin-ext-400-normal.woff"; readonly boldFont: "open-sans-latin-ext-700-normal.woff"; readonly bodySize: number; readonly headingSize: number; readonly nameSize: number; readonly lineHeight: number };
  readonly colors: { readonly ink: string; readonly muted: string; readonly accent: string; readonly rule: string };
  readonly spacing: { readonly sectionBefore: number; readonly sectionAfter: number; readonly entryAfter: number; readonly paragraphAfter: number };
  readonly numbering: { readonly sections: boolean };
  readonly entryLayout: "stacked" | "split";
  readonly blocks: readonly PresentationBlock[];
};

const pointsPerMillimetre = 72 / 25.4;
const mm = (value: number) => value * pointsPerMillimetre;
const inch = (value: number) => value * 72;

export function compilePresentationModel(input: {
  document: ComposedDocument;
  presentationContractVersion: unknown;
  presentationStyleId: unknown;
}): PresentationModel {
  if (input.presentationContractVersion !== PRESENTATION_CONTRACT_VERSION) {
    throw new PresentationCompilationError("unsupported-contract");
  }
  if (!isPresentationStyleId(input.presentationStyleId)) {
    throw new PresentationCompilationError("unsupported-style");
  }
  if (!presentationStyleSuitsType(input.presentationStyleId, input.document.type)) {
    throw new PresentationCompilationError("incompatible-style");
  }

  const style = presentationStyles[input.presentationStyleId];
  const a4 = style.paper === "a4";
  const blocks: PresentationBlock[] = [];
  const addText = (text: string | null | undefined, role: PresentationTextBlock["role"], options: Pick<PresentationTextBlock, "bold" | "italic"> = {}) => {
    if (text?.trim()) blocks.push({ kind: "text", text: normalizeText(text), role, ...options });
  };

  addText(input.document.header.name, "name", { bold: true });
  addText(input.document.header.headline, "headline");
  input.document.header.contacts.forEach((contact) => addText(contact, "contact"));

  input.document.sections.forEach((section, index) => {
    addText(`${style.numberedSections ? `${index + 1}. ` : ""}${section.heading}`, "heading", { bold: true });
    appendSection(blocks, section, style.entryLayout);
  });

  return {
    contractVersion: PRESENTATION_CONTRACT_VERSION,
    compilerVersion: "presentation-compiler-v1",
    styleId: input.presentationStyleId,
    documentType: input.document.type,
    paper: a4 ? { widthPoints: mm(210), heightPoints: mm(297) } : { widthPoints: inch(8.5), heightPoints: inch(11) },
    margins: a4 && input.presentationStyleId === "classic"
      ? { top: mm(20), right: mm(20), bottom: mm(20), left: mm(20) }
      : a4
        ? { top: mm(16), right: mm(17), bottom: mm(16), left: mm(17) }
        : { top: mm(15), right: mm(15), bottom: mm(15), left: mm(15) },
    typography: {
      family: "Open Sans",
      regularFont: "open-sans-latin-ext-400-normal.woff",
      boldFont: "open-sans-latin-ext-700-normal.woff",
      bodySize: input.presentationStyleId === "classic" ? 11 : 10.5,
      headingSize: input.presentationStyleId === "compact" ? 10.5 : 11,
      nameSize: input.presentationStyleId === "compact" ? 18 : 17,
      lineHeight: input.presentationStyleId === "international" ? 1.4 : input.presentationStyleId === "compact" ? 1.32 : 1.34,
    },
    colors: input.presentationStyleId === "compact"
      ? { ink: "#0f172a", muted: "#45556c", accent: "#1f3864", rule: "#1f3864" }
      : input.presentationStyleId === "international"
        ? { ink: "#0f172a", muted: "#45556c", accent: "#0f172a", rule: "#cbd5e1" }
        : { ink: "#0f172a", muted: "#45556c", accent: "#0f172a", rule: "#0f172a" },
    spacing: input.presentationStyleId === "international"
      ? { sectionBefore: 16, sectionAfter: 6, entryAfter: 12, paragraphAfter: 7.2 }
      : input.presentationStyleId === "compact"
        ? { sectionBefore: 12, sectionAfter: 5, entryAfter: 7, paragraphAfter: 4 }
        : { sectionBefore: 13, sectionAfter: 5, entryAfter: 8, paragraphAfter: 4 },
    numbering: { sections: style.numberedSections },
    entryLayout: style.entryLayout,
    blocks,
  };
}

function appendSection(blocks: PresentationBlock[], section: ComposedSection, layout: "stacked" | "split") {
  if (section.layout === "prose") appendDetail(blocks, section.body);
  if (section.layout === "inline") section.items.forEach((item, index) => blocks.push({ kind: "text", text: normalizeText(index ? ` · ${item}` : item), role: "body" }));
  if (section.layout === "grouped") section.groups.forEach((group) => {
    blocks.push({ kind: "text", text: `${normalizeText(group.label)}: ${group.items.map(normalizeText).join(", ")}`, role: "body" });
  });
  if (section.layout === "entries") section.entries.forEach((entry) => appendEntry(blocks, entry, layout));
}

function appendDetail(blocks: PresentationBlock[], detail: { kind: "paragraphs" | "bullets"; lines: string[] }) {
  detail.lines.forEach((line) => blocks.push(detail.kind === "bullets" ? { kind: "bullet", text: normalizeText(line) } : { kind: "text", text: normalizeText(line), role: "body" }));
}

function appendEntry(blocks: PresentationBlock[], entry: ComposedEntry, layout: "stacked" | "split") {
  blocks.push({ kind: "text", text: normalizeText(entry.title), role: "body", bold: true });
  if (layout === "split" && entry.meta) blocks.push({ kind: "text", text: normalizeText(entry.meta), role: "meta" });
  if (entry.subtitle) blocks.push({ kind: "text", text: normalizeText(entry.subtitle), role: "body" });
  if (layout === "stacked" && entry.meta) blocks.push({ kind: "text", text: normalizeText(entry.meta), role: "meta", italic: true });
  if (entry.detail) appendDetail(blocks, entry.detail);
  if (entry.url && /^https?:\/\//i.test(entry.url)) blocks.push({ kind: "link", text: normalizeText(entry.url), url: entry.url });
  else if (entry.url) blocks.push({ kind: "text", text: normalizeText(entry.url), role: "meta" });
}

function normalizeText(value: string) {
  return value.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim();
}

export class PresentationCompilationError extends Error {
  constructor(readonly reason: "unsupported-contract" | "unsupported-style" | "incompatible-style" | "malformed") {
    super(`Presentation compilation rejected: ${reason}`);
    this.name = "PresentationCompilationError";
  }
}
