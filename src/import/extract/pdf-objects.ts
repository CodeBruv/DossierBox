/**
 * The object layer of a PDF.
 *
 * A PDF is not a text format with some compression on top; it is a small object database.
 * Text lives inside content streams, content streams belong to pages, and the characters in
 * them are byte codes whose meaning is defined by a font object somewhere else in the file.
 * So reading text out of a PDF means reading its objects first, which is what this file
 * does — and nothing more than that. It has no opinion about what the text says.
 *
 * Two deliberate choices, both about robustness over fidelity:
 *
 * Objects are found by scanning the whole file for `N G obj` rather than by following the
 * cross-reference table. The table is the correct route and this is the forgiving one: a
 * file with a damaged or unusual xref — which includes a great many real CVs that have been
 * edited, merged, or produced by a tool with a loose interpretation of the spec — still
 * yields its objects. Since the goal is to offer a user their own text for review, being
 * forgiving is worth more here than being exact.
 *
 * Nothing is evaluated. PDF has an executable side (actions, JavaScript, embedded files);
 * this reader looks only at dictionaries, streams, pages and fonts, and never at anything
 * that asks to be run.
 */

import { inflateSync } from "node:zlib";

/** A stream is never expanded past this. Untrusted input, same reasoning as the ZIP reader. */
const MAX_STREAM_BYTES = 16 * 1024 * 1024;

/** A ceiling on how much of a file is examined at all, so a huge upload cannot stall a request. */
export const MAX_PDF_BYTES = 12 * 1024 * 1024;

export class PdfFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfFormatError";
  }
}

export type PdfValue =
  | { kind: "name"; value: string }
  | { kind: "number"; value: number }
  | { kind: "string"; value: Buffer }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "array"; items: PdfValue[] }
  | { kind: "dict"; entries: PdfDictionary }
  | { kind: "ref"; id: number };

export type PdfDictionary = Map<string, PdfValue>;

type PdfObject = {
  value: PdfValue;
  /** Raw, still-encoded stream bytes, when the object has a stream. */
  raw?: Buffer;
};

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function isWhitespace(byte: number | undefined) {
  return byte !== undefined && WHITESPACE.has(byte);
}

function isRegular(byte: number | undefined) {
  return byte !== undefined && !WHITESPACE.has(byte) && !DELIMITERS.has(byte);
}

/**
 * A reader over one object's syntax.
 *
 * Shared by the object scan and the content-stream tokeniser because they read the same
 * primitives — names, numbers, strings, arrays, dictionaries. Keeping one implementation
 * means a string escape or a hex digit is handled identically wherever it appears.
 */
export class PdfLexer {
  constructor(
    readonly bytes: Buffer,
    public position = 0,
  ) {}

