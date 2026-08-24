/**
 * Reading the text of a PDF.
 *
 * PDF has no notion of a line of text. It has instructions that place glyph codes at
 * coordinates, and the "lines" a reader perceives are an emergent property of those
 * coordinates. So this reconstructs them: it walks each page's content stream, records where
 * every fragment of text was placed, and groups fragments that share a baseline. That is why
 * the output is comparable to the Word reader's — both produce lines, for the same parser to
 * interpret — even though one format states its paragraphs and the other only implies them.
 *
 * The characters themselves are a second problem. A byte in a content stream is not a
 * character; it is an index into whatever encoding the active font declares. Most PDFs ship a
 * `ToUnicode` map for exactly this reason and it is used where present; where it is absent
 * the font's declared encoding is used instead.
 *
 * When neither works the result is convincing rubbish — the right number of words, made of
 * wrong letters — and an import feature that hands a user rubbish and asks them to confirm
 * it is worse than one that admits defeat. So the extraction is scored before it is
 * returned, and a low score is reported as a failure to read the file rather than as text.
 */

import { DocumentFormatError, type ExtractedLine } from "./line";
import {
  MAX_PDF_BYTES,
  PdfDocument,
  PdfFormatError,
  PdfLexer,
  type PdfDictionary,
  type PdfValue,
} from "./pdf-objects";

/** Fragments whose baselines are within this many units are on the same line. */
const BASELINE_TOLERANCE = 2.5;

/**
 * Below this proportion of plainly readable characters, the extraction is treated as failed.
 *
 * Real career documents are overwhelmingly letters, digits, spaces and punctuation. Text
 * decoded through the wrong encoding is not: it is dense with control codes, private-use
 * glyphs and accented letters in improbable places. The threshold is deliberately lenient —
 * a CV in a language with heavy diacritics still passes easily — because its job is only to
 * catch the case where decoding has plainly failed.
 */
const MINIMUM_READABLE_RATIO = 0.85;

/** A page beyond this is not read; no career document is this long, and the cap bounds the work. */
const MAX_PAGES = 30;

