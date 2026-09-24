import type { ComposedDocument, ComposedEntry, ComposedSection } from "./composition";
import { isPageBreakId } from "./arrangement";
import { paginatePresentation, type PaginatedPresentationPage } from "./presentation-pagination";
import {
  isPresentationStyleId,
  presentationStyleSuitsType,
  resolveDocumentTypography,
  type DocumentTypography,
  presentationStyles,
  type PresentationStyleId,
} from "./presentation";
import type { DocumentTypeKey } from "./catalogue";

export const PRESENTATION_CONTRACT_VERSION = "presentation-v1" as const;
export type PresentationContractVersion = typeof PRESENTATION_CONTRACT_VERSION;

type PresentationTextBlock = { readonly kind: "text"; readonly text: string; readonly role: "name" | "headline" | "contact" | "heading" | "body" | "meta" | "label"; readonly bold?: boolean; readonly italic?: boolean; readonly sectionFontSize?: number };
export type PresentationBlock =
  | PresentationTextBlock
  | { readonly kind: "bullet"; readonly text: string; readonly sectionFontSize?: number }
  | { readonly kind: "link"; readonly text: string; readonly url: string; readonly sectionFontSize?: number }
  | { readonly kind: "page-break" };

export type PresentationModel = {
  readonly contractVersion: PresentationContractVersion;
  readonly compilerVersion: "presentation-compiler-v1";
  readonly styleId: PresentationStyleId;
  readonly documentType: DocumentTypeKey;
  readonly paper: { readonly widthPoints: number; readonly heightPoints: number };
  readonly margins: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly typography: { readonly family: DocumentTypography["family"]; readonly regularFont: string; readonly boldFont: string; readonly bodySize: number; readonly headingSize: number; readonly nameSize: number; readonly lineHeight: number };
  readonly colors: { readonly ink: string; readonly muted: string; readonly accent: string; readonly rule: string };
  readonly spacing: { readonly sectionBefore: number; readonly sectionAfter: number; readonly entryAfter: number; readonly paragraphAfter: number };
  readonly numbering: { readonly sections: boolean };
  readonly entryLayout: "stacked" | "split";
  readonly blocks: readonly PresentationBlock[];
};

export type PhysicalPresentation = {
  readonly model: PresentationModel;
  readonly pages: readonly PaginatedPresentationPage[];
};

const pointsPerMillimetre = 72 / 25.4;
const mm = (value: number) => value * pointsPerMillimetre;
const inch = (value: number) => value * 72;