  skipWhitespace() {
    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position];
      if (isWhitespace(byte)) {
        this.position += 1;
        continue;
      }
      // A comment runs to the end of the line and is whitespace for every purpose.
      if (byte === 0x25) {
        while (this.position < this.bytes.length && this.bytes[this.position] !== 0x0a) {
          this.position += 1;
        }
        continue;
      }
      return;
    }
  }

  /** Reads the next token as a raw word: an operator, a keyword, or a bare number. */
  readWord(): string {
    this.skipWhitespace();
    const start = this.position;
    while (isRegular(this.bytes[this.position])) this.position += 1;
    if (this.position === start) this.position += 1;
    return this.bytes.toString("latin1", start, this.position);
  }

  peekByte(): number | undefined {
    this.skipWhitespace();
    return this.bytes[this.position];
  }

  /**
   * Reads one value.
   *
   * Depth is bounded because arrays and dictionaries nest, and a hostile file can nest them
   * thousands deep to exhaust the stack. Real documents nest a handful of levels.
   */
  readValue(depth = 0): PdfValue {
    if (depth > 32) throw new PdfFormatError("This document is nested too deeply to read.");
    this.skipWhitespace();
    const byte = this.bytes[this.position];
    if (byte === undefined) return { kind: "null" };

    if (byte === 0x2f) return { kind: "name", value: this.readName() };
    if (byte === 0x28) return { kind: "string", value: this.readLiteralString() };
    if (byte === 0x5b) return this.readArray(depth);
    if (byte === 0x3c) {
      return this.bytes[this.position + 1] === 0x3c
        ? this.readDictionary(depth)
        : { kind: "string", value: this.readHexString() };
    }
    if (byte === 0x5d || byte === 0x3e || byte === 0x29) {
      // A closing delimiter where a value was expected: consume it so the caller advances.
      this.position += 1;
      return { kind: "null" };
    }

    const word = this.readWord();
    if (word === "true") return { kind: "boolean", value: true };
    if (word === "false") return { kind: "boolean", value: false };
    if (word === "null") return { kind: "null" };

    const numeric = Number(word);
    if (Number.isFinite(numeric) && word.length > 0) {
      /*
       * `12 0 R` is a reference, and it is indistinguishable from the number 12 until two
       * more tokens have been read. So the position is remembered and restored — a lookahead
       * rather than a guess.
       */
      const mark = this.position;
      const second = this.readWord();
      if (/^\d+$/.test(second)) {
        const third = this.readWord();
        if (third === "R") return { kind: "ref", id: Math.trunc(numeric) };
      }
      this.position = mark;
      return { kind: "number", value: numeric };
    }

    return { kind: "null" };
  }

  private readName(): string {
    this.position += 1;
    const start = this.position;
    while (isRegular(this.bytes[this.position])) this.position += 1;
    const raw = this.bytes.toString("latin1", start, this.position);
    // `#xx` is how a name encodes a byte it cannot spell directly.
    return raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }

  private readArray(depth: number): PdfValue {
    this.position += 1;
    const items: PdfValue[] = [];
    while (this.position < this.bytes.length) {
      this.skipWhitespace();
      if (this.bytes[this.position] === 0x5d) {
        this.position += 1;
        break;
      }
      const before = this.position;
      items.push(this.readValue(depth + 1));
      if (this.position === before) this.position += 1;
    }
    return { kind: "array", items };
  }

  private readDictionary(depth: number): PdfValue {
    this.position += 2;
    const entries: PdfDictionary = new Map();
    while (this.position < this.bytes.length) {
      this.skipWhitespace();
      if (this.bytes[this.position] === 0x3e && this.bytes[this.position + 1] === 0x3e) {
        this.position += 2;
        break;
      }
      if (this.bytes[this.position] !== 0x2f) {
        // Not a key: the dictionary is malformed. Step over the byte rather than spin.
        this.position += 1;
        continue;
      }
      const key = this.readName();
      const value = this.readValue(depth + 1);
      entries.set(key, value);
    }
    return { kind: "dict", entries };
  }

  /** `( ... )` with balanced inner parentheses, backslash escapes and octal codes. */
  private readLiteralString(): Buffer {
    this.position += 1;
    const out: number[] = [];
    let nesting = 1;

    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position];
      this.position += 1;

      if (byte === 0x5c) {
        const escape = this.bytes[this.position];
        this.position += 1;
        switch (escape) {
          case 0x6e: out.push(0x0a); break;
          case 0x72: out.push(0x0d); break;
          case 0x74: out.push(0x09); break;
          case 0x62: out.push(0x08); break;
          case 0x66: out.push(0x0c); break;
          case 0x0a: break; // A line continuation contributes nothing.
          case 0x0d:
            if (this.bytes[this.position] === 0x0a) this.position += 1;
            break;
          default: {
            if (escape !== undefined && escape >= 0x30 && escape <= 0x37) {
              let code = escape - 0x30;
              for (let digit = 0; digit < 2; digit += 1) {
                const next = this.bytes[this.position];
                if (next === undefined || next < 0x30 || next > 0x37) break;
                code = code * 8 + (next - 0x30);
                this.position += 1;
              }
              out.push(code & 0xff);
            } else if (escape !== undefined) {
              out.push(escape);
            }
          }
        }
        continue;
      }

      if (byte === 0x28) nesting += 1;
      if (byte === 0x29) {
        nesting -= 1;
        if (nesting === 0) break;
      }
      if (byte !== undefined) out.push(byte);
    }

    return Buffer.from(out);
  }

  /** `< ... >`; an odd final digit is padded with zero, as the specification requires. */
  private readHexString(): Buffer {
    this.position += 1;
    const digits: string[] = [];
    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position];
      this.position += 1;
      if (byte === 0x3e) break;
      const char = String.fromCharCode(byte ?? 0);
      if (/[0-9a-fA-F]/.test(char)) digits.push(char);
    }
    if (digits.length % 2 === 1) digits.push("0");
    const out = Buffer.alloc(digits.length / 2);
    for (let index = 0; index < out.length; index += 1) {
      out[index] = Number.parseInt(`${digits[index * 2]}${digits[index * 2 + 1]}`, 16);
    }
    return out;
  }
}