export function extractPdfLines(bytes: Buffer): ExtractedLine[] {
  if (bytes.length > MAX_PDF_BYTES) {
    throw new DocumentFormatError("This PDF is too large to read. Try a shorter document.");
  }
  if (PdfDocument.isEncrypted(bytes)) {
    throw new DocumentFormatError(
      "This PDF is password protected or restricted, so its text cannot be read. Save an unprotected copy and try again.",
    );
  }

  let document: PdfDocument;
  try {
    document = PdfDocument.parse(bytes);
  } catch (error) {
    if (error instanceof PdfFormatError) throw new DocumentFormatError(error.message);
    throw error;
  }

  const lines: ExtractedLine[] = [];
  for (const page of document.pages().slice(0, MAX_PAGES)) {
    if (page.content.length === 0) continue;
    const fonts = readFonts(document, page.resources);
    for (const line of assembleLines(readFragments(page.content, fonts))) lines.push(line);
  }

  const readable = readableRatio(lines);
  if (lines.length === 0) {
    throw new DocumentFormatError(
      "We couldn't find any text in this PDF. If it is a scan or a photograph of a document, the words are an image rather than text — type them in instead.",
    );
  }
  if (readable < MINIMUM_READABLE_RATIO) {
    throw new DocumentFormatError(
      "We couldn't read the text in this PDF reliably, so we would rather not guess. Try a Word version of the same document, or type the details in.",
    );
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Fonts                                                                       */
/* -------------------------------------------------------------------------- */

type FontDecoder = {
  /** How many bytes make one character code in this font. */
  codeBytes: 1 | 2;
  /** Whether the font's own name says it is a bold face. */
  bold: boolean;
  decode(code: number): string;
};

const FALLBACK_FONT: FontDecoder = {
  codeBytes: 1,
  bold: false,
  decode: (code) => decodeWinAnsi(code),
};

/**
 * Builds a decoder per resource name (`/F1`, `/C2_0`, …) for one page.
 *
 * Per page rather than per document, and per font rather than merged, because subset fonts
 * reuse low codes: in one font code 3 may be "a" and in another "x". A single merged table
 * would decode most of a document correctly and silently corrupt the rest, which is the one
 * outcome this file exists to prevent.
 */
function readFonts(document: PdfDocument, resources: PdfDictionary | null): Map<string, FontDecoder> {
  const decoders = new Map<string, FontDecoder>();
  const fonts = resources ? document.dictionaryOf(resources.get("Font")) : null;
  if (!fonts) return decoders;

  for (const [name, reference] of fonts) {
    const font = document.dictionaryOf(reference);
    if (!font) continue;
    decoders.set(name, buildDecoder(document, font));
  }

  return decoders;
}

function nameOf(value: PdfValue | undefined): string | null {
  return value?.kind === "name" ? value.value : null;
}

function buildDecoder(document: PdfDocument, font: PdfDictionary): FontDecoder {
  const subtype = nameOf(document.resolve(font.get("Subtype")));
  const baseFont = nameOf(document.resolve(font.get("BaseFont"))) ?? "";
  const bold = /bold|black|heavy|semib/i.test(baseFont);

  /*
   * A composite font addresses glyphs with two-byte codes. Identity-H — by far the most
   * common — makes the code the glyph index, which means nothing without the ToUnicode map,
   * so a composite font that has no map cannot be decoded and says so by yielding nothing.
   */
  const composite = subtype === "Type0";
  const toUnicode = parseToUnicode(document.streamOf(font.get("ToUnicode")));

  if (composite) {
    const descendants = document.resolve(font.get("DescendantFonts"));
    const descendant =
      descendants?.kind === "array" && descendants.items[0]
        ? document.dictionaryOf(descendants.items[0])
        : null;
    const descendantBold = descendant
      ? /bold|black|heavy|semib/i.test(nameOf(document.resolve(descendant.get("BaseFont"))) ?? "")
      : false;

    return {
      codeBytes: 2,
      bold: bold || descendantBold,
      decode: (code) => toUnicode?.get(code) ?? "",
    };
  }

  const differences = parseDifferences(document, font);

  return {
    codeBytes: 1,
    bold,
    decode: (code) => {
      const mapped = toUnicode?.get(code);
      if (mapped !== undefined) return mapped;
      const named = differences.get(code);
      if (named !== undefined) return named;
      return decodeWinAnsi(code);
    },
  };
}

/**
 * Parses a `ToUnicode` CMap into a code-to-text table.
 *
 * The map is a small PostScript-like program, but only two of its constructs carry the
 * information needed — `bfchar` for single codes and `bfrange` for runs — so this reads those
 * and ignores the rest of the language. Destinations are UTF-16BE, and may be several code
 * units long, which is how a font maps one code onto a ligature such as "fi".
 */
function parseToUnicode(stream: Buffer | null): Map<number, string> | null {
  if (!stream) return null;
  const map = new Map<number, string>();
  const lexer = new PdfLexer(stream);
  const pending: PdfValue[] = [];

  while (lexer.position < stream.length) {
    lexer.skipWhitespace();
    if (lexer.position >= stream.length) break;
    const byte = stream[lexer.position];

    // Operands are values; operators are bare words. Anything else is a token to step past.
    if (byte === 0x3c || byte === 0x5b || byte === 0x28 || byte === 0x2f) {
      const before = lexer.position;
      pending.push(lexer.readValue());
      if (lexer.position === before) lexer.position += 1;
      continue;
    }

    const word = lexer.readWord();
    if (word === "endbfchar") {
      for (let index = 0; index + 1 < pending.length; index += 2) {
        const code = codeFrom(pending[index]);
        const text = textFrom(pending[index + 1]);
        if (code !== null && text) map.set(code, text);
      }
      pending.length = 0;
      continue;
    }
    if (word === "endbfrange") {
      for (let index = 0; index + 2 < pending.length; index += 3) {
        const low = codeFrom(pending[index]);
        const high = codeFrom(pending[index + 1]);
        const destination = pending[index + 2];
        if (low === null || high === null || high < low || high - low > 65_535) continue;

        if (destination?.kind === "array") {
          destination.items.forEach((item, offset) => {
            const text = textFrom(item);
            if (text) map.set(low + offset, text);
          });
          continue;
        }

        const start = textFrom(destination);
        if (!start) continue;
        // A range destination increments its *last* code unit across the range.
        const prefix = start.slice(0, -1);
        const lastUnit = start.codePointAt(start.length - 1) ?? 0;
        for (let code = low; code <= high; code += 1) {
          map.set(code, `${prefix}${String.fromCodePoint(lastUnit + (code - low))}`);
        }
      }
      pending.length = 0;
      continue;
    }

    if (word === "beginbfchar" || word === "beginbfrange") {
      pending.length = 0;
      continue;
    }
    if (word.length === 0) lexer.position += 1;
  }

  return map.size > 0 ? map : null;
}

function codeFrom(value: PdfValue | undefined): number | null {
  if (value?.kind === "string") {
    let code = 0;
    for (const byte of value.value) code = code * 256 + byte;
    return code;
  }
  if (value?.kind === "number") return Math.trunc(value.value);
  return null;
}

function textFrom(value: PdfValue | undefined): string {
  if (value?.kind !== "string") return "";
  const bytes = value.value;
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode(((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0));
  }
  // An odd trailing byte means a single-byte destination, which some writers emit.
  if (bytes.length === 1) text = String.fromCharCode(bytes[0] ?? 0);
  return text;
}

/**
 * The `/Differences` array of a simple font's encoding.
 *
 * Glyph names are only translated where the name states the character it stands for —
 * `uni00E9`, or one of the handful of names a document uses for punctuation. A name like
 * `g43` states nothing translatable, and inventing a letter for it would be exactly the
 * fabrication this pipeline is not allowed to commit.
 */
function parseDifferences(document: PdfDocument, font: PdfDictionary): Map<number, string> {
  const map = new Map<number, string>();
  const encoding = document.resolve(font.get("Encoding"));
  const entries = encoding?.kind === "dict" ? encoding.entries : null;
  const differences = entries ? document.resolve(entries.get("Differences")) : null;
  if (differences?.kind !== "array") return map;

  let code = 0;
  for (const item of differences.items) {
    if (item.kind === "number") {
      code = Math.trunc(item.value);
      continue;
    }
    if (item.kind === "name") {
      const character = glyphNameToText(item.value);
      if (character) map.set(code, character);
      code += 1;
    }
  }

  return map;
}

const glyphNames: Record<string, string> = {
  space: " ",
  hyphen: "-",
  endash: "–",
  emdash: "—",
  bullet: "•",
  periodcentered: "·",
  quotesingle: "'",
  quoteright: "’",
  quoteleft: "‘",
  quotedblleft: "“",
  quotedblright: "”",
  ampersand: "&",
  comma: ",",
  period: ".",
  colon: ":",
  semicolon: ";",
  slash: "/",
  bar: "|",
  at: "@",
  plus: "+",
  parenleft: "(",
  parenright: ")",
};

function glyphNameToText(name: string): string | null {
  const known = glyphNames[name];
  if (known) return known;
  const unicode = /^uni([0-9A-Fa-f]{4,6})$/.exec(name);
  if (unicode?.[1]) {
    const code = Number.parseInt(unicode[1], 16);
    if (code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
  }
  return null;
}

/** WinAnsi differs from Latin-1 only in 0x80–0x9f, which is where its punctuation lives. */
const winAnsiHigh = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

function decodeWinAnsi(code: number): string {
  if (code === 0) return "";
  if (code >= 0x80 && code <= 0x9f) return winAnsiHigh[code - 0x80] ?? "";
  return String.fromCharCode(code);
}

/* -------------------------------------------------------------------------- */
/* Content streams                                                             */
/* -------------------------------------------------------------------------- */

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[1] * right[2],
    left[0] * right[1] + left[1] * right[3],
    left[2] * right[0] + left[3] * right[2],
    left[2] * right[1] + left[3] * right[3],
    left[4] * right[0] + left[5] * right[2] + right[4],
    left[4] * right[1] + left[5] * right[3] + right[5],
  ];
}

type Fragment = {
  text: string;
  x: number;
  y: number;
  /** The effective size the text was set at, used to judge whether a gap is a space. */
  size: number;
  bold: boolean;
  /** Emission order, used to keep fragments stable when they share a position. */
  sequence: number;
};

/**
 * Walks a page's content stream and records where each piece of text was placed.
 *
 * The text matrix is tracked properly rather than approximated, because the coordinate it
 * produces is the only evidence of which line a fragment belongs to. What is *not* tracked is
 * how far each glyph advances: that needs the font's width table, and without it consecutive
 * fragments would be placed on top of each other. Emission order resolves those, which is
 * correct because a writer that does not reposition is writing left to right.
 */
function readFragments(content: Buffer, fonts: Map<string, FontDecoder>): Fragment[] {
  const fragments: Fragment[] = [];
  const lexer = new PdfLexer(content);
  const operands: PdfValue[] = [];
  const stack: Matrix[] = [];

  let ctm: Matrix = IDENTITY;
  let textMatrix: Matrix = IDENTITY;
  let lineMatrix: Matrix = IDENTITY;
  let leading = 0;
  let font = FALLBACK_FONT;
  let fontSize = 0;
  let sequence = 0;

  const numbers = (count: number): number[] => {
    const tail = operands.slice(-count);
    return tail.map((value) => (value.kind === "number" ? value.value : 0));
  };

  /**
   * The size the text is actually being drawn at.
   *
   * `Tf` states a size in text space, and the text matrix may scale it — a document that sets
   * 1pt type and scales it twelvefold is unusual but entirely legal. Since the size is used
   * only to judge whether a horizontal gap is wide enough to be a space, the vertical scale is
   * a good enough measure of it and avoids decomposing the matrix.
   */
  const effectiveSize = () => {
    const placement = multiply(textMatrix, ctm);
    const scale = Math.hypot(placement[2], placement[3]) || 1;
    return Math.abs(fontSize * scale);
  };

  const push = (text: string) => {
    if (!text) return;
    const placement = multiply(textMatrix, ctm);
    fragments.push({
      text,
      x: placement[4],
      y: placement[5],
      size: effectiveSize(),
      bold: font.bold,
      sequence: sequence++,
    });
  };

  const show = (value: PdfValue | undefined) => {
    if (value?.kind !== "string") return;
    push(decodeShownText(value.value, font));
  };

  const newline = (amount = leading) => {
    lineMatrix = multiply([1, 0, 0, 1, 0, -amount], lineMatrix);
    textMatrix = lineMatrix;
  };

  while (lexer.position < content.length) {
    lexer.skipWhitespace();
    if (lexer.position >= content.length) break;
    const byte = content[lexer.position];

    if (byte === 0x2f || byte === 0x28 || byte === 0x3c || byte === 0x5b) {
      const before = lexer.position;
      operands.push(lexer.readValue());
      if (lexer.position === before) lexer.position += 1;
      continue;
    }
    if (byte !== undefined && (byte === 0x2b || byte === 0x2d || byte === 0x2e || (byte >= 0x30 && byte <= 0x39))) {
      const before = lexer.position;
      const word = lexer.readWord();
      const numeric = Number(word);
      operands.push(Number.isFinite(numeric) ? { kind: "number", value: numeric } : { kind: "null" });
      if (lexer.position === before) lexer.position += 1;
      continue;
    }

    const operator = lexer.readWord();
    switch (operator) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? IDENTITY;
        break;
      case "cm": {
        const [a, b, c, d, e, f] = numbers(6);
        ctm = multiply([a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0], ctm);
        break;
      }
      case "BT":
        textMatrix = IDENTITY;
        lineMatrix = IDENTITY;
        break;
      case "ET":
        break;
      case "Tf": {
        const name = operands.at(-2);
        const size = operands.at(-1);
        font = (name?.kind === "name" ? fonts.get(name.value) : undefined) ?? FALLBACK_FONT;
        if (size?.kind === "number") fontSize = size.value;
        break;
      }
      case "TL": {
        const [value] = numbers(1);
        leading = value ?? 0;
        break;
      }
      case "Td": {
        const [x, y] = numbers(2);
        lineMatrix = multiply([1, 0, 0, 1, x ?? 0, y ?? 0], lineMatrix);
        textMatrix = lineMatrix;
        break;
      }
      case "TD": {
        const [x, y] = numbers(2);
        leading = -(y ?? 0);
        lineMatrix = multiply([1, 0, 0, 1, x ?? 0, y ?? 0], lineMatrix);
        textMatrix = lineMatrix;
        break;
      }
      case "Tm": {
        const [a, b, c, d, e, f] = numbers(6);
        lineMatrix = [a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0];
        textMatrix = lineMatrix;
        break;
      }
      case "T*":
        newline();
        break;
      case "Tj":
        show(operands.at(-1));
        break;
      case "'":
        newline();
        show(operands.at(-1));
        break;
      case '"':
        newline();
        show(operands.at(-1));
        break;
      case "TJ": {
        const array = operands.at(-1);
        if (array?.kind === "array") {
          /*
           * A TJ array interleaves strings with position adjustments. A large adjustment is how
           * some writers express a word space — the gap is positioning, not a character — so it
           * becomes a space here or the words run together. The sign is inverted relative to
           * intuition: the value is *subtracted* from the position, so a negative number moves
           * forward.
           *
           * The threshold sits above letter-spacing and below a word space. A space is around
           * a quarter to a third of an em in most faces, which is 250–330 here; tracking applied
           * to a heading is rarely more than 200. Set it lower and every letter-spaced heading
           * arrives as "P R O F I L E".
           */
          const pieces: string[] = [];
          for (const item of array.items) {
            if (item.kind === "string") pieces.push(decodeShownText(item.value, font));
            else if (item.kind === "number" && item.value <= -220) pieces.push(" ");
          }
          push(pieces.join(""));
        }
        break;
      }
      default:
        break;
    }

    if (operator.length === 0) lexer.position += 1;
    else operands.length = 0;
  }

  return fragments;
}

