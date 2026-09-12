import type { PresentationBlock, PresentationModel } from "./export-presentation";

export type PaginatedPresentationLine = {
  readonly text: string;
  readonly bullet: boolean;
};

export type PaginatedPresentationBlock = {
  readonly source: PresentationBlock;
  readonly lines: readonly PaginatedPresentationLine[];
  readonly top: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly height: number;
  readonly bold: boolean;
  readonly color: string;
  readonly gapAfter: number;
};

export type PaginatedPresentationPage = {
  readonly blocks: readonly PaginatedPresentationBlock[];
};

const APPROXIMATE_GLYPH_WIDTH_EM = 0.62;

/**
 * Produces the physical page plan consumed by both the browser preview and PDFKit.
 * Text is deliberately wrapped here, instead of independently by CSS and PDFKit,
 * so both renderers receive identical lines and explicit physical page boundaries.
 */
export function paginatePresentation(model: PresentationModel): readonly PaginatedPresentationPage[] {
  const contentWidth = model.paper.widthPoints - model.margins.left - model.margins.right;
  const contentBottom = model.paper.heightPoints - model.margins.bottom;
  const pages: Array<{ blocks: PaginatedPresentationBlock[] }> = [{ blocks: [] }];
  let top = model.margins.top;

  const currentPage = () => pages[pages.length - 1];
  const addPage = () => {
    if (currentPage().blocks.length === 0) return;
    pages.push({ blocks: [] });
    top = model.margins.top;
  };

  for (let blockIndex = 0; blockIndex < model.blocks.length; blockIndex += 1) {
    const source = model.blocks[blockIndex]!;
    if (source.kind === "page-break") {
      addPage();
      continue;
    }

    const metrics = blockMetrics(model, source);
    const wrapped = wrapBlock(source, contentWidth, metrics.fontSize);
    const next = model.blocks[blockIndex + 1];

    if (source.kind === "text" && source.role === "heading" && next && next.kind !== "page-break") {
      const nextMetrics = blockMetrics(model, next);
      const nextFirstLineHeight = nextMetrics.fontSize * model.typography.lineHeight;
      if (top + metrics.lineHeight + metrics.gapAfter + nextFirstLineHeight > contentBottom) addPage();
    }

    let lineIndex = 0;
    while (lineIndex < wrapped.length) {
      const availableLines = Math.floor((contentBottom - top - metrics.gapAfter) / metrics.lineHeight);
      if (availableLines <= 0) {
        addPage();
        continue;
      }

      const lines = wrapped.slice(lineIndex, lineIndex + availableLines);
      const height = lines.length * metrics.lineHeight;
      currentPage().blocks.push({
        source,
        lines,
        top,
        fontSize: metrics.fontSize,
        lineHeight: metrics.lineHeight,
        height,
        bold: metrics.bold,
        color: metrics.color,
        gapAfter: metrics.gapAfter,
      });
      top += height + metrics.gapAfter;
      lineIndex += lines.length;
      if (lineIndex < wrapped.length) addPage();
    }
  }

  return pages.filter((page, index) => page.blocks.length > 0 || index === 0);
}

function blockMetrics(model: PresentationModel, block: Exclude<PresentationBlock, { kind: "page-break" }>) {
  const isHeading = block.kind === "text" && block.role === "heading";
  const isName = block.kind === "text" && block.role === "name";
  const fontSize = isName ? model.typography.nameSize : isHeading ? model.typography.headingSize : model.typography.bodySize;
  const lineHeight = fontSize * model.typography.lineHeight;
  const gapAfter = isHeading
    ? model.spacing.sectionBefore + model.spacing.sectionAfter
    : block.kind === "text" && block.role !== "body"
      ? 2
      : model.spacing.paragraphAfter;
  const color = isName
    ? model.colors.accent
    : block.kind === "link"
      ? model.colors.accent
      : block.kind === "text" && block.role === "meta"
        ? model.colors.muted
        : model.colors.ink;
  return {
    fontSize,
    lineHeight,
    gapAfter,
    color,
    bold: isName || isHeading || (block.kind === "text" && Boolean(block.bold)),
  };
}

function wrapBlock(
  block: Exclude<PresentationBlock, { kind: "page-break" }>,
  contentWidth: number,
  fontSize: number,
): readonly PaginatedPresentationLine[] {
  const bullet = block.kind === "bullet";
  const text = block.text;
  const usableWidth = contentWidth - (bullet ? fontSize * 1.25 : 0);
  const maximumUnits = Math.max(1, Math.floor(usableWidth / (fontSize * APPROXIMATE_GLYPH_WIDTH_EM)));
  return wrapText(text, maximumUnits).map((line, index) => ({ text: line, bullet: bullet && index === 0 }));
}

function wrapText(text: string, maximumUnits: number): readonly string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const chunks = splitWord(word, maximumUnits);
    for (const chunk of chunks) {
      const candidate = line ? `${line} ${chunk}` : chunk;
      if (textUnits(candidate) <= maximumUnits) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = chunk;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function splitWord(word: string, maximumUnits: number): readonly string[] {
  if (textUnits(word) <= maximumUnits) return [word];
  const chunks: string[] = [];
  let chunk = "";
  for (const character of word) {
    if (chunk && textUnits(chunk + character) > maximumUnits) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function textUnits(value: string) {
  let units = 0;
  for (const character of value) {
    if (/\s/u.test(character)) units += 0.45;
    else if (/[ilI1.,'`:;!|]/u.test(character)) units += 0.5;
    else if (/[mwMW@%&#]/u.test(character)) units += 1.45;
    else if (/[A-Z0-9]/u.test(character)) units += 1.05;
    else units += 1;
  }
  return units;
}