export type PdfPage = {
  /** Every content stream of the page, concatenated in order. */
  content: Buffer;
  /** The page's resource dictionary, already resolved, or null when it has none. */
  resources: PdfDictionary | null;
};

export class PdfDocument {
  private constructor(private readonly objects: Map<number, PdfObject>) {}

  static parse(bytes: Buffer): PdfDocument {
    if (bytes.length > MAX_PDF_BYTES) {
      throw new PdfFormatError("This PDF is larger than the reader will open.");
    }
    // The header may be preceded by junk in files that have been concatenated or served
    // oddly, so this looks near the start rather than exactly at it.
    if (!bytes.subarray(0, 1024).includes("%PDF-")) {
      throw new PdfFormatError("This file is not a PDF.");
    }

    const objects = scanObjects(bytes);
    const document = new PdfDocument(objects);
    document.expandObjectStreams();
    return document;
  }

  /**
   * Whether the document declares encryption.
   *
   * Checked by looking for the trailer's `/Encrypt` key rather than by attempting to
   * decrypt: strings and streams in an encrypted file are ciphertext, and extracting them
   * would produce confident-looking rubbish. Refusing is the honest outcome.
   */
  static isEncrypted(bytes: Buffer): boolean {
    return /\/Encrypt\b/.test(bytes.toString("latin1"));
  }

  resolve(value: PdfValue | undefined): PdfValue | undefined {
    let current = value;
    // References can chain; a cycle would otherwise loop forever.
    for (let hop = 0; hop < 16; hop += 1) {
      if (!current || current.kind !== "ref") return current;
      current = this.objects.get(current.id)?.value;
    }
    return undefined;
  }

  dictionaryOf(value: PdfValue | undefined): PdfDictionary | null {
    const resolved = this.resolve(value);
    return resolved?.kind === "dict" ? resolved.entries : null;
  }

  /** The decoded bytes of an object's stream, or null when it has none or cannot be decoded. */
  streamOf(value: PdfValue | undefined): Buffer | null {
    const id = value?.kind === "ref" ? value.id : null;
    if (id === null) return null;
    const object = this.objects.get(id);
    if (!object?.raw || object.value.kind !== "dict") return null;
    return this.decodeStream(object.value.entries, object.raw);
  }

  /**
   * The pages, in reading order.
   *
   * Order comes from the page tree, because object numbering does not have to match the
   * order a reader sees — and an imported CV whose second page arrives first is worse than
   * useless. When no tree can be found the fallback is object order, which is right far more
   * often than it is wrong, and is the only remaining source of a sequence.
   */
  pages(): PdfPage[] {
    const ordered = this.pageTreeOrder();
    const ids = ordered.length > 0 ? ordered : this.pageObjectIds();
    const pages: PdfPage[] = [];

    for (const id of ids) {
      const object = this.objects.get(id);
      if (!object || object.value.kind !== "dict") continue;
      const entries = object.value.entries;
      pages.push({
        content: this.contentOf(entries),
        resources: this.inheritedResources(entries),
      });
    }

    return pages;
  }