function decodeShownText(bytes: Buffer, font: FontDecoder): string {
  let text = "";
  if (font.codeBytes === 2) {
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      text += font.decode(((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0));
    }
    return text;
  }
  for (const byte of bytes) text += font.decode(byte);
  return text;
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Markers that begin a list item.
 *
 * Two patterns, because the evidence differs. A bullet glyph is never anything else, and it
 * frequently arrives as its own fragment with no space after it, so no separator is required.
 * A dash is ordinary punctuation — a hyphenated word, a range — and only reads as a marker
 * when a space follows it.
 */
const BULLET_GLYPH = /^[•▪◦‣∙●○·*]\s*/;
const BULLET_DASH = /^[-–—]\s+/;

/**
 * Groups fragments that share a baseline into lines.
 *
 * Tolerance rather than equality, because a superscript, a differently sized run or a
 * rounding difference moves a baseline by a fraction of a point without moving it to a new
 * line. Lines then run down the page — PDF's y axis points up, so descending y is reading
 * order — and fragments run left to right within each.
 */
function assembleLines(fragments: Fragment[]): ExtractedLine[] {
  if (fragments.length === 0) return [];

  const groups: Fragment[][] = [];
  for (const fragment of [...fragments].sort((left, right) => right.y - left.y)) {
    const last = groups.at(-1);
    const reference = last?.[0];
    if (reference && Math.abs(reference.y - fragment.y) <= BASELINE_TOLERANCE) last.push(fragment);
    else groups.push([fragment]);
  }

  const lines: ExtractedLine[] = [];
  for (const group of groups) {
    group.sort((left, right) => left.x - right.x || left.sequence - right.sequence);
    const raw = joinAcrossGaps(group).replace(/\s+/g, " ").trim();
    if (!raw) continue;

    const marker = BULLET_GLYPH.exec(raw) ?? BULLET_DASH.exec(raw);
    lines.push({
      text: marker ? raw.slice(marker[0].length).trim() : raw,
      bullet: marker !== null,
      /*
       * Emphasis means the whole line is a bold face. There is no paragraph style to consult
       * in a PDF, so the font's own name is the only evidence available — and it is the same
       * evidence a reader uses when they see a heading.
       */
      emphasis: group.every((fragment) => fragment.bold || !fragment.text.trim()),
      links: [],
    });
  }

  return lines;
}

/**
 * Joins a line's fragments, inserting a space where the page had a visible gap.
 *
 * This is the one place where the absence of font metrics has to be worked around. Two
 * fragments on the same baseline may be adjacent — the second half of a sentence — or a
 * column apart, as when a job title sits at the left margin and its dates are set flush
 * right. Both arrive as bare coordinates, and joining them blindly produces
 * "Technologies Ltd04/2025".
 *
 * So the width of a fragment is estimated from its character count at roughly half an em,
 * which is close enough for proportional text, and a gap wider than the slack is read as a
 * space. The estimate is deliberately generous: over-estimating a width suppresses a space
 * that should have been added, whereas under-estimating inserts one into the middle of a
 * word. Losing a space between two columns is a cosmetic problem; gaining one inside a name
 * corrupts it.
 */
function joinAcrossGaps(group: readonly Fragment[]): string {
  let text = "";
  let previousEnd: number | null = null;

  for (const fragment of group) {
    const size = fragment.size || 10;
    if (
      previousEnd !== null &&
      text.length > 0 &&
      !/\s$/.test(text) &&
      !/^\s/.test(fragment.text) &&
      fragment.x - previousEnd > size * 0.6
    ) {
      text += " ";
    }
    text += fragment.text;
    previousEnd = fragment.x + fragment.text.length * size * 0.55;
  }

  return text;
}

/**
 * The proportion of characters that a career document plausibly contains.
 *
 * This is the guard that keeps a failed decode from being presented as text. It counts
 * letters, digits, spaces and the punctuation documents actually use, and treats everything
 * else — control codes, private-use glyphs, replacement characters — as evidence that the
 * bytes were read through the wrong encoding.
 */
function readableRatio(lines: readonly ExtractedLine[]): number {
  let readable = 0;
  let total = 0;

  /* Written as escapes rather than as characters: a replacement character and a private-use
     glyph are invisible in a source file, and this is a test nobody should have to guess at. */
  const unusable = /[\uFFFD\uE000-\uF8FF]/u;
  const usable = /[\p{L}\p{N}\p{Zs}\p{P}\p{Sc}+=<>^~|]/u;

  for (const line of lines) {
    for (const character of line.text) {
      total += 1;
      if (usable.test(character) && !unusable.test(character)) readable += 1;
    }
  }

  return total === 0 ? 0 : readable / total;
}
