/**
 * Reading the text of a Word document.
 *
 * The output is deliberately not a string. A CV is a *structured* document, and the
 * structure is most of what makes the text interpretable later: which lines were headings,
 * which were list items, which web address belonged to which line. Flatten it to plain text
 * first and the parser downstream has to guess all of that back from punctuation. So this
 * keeps the three signals the format actually carries — paragraph boundaries, list
 * membership, emphasis — and discards everything else.
 *
 * What it does not do is interpret. "EXPERIENCE" is a heading here only in the sense that
 * Word marked it as one; whether it means the experience section is a question for the
 * parser, and whether it becomes a dossier entry is a question for the user. This layer's
 * only claim is that the text it returns appeared in the file.
 */

import { DocumentFormatError, type ExtractedLine } from "./line";
import { openZip, ZipFormatError } from "./zip";

/** Where Word keeps the body text and the targets of its hyperlinks. */
const DOCUMENT_PART = "word/document.xml";
const RELATIONSHIP_PART = "word/_rels/document.xml.rels";

export function extractDocxLines(bytes: Buffer): ExtractedLine[] {
  let archive;
  try {
    archive = openZip(bytes);
  } catch (error) {
    if (error instanceof ZipFormatError) {
      throw new DocumentFormatError("This file could not be opened as a Word document.");
    }
    throw error;
  }

  const part = archive.read(DOCUMENT_PART);
  if (!part) {
    throw new DocumentFormatError("This file does not contain Word document text.");
  }

  const relationships = readRelationships(archive.read(RELATIONSHIP_PART));
  return readBody(part.toString("utf8"), relationships);
}

/**
 * Maps relationship ids to their targets.
 *
 * Word stores a hyperlink as a reference — `r:id="rId7"` — and keeps the address in a
 * separate part. Without this, every link in an imported CV arrives as its display text
 * with the actual address dropped, which is precisely the information a portfolio or
 * LinkedIn entry consists of.
 *
 * Only external targets are kept. An internal relationship points at another part of the
 * archive (a font, a bookmark), and turning one of those into something that looks like the
 * user's web address would be inventing a fact.
 */
function readRelationships(part: Buffer | null): Map<string, string> {
  const targets = new Map<string, string>();
  if (!part) return targets;

  const xml = part.toString("utf8");
  const pattern = /<Relationship\b([^>]*)\/?>/g;
  for (const match of xml.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    const id = attributeValue(attributes, "Id");
    const target = attributeValue(attributes, "Target");
    const type = attributeValue(attributes, "Type") ?? "";
    if (!id || !target) continue;
    if (!type.endsWith("/hyperlink")) continue;
    targets.set(id, decodeXmlText(target));
  }

  return targets;
}

type ParagraphState = {
  runs: string[];
  bullet: boolean;
  headingStyle: boolean;
  boldRuns: number;
  textRuns: number;
  links: string[];
};

function emptyParagraph(): ParagraphState {
  return { runs: [], bullet: false, headingStyle: false, boldRuns: 0, textRuns: 0, links: [] };
}

/**
 * Walks the document part once, emitting a line per paragraph.
 *
 * A hand-written scanner rather than an XML parser, for the same reason the ZIP reader is
 * hand-written: the question is narrow and the shape of the answer is known. It reads tags
 * in order and keeps a small amount of state, which is enough because WordprocessingML puts
 * a paragraph's properties before its runs — so by the time text arrives, whether the
 * paragraph is a list item is already known.
 *
 * Nothing here evaluates the markup. Tag names are compared against a fixed set and
 * attribute values are only ever read as text.
 */