  private contentOf(page: PdfDictionary): Buffer {
    const contents = page.get("Contents");
    const parts: Buffer[] = [];

    const push = (value: PdfValue | undefined) => {
      const stream = this.streamOf(value);
      if (stream) parts.push(stream);
    };

    if (contents?.kind === "ref") {
      const target = this.resolve(contents);
      // `/Contents` may reference an array of streams; the page's content is their
      // concatenation, and an operator may even straddle the join.
      if (target?.kind === "array") for (const item of target.items) push(item);
      else push(contents);
    } else if (contents?.kind === "array") {
      for (const item of contents.items) push(item);
    }

    return parts.length > 0 ? Buffer.concat(parts.flatMap((part) => [part, Buffer.from("\n")])) : Buffer.alloc(0);
  }

  /** Resources may live on an ancestor node, so this walks up `/Parent`. */
  private inheritedResources(page: PdfDictionary): PdfDictionary | null {
    let node: PdfDictionary | null = page;
    for (let hop = 0; hop < 32 && node; hop += 1) {
      const resources = this.dictionaryOf(node.get("Resources"));
      if (resources) return resources;
      node = this.dictionaryOf(node.get("Parent"));
    }
    return null;
  }

  private pageObjectIds(): number[] {
    const ids: number[] = [];
    for (const [id, object] of this.objects) {
      if (object.value.kind !== "dict") continue;
      const type = object.value.entries.get("Type");
      if (type?.kind === "name" && type.value === "Page") ids.push(id);
    }
    return ids.sort((left, right) => left - right);
  }

  private pageTreeOrder(): number[] {
    let rootPages: PdfValue | undefined;
    for (const object of this.objects.values()) {
      if (object.value.kind !== "dict") continue;
      const type = object.value.entries.get("Type");
      if (type?.kind === "name" && type.value === "Catalog") {
        rootPages = object.value.entries.get("Pages");
        break;
      }
    }
    if (!rootPages) return [];

    const ordered: number[] = [];
    const seen = new Set<number>();

    const walk = (value: PdfValue | undefined, depth: number) => {
      if (depth > 64 || ordered.length > 2048) return;
      if (value?.kind !== "ref" || seen.has(value.id)) return;
      seen.add(value.id);
      const entries = this.dictionaryOf(value);
      if (!entries) return;
      const type = entries.get("Type");
      const kids = this.resolve(entries.get("Kids"));
      if (kids?.kind === "array") {
        for (const kid of kids.items) walk(kid, depth + 1);
        return;
      }
      if (type?.kind === "name" && type.value === "Page") ordered.push(value.id);
    };

    walk(rootPages, 0);
    return ordered;
  }

  /**
   * Pulls objects out of compressed object streams.
   *
   * Since PDF 1.5 most dictionaries — including page and font objects — are packed inside
   * `/Type /ObjStm` streams, which the plain scan above cannot see because they are
   * compressed. Every PDF produced by a current browser or word processor is built this way,
   * so without this step a typical modern CV appears to contain no pages at all.
   *
   * Objects found here never overwrite ones found in the file body: an incremental update
   * appends a newer object outside the stream, and the body copy is the one that wins.
   */
  private expandObjectStreams() {
    const containers = [...this.objects.values()].filter(
      (object) =>
        object.raw &&
        object.value.kind === "dict" &&
        object.value.entries.get("Type")?.kind === "name" &&
        (object.value.entries.get("Type") as { value: string }).value === "ObjStm",
    );

    for (const container of containers) {
      if (container.value.kind !== "dict" || !container.raw) continue;
      const decoded = this.decodeStream(container.value.entries, container.raw);
      if (!decoded) continue;

      const count = this.numberOf(container.value.entries.get("N"));
      const first = this.numberOf(container.value.entries.get("First"));
      if (count === null || first === null) continue;

      const header = new PdfLexer(decoded.subarray(0, Math.min(first, decoded.length)));
      const pairs: Array<{ id: number; offset: number }> = [];
      for (let index = 0; index < count; index += 1) {
        const id = Number(header.readWord());
        const offset = Number(header.readWord());
        if (!Number.isFinite(id) || !Number.isFinite(offset)) break;
        pairs.push({ id, offset });
      }

      for (const pair of pairs) {
        if (this.objects.has(pair.id)) continue;
        const start = first + pair.offset;
        if (start >= decoded.length) continue;
        const lexer = new PdfLexer(decoded, start);
        this.objects.set(pair.id, { value: lexer.readValue() });
      }
    }
  }