export function compilePresentationModel(input: {
  document: ComposedDocument;
  presentationContractVersion: unknown;
  presentationStyleId: unknown;
  typography?: unknown;
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
  const addText = (text: string | null | undefined, role: PresentationTextBlock["role"], options: Pick<PresentationTextBlock, "bold" | "italic" | "sectionFontSize"> = {}) => {
    if (text?.trim()) blocks.push({ kind: "text", text: normalizeText(text), role, ...options });
  };

  addText(input.document.header.name, "name", { bold: true });
  addText(input.document.header.headline, "headline");
  // Contact values are one semantic line in a CV masthead. Keeping them as one block
  // prevents renderer-level paragraph spacing from manufacturing vertical gaps.
  addText(input.document.header.contacts.map(normalizeText).filter(Boolean).join(" · "), "contact");

  const sections = new Map(input.document.sections.map((section) => [section.key, section]));
  let contentCount = 0;
  let pendingBreak = false;
  for (const key of input.document.arrangement ?? input.document.sections.map((section) => section.key)) {
    if (isPageBreakId(key)) {
      if (contentCount > 0) pendingBreak = true;
      continue;
    }
    const section = sections.get(key as ComposedSection["key"]);
    if (!section) continue;
    if (pendingBreak && blocks.length > 0) blocks.push({ kind: "page-break" });
    pendingBreak = false;
    const sectionFontSize = section.fontSize;
    addText(`${style.numberedSections ? `${contentCount + 1}. ` : ""}${section.heading}`, "heading", { bold: true, sectionFontSize });
    appendSection(blocks, section, style.entryLayout, sectionFontSize);
    contentCount += 1;
  }

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
    typography: (() => {
      const typography = resolveDocumentTypography(input.typography);
      const scale = typography.size / 11;
      return {
        family: typography.family,
        /*
         * The PDF renderer embeds one physical file per face, unlike the browser, which stacks
         * the `latin-ext` supplement with `latin` through CSS. Fontsource's `latin-ext` file is a
         * *supplement*: it carries accented and extended glyphs but not the Basic Latin letters,
         * so laying a document out through it maps every letter to `.notdef` and the exported
         * page comes out as a solid block of ink with no readable text. The `latin` file is the
         * one that contains A–Z and a–z, so the renderer must be handed that one.
         *
         * Instrument Sans is pinned to the *static* Fontsource faces, not the variable build.
         * PDFKit subsets through fontkit, and fontkit cannot embed the variable WOFF2 here: it
         * throws `RangeError` mid-subset and, because the stream is already open, the bytes it
         * has emitted are flushed without a glyph dictionary — every character then renders as
         * `.notdef`. The static 400/700 WOFF files subset cleanly and carry the `·` and `•`
         * separators the composed document uses.
         */
        regularFont: typography.family === "instrument-sans" ? "instrument-sans-latin-400-normal.woff" : "open-sans-latin-400-normal.woff",
        boldFont: typography.family === "instrument-sans" ? "instrument-sans-latin-700-normal.woff" : "open-sans-latin-700-normal.woff",
        bodySize: (input.presentationStyleId === "classic" ? 11 : 10.5) * scale,
        headingSize: (input.presentationStyleId === "compact" ? 10.5 : 11) * scale,
        nameSize: (input.presentationStyleId === "compact" ? 18 : 17) * scale,
        lineHeight: input.presentationStyleId === "international" ? 1.4 : input.presentationStyleId === "compact" ? 1.32 : 1.34,
      };
    })(),
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

/** Compile once and materialize the authoritative physical pages consumed by every renderer. */
export function compilePhysicalPresentation(input: Parameters<typeof compilePresentationModel>[0]): PhysicalPresentation {
  const model = compilePresentationModel(input);
  return { model, pages: paginatePresentation(model) };
}

function appendSection(blocks: PresentationBlock[], section: ComposedSection, layout: "stacked" | "split", sectionFontSize?: number) {
  if (section.layout === "prose") appendDetail(blocks, section.body, sectionFontSize);
  // Inline content is a single semantic run, not one paragraph per item. Flattening each
  // item into its own block produced leading separators and large, accidental gaps.
  if (section.layout === "inline" && section.items.length > 0) blocks.push({ kind: "text", text: section.items.map(normalizeText).filter(Boolean).join(" · "), role: "body", sectionFontSize });
  if (section.layout === "grouped") section.groups.forEach((group) => {
    blocks.push({ kind: "text", text: `${normalizeText(group.label)}: ${group.items.map(normalizeText).join(", ")}`, role: "body", sectionFontSize });
  });
  if (section.layout === "entries") section.entries.forEach((entry) => appendEntry(blocks, entry, layout, sectionFontSize));
}

function appendDetail(blocks: PresentationBlock[], detail: { kind: "paragraphs" | "bullets"; lines: string[] }, sectionFontSize?: number) {
  detail.lines.forEach((line) => blocks.push(detail.kind === "bullets" ? { kind: "bullet", text: normalizeText(line), sectionFontSize } : { kind: "text", text: normalizeText(line), role: "body", sectionFontSize }));
}

function appendEntry(blocks: PresentationBlock[], entry: ComposedEntry, layout: "stacked" | "split", sectionFontSize?: number) {
  blocks.push({ kind: "text", text: normalizeText(entry.title), role: "body", bold: true, sectionFontSize });
  if (layout === "split" && entry.meta) blocks.push({ kind: "text", text: normalizeText(entry.meta), role: "meta", sectionFontSize });
  if (entry.subtitle) blocks.push({ kind: "text", text: normalizeText(entry.subtitle), role: "body", sectionFontSize });
  if (layout === "stacked" && entry.meta) blocks.push({ kind: "text", text: normalizeText(entry.meta), role: "meta", italic: true, sectionFontSize });
  if (entry.detail) appendDetail(blocks, entry.detail, sectionFontSize);
  if (entry.url && /^https?:\/\//i.test(entry.url)) blocks.push({ kind: "link", text: normalizeText(entry.url), url: entry.url, sectionFontSize });
  else if (entry.url) blocks.push({ kind: "text", text: normalizeText(entry.url), role: "meta", sectionFontSize });
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