function readBody(xml: string, relationships: Map<string, string>): ExtractedLine[] {
  const lines: ExtractedLine[] = [];
  let paragraph = emptyParagraph();
  /* Runs inside a `<w:rPr>` are bold when the property was seen for *that* run only. */
  let runIsBold = false;
  let inRunProperties = false;

  const flush = () => {
    const text = collapse(paragraph.runs.join(""));
    /*
     * Emphasis means the *whole* line stood out. A bold word inside a sentence is ordinary
     * emphasis and says nothing about the line's role, whereas a line that is bold from end
     * to end is how nearly every CV writes a heading or a job title.
     */
    const allBold = paragraph.textRuns > 0 && paragraph.boldRuns === paragraph.textRuns;
    if (text || paragraph.links.length > 0) {
      lines.push({
        text,
        bullet: paragraph.bullet,
        emphasis: paragraph.headingStyle || allBold,
        links: dedupe(paragraph.links),
      });
    }
    paragraph = emptyParagraph();
  };

  let cursor = 0;
  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open === -1) break;
    const close = xml.indexOf(">", open);
    if (close === -1) break;

    const tag = xml.slice(open + 1, close);
    const name = tagName(tag);

    switch (name) {
      case "w:p":
        // A new paragraph starts, so whatever was open ends — even if its close tag was
        // lost. Textbox content nests paragraphs, and this keeps that text rather than
        // letting a nested paragraph swallow the one containing it.
        flush();
        break;
      case "/w:p":
        flush();
        break;
      case "w:br":
      case "w:cr":
        // A soft break is a line the reader sees, so it is a line here too.
        flush();
        break;
      case "w:numPr":
        paragraph.bullet = true;
        break;
      case "w:pStyle": {
        const style = attributeValue(tag, "w:val") ?? "";
        if (/^(heading|title|subtitle)/i.test(style)) paragraph.headingStyle = true;
        if (/^(listparagraph)/i.test(style)) paragraph.bullet = true;
        break;
      }
      case "w:rPr":
        inRunProperties = true;
        runIsBold = false;
        break;
      case "/w:rPr":
        inRunProperties = false;
        break;
      case "w:b":
      case "w:bCs":
        // `<w:b w:val="0"/>` explicitly turns bold off, which is how Word cancels an
        // inherited style. Reading the attribute rather than the tag's presence is the
        // difference between "bold" and "deliberately not bold".
        if (inRunProperties) runIsBold = !isFalse(attributeValue(tag, "w:val"));
        break;
      case "w:tab":
        // Tabs separate columns — a date on the right of a job title. Preserved as a space
        // so the words do not run together, but not as structure: which side of a tab a
        // date sat on is a layout decision, not a fact about the user.
        paragraph.runs.push(" ");
        break;
      case "w:sym": {
        // A symbol-font bullet: the glyph is meaningless outside its font, so it is read as
        // the list marker it is rather than transliterated into a wrong character.
        const char = attributeValue(tag, "w:char") ?? "";
        if (/^f0(a7|b7|d8)$/i.test(char)) paragraph.bullet = true;
        break;
      }
      case "w:hyperlink": {
        const id = attributeValue(tag, "r:id");
        const target = id ? relationships.get(id) : undefined;
        if (target) paragraph.links.push(target);
        break;
      }
      case "w:t":
      case "w:instrText": {
        // A self-closing `<w:t/>` carries nothing.
        if (tag.endsWith("/")) break;
        const end = xml.indexOf(`</${name}>`, close + 1);
        if (end === -1) {
          cursor = close + 1;
          continue;
        }
        const raw = decodeXmlText(xml.slice(close + 1, end));
        if (name === "w:instrText") {
          // A field instruction is machinery, not text — except that Word writes older
          // hyperlinks this way, so the address is worth taking and the instruction is not.
          const field = /HYPERLINK\s+"([^"]+)"/i.exec(raw);
          if (field?.[1]) paragraph.links.push(field[1]);
        } else {
          paragraph.runs.push(raw);
          paragraph.textRuns += 1;
          if (runIsBold) paragraph.boldRuns += 1;
        }
        cursor = end + name.length + 3;
        continue;
      }
      default:
        break;
    }

    cursor = close + 1;
  }

  flush();
  return lines;
}

function tagName(tag: string): string {
  const end = tag.search(/[\s/>]/);
  const name = end === -1 ? tag : tag.slice(0, end);
  // `</w:p >` and `<w:p/>` both need to reduce to a comparable name.
  return name.startsWith("/") ? name : name.replace(/\/$/, "");
}

function attributeValue(source: string, attribute: string): string | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(attribute)}\\s*=\\s*"([^"]*)"`);
  return pattern.exec(source)?.[1];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFalse(value: string | undefined): boolean {
  return value === "0" || value === "false" || value === "off";
}

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Turns XML text into the characters it stands for.
 *
 * Numeric references are resolved with `fromCodePoint`, not `fromCharCode`, so a name or a
 * qualification written outside the Basic Multilingual Plane survives the import. An
 * unrecognised entity is left exactly as written rather than dropped: if a user's document
 * really contains "&foo;", showing them "&foo;" is honest and showing them nothing is not.
 */
function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const digits = isHex ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return namedEntities[body.toLowerCase()] ?? whole;
  });
}

/**
 * One line of text, spaced as a reader would see it.
 *
 * Non-breaking spaces are folded into ordinary ones because they are a typesetting choice
 * in the source document, and leaving them in produces values that look identical to a
 * user but do not compare equal to anything.
 */
function collapse(value: string): string {
  return value.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