  private numberOf(value: PdfValue | undefined): number | null {
    const resolved = this.resolve(value);
    return resolved?.kind === "number" ? Math.trunc(resolved.value) : null;
  }

  /**
   * Decompresses a stream.
   *
   * Only Flate is handled, which is what every text-bearing stream in practice uses. Other
   * filters belong to images and to legacy encodings; returning null for those is correct
   * rather than lossy, because a stream this cannot decode is one whose text it would
   * otherwise have to guess at.
   */
  private decodeStream(dictionary: PdfDictionary, raw: Buffer): Buffer | null {
    const filter = this.resolve(dictionary.get("Filter"));
    const names =
      filter?.kind === "name"
        ? [filter.value]
        : filter?.kind === "array"
          ? filter.items.flatMap((item) => (item.kind === "name" ? [item.value] : []))
          : [];

    let data = raw;
    if (names.length === 0) return data;

    for (const name of names) {
      if (name !== "FlateDecode" && name !== "Fl") return null;
      try {
        data = inflateSync(data, { maxOutputLength: MAX_STREAM_BYTES });
      } catch {
        /*
         * Some writers leave a stray byte between `stream` and the data. Retrying one byte
         * in recovers those files, and costs one failed inflate on the ones it cannot help.
         */
        try {
          data = inflateSync(data.subarray(1), { maxOutputLength: MAX_STREAM_BYTES });
        } catch {
          return null;
        }
      }
    }

    const predictor = this.decodeParameters(dictionary);
    return predictor ? applyPngPredictor(data, predictor.columns, predictor.colors) : data;
  }

  /**
   * Cross-reference and object streams are often written with a PNG predictor, which is a
   * second layer of encoding underneath Flate. Object streams are what this reader needs, so
   * the predictor has to be undone or their contents are noise.
   */
  private decodeParameters(dictionary: PdfDictionary): { columns: number; colors: number } | null {
    const params = this.dictionaryOf(dictionary.get("DecodeParms"));
    if (!params) return null;
    const predictor = this.numberOf(params.get("Predictor")) ?? 1;
    if (predictor < 10) return null;
    return {
      columns: this.numberOf(params.get("Columns")) ?? 1,
      colors: this.numberOf(params.get("Colors")) ?? 1,
    };
  }
}

/**
 * Finds every `N G obj` in the file and parses the object that follows.
 *
 * The scan runs over a latin1 view because it is looking for ASCII markers inside binary
 * data, and latin1 is the one encoding that maps bytes to characters without loss or
 * substitution — a UTF-8 view would corrupt the offsets it computes.
 */
function scanObjects(bytes: Buffer): Map<number, PdfObject> {
  const view = bytes.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const pattern = /(\d{1,10})\s+(\d{1,5})\s+obj\b/g;

  for (const match of view.matchAll(pattern)) {
    const id = Number(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    if (!Number.isFinite(id)) continue;

    const lexer = new PdfLexer(bytes, start);
    let value: PdfValue;
    try {
      value = lexer.readValue();
    } catch {
      continue;
    }

    const object: PdfObject = { value };

    lexer.skipWhitespace();
    if (view.startsWith("stream", lexer.position)) {
      let dataStart = lexer.position + "stream".length;
      // The keyword is followed by CRLF or LF — never by LF alone preceded by CR.
      if (bytes[dataStart] === 0x0d) dataStart += 1;
      if (bytes[dataStart] === 0x0a) dataStart += 1;

      const declared =
        value.kind === "dict" ? lengthOf(value.entries, objects, bytes, view) : null;
      let dataEnd = declared !== null ? dataStart + declared : -1;

      /*
       * A declared length is a claim, and a wrong one is common enough that it cannot be
       * trusted: it is also the one field a hostile file would use to make this reader read
       * beyond the stream. `endstream` is the ground truth, so the claim is used only when
       * it lands somewhere plausible.
       */
      const terminator = view.indexOf("endstream", dataStart);
      if (dataEnd < dataStart || dataEnd > bytes.length || (terminator !== -1 && dataEnd > terminator + 2)) {
        dataEnd = terminator === -1 ? bytes.length : terminator;
      }

      object.raw = bytes.subarray(dataStart, Math.min(dataEnd, bytes.length));
    }

    // Later definitions win: an incrementally updated file appends the newer object.
    objects.set(id, object);
  }

  return objects;
}

/**
 * A stream's `/Length`, including when it is an indirect reference.
 *
 * The reference commonly points forward to an object the scan has not reached yet, so this
 * takes a second look at the file for that one object rather than giving up. Cheap, because
 * it only happens for streams whose length is indirect.
 */
function lengthOf(
  dictionary: PdfDictionary,
  objects: Map<number, PdfObject>,
  bytes: Buffer,
  view: string,
): number | null {
  const value = dictionary.get("Length");
  if (value?.kind === "number") return Math.trunc(value.value);
  if (value?.kind !== "ref") return null;

  const known = objects.get(value.id)?.value;
  if (known?.kind === "number") return Math.trunc(known.value);

  const marker = new RegExp(`(?:^|[^0-9])${value.id}\\s+\\d+\\s+obj\\b`).exec(view);
  if (!marker) return null;
  const lexer = new PdfLexer(bytes, (marker.index ?? 0) + marker[0].length);
  const parsed = lexer.readValue();
  return parsed.kind === "number" ? Math.trunc(parsed.value) : null;
}

/**
 * Reverses the PNG row filters used by `/Predictor 12` and friends.
 *
 * Each row is prefixed by a filter byte naming how it was transformed relative to the row
 * above. Only the "up" filter appears in practice for PDF cross-reference and object
 * streams, but the others cost two lines each and a file using one would otherwise decode
 * to plausible-looking nonsense.
 */
function applyPngPredictor(data: Buffer, columns: number, colors: number): Buffer {
  const sampleBytes = Math.max(1, colors);
  const rowLength = Math.max(1, columns * sampleBytes);
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = Buffer.alloc(rows * rowLength);
  let previous = Buffer.alloc(rowLength);

  for (let row = 0; row < rows; row += 1) {
    const filter = data[row * (rowLength + 1)] ?? 0;
    const source = data.subarray(row * (rowLength + 1) + 1, (row + 1) * (rowLength + 1));
    const current = Buffer.alloc(rowLength);

    for (let index = 0; index < rowLength; index += 1) {
      const raw = source[index] ?? 0;
      const left = index >= sampleBytes ? (current[index - sampleBytes] ?? 0) : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= sampleBytes ? (previous[index - sampleBytes] ?? 0) : 0;

      switch (filter) {
        case 0: current[index] = raw; break;
        case 1: current[index] = (raw + left) & 0xff; break;
        case 2: current[index] = (raw + up) & 0xff; break;
        case 3: current[index] = (raw + ((left + up) >> 1)) & 0xff; break;
        case 4: {
          const estimate = left + up - upLeft;
          const dLeft = Math.abs(estimate - left);
          const dUp = Math.abs(estimate - up);
          const dUpLeft = Math.abs(estimate - upLeft);
          const nearest = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
          current[index] = (raw + nearest) & 0xff;
          break;
        }
        default: current[index] = raw; break;
      }
    }

    current.copy(out, row * rowLength);
    previous = current;
  }

  return out;
}
