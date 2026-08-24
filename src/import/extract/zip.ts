/**
 * Reading named members out of a ZIP container.
 *
 * A .docx is a ZIP file, so reading one starts here. This exists rather than a dependency
 * because the whole job is "give me two known files out of this archive" — `word/document.xml`
 * and its relationship list — and a general-purpose archive library is a large amount of
 * third-party code, running over a file a stranger uploaded, to answer a question this
 * narrow. The format's directory structure is stable and documented; the risk of writing it
 * is bounded and visible, which is the opposite trade to most parsing code.
 *
 * Everything here treats the bytes as hostile. A ZIP header is a set of offsets and lengths
 * that claim where data lives, and nothing stops an uploaded file from claiming a member
 * decompresses to sixty gigabytes, or that its data begins past the end of the file. So
 * every offset is bounds-checked against the real length, and every member has a ceiling on
 * what it is allowed to expand to. A malformed archive throws; it never reads out of bounds
 * and never allocates on a promise the file made about itself.
 */

import { inflateRawSync } from "node:zlib";

/** Signatures, little-endian, as the format defines them. */
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

/** The end-of-directory record may be followed by a comment of up to 65535 bytes. */
const MAX_TRAILER_SCAN = 65_557;

/**
 * A ceiling on what any single member is allowed to expand to.
 *
 * The compressed size of an archive says nothing about its contents: a few kilobytes of
 * zeros inflate to gigabytes, and a document XML part is the natural place to hide one.
 * 32 MB is far beyond any real `document.xml` — the reference CVs are under 40 kB — while
 * being small enough that a hostile upload exhausts nothing.
 */
const MAX_MEMBER_BYTES = 32 * 1024 * 1024;

/** Values a 32-bit field uses to mean "see the Zip64 record instead". */
const ZIP64_SENTINEL = 0xffffffff;

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipFormatError";
  }
}

type ZipMember = {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export type ZipArchive = {
  /** Member names, in directory order. */
  names: readonly string[];
  /** The decompressed bytes of one member, or null when the archive has no such member. */
  read(name: string): Buffer | null;
};

/**
 * Reads the central directory and returns a reader over the members it lists.
 *
 * The central directory is authoritative rather than the local headers, because a local
 * header is allowed to defer its sizes to a trailing descriptor. Reading the directory up
 * front also means an archive that is truncated or is not an archive at all fails here,
 * before anything downstream has been handed a half-parsed document.
 */
export function openZip(bytes: Buffer): ZipArchive {
  const directoryOffset = findCentralDirectory(bytes);
  const members = new Map<string, ZipMember>();
  const names: string[] = [];

  let cursor = directoryOffset;
  while (cursor + 46 <= bytes.length && bytes.readUInt32LE(cursor) === CENTRAL_DIRECTORY_ENTRY) {
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localHeaderOffset = bytes.readUInt32LE(cursor + 42);

    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > bytes.length) {
      throw new ZipFormatError("A member name runs past the end of the archive.");
    }

    /*
     * Zip64 puts the real sizes in an extra field and leaves these at the sentinel. Nothing
     * a career document produces needs it, so this refuses the file rather than reading the
     * sentinel as a length — which would silently truncate or over-read.
     */
    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      localHeaderOffset === ZIP64_SENTINEL
    ) {
      throw new ZipFormatError("This archive uses Zip64 extensions, which are not supported.");
    }

    const name = bytes.toString("utf8", cursor + 46, nameEnd);
    if (!members.has(name)) {
      members.set(name, { method, compressedSize, uncompressedSize, localHeaderOffset });
      names.push(name);
    }

    cursor = nameEnd + extraLength + commentLength;
  }

  if (members.size === 0) {
    throw new ZipFormatError("This archive lists no files.");
  }

  return {
    names,
    read(name) {
      const member = members.get(name);
      return member ? readMember(bytes, member, name) : null;
    },
  };
}

/**
 * Locates the end-of-central-directory record by scanning backwards.
 *
 * Backwards because the record sits at the end but is followed by a variable-length
 * comment, so its position cannot be computed — only found. The scan is bounded to the
 * largest a comment may be, so a large file that is not an archive costs a fixed read
 * rather than a full sweep.
 */
function findCentralDirectory(bytes: Buffer): number {
  const floor = Math.max(0, bytes.length - MAX_TRAILER_SCAN);
  for (let offset = bytes.length - 22; offset >= floor; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue;

    const directoryOffset = bytes.readUInt32LE(offset + 16);
    if (directoryOffset === ZIP64_SENTINEL) {
      throw new ZipFormatError("This archive uses Zip64 extensions, which are not supported.");
    }
    if (directoryOffset + 46 > bytes.length) {
      throw new ZipFormatError("This archive's directory is outside the file.");
    }
    return directoryOffset;
  }

  throw new ZipFormatError("This file is not a readable archive.");
}

function readMember(bytes: Buffer, member: ZipMember, name: string): Buffer {
  const header = member.localHeaderOffset;
  if (header + 30 > bytes.length || bytes.readUInt32LE(header) !== LOCAL_FILE_HEADER) {
    throw new ZipFormatError(`The archive entry for ${name} is not where the directory says.`);
  }

  const nameLength = bytes.readUInt16LE(header + 26);
  const extraLength = bytes.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const end = start + member.compressedSize;
  if (end > bytes.length) {
    throw new ZipFormatError(`The archive entry for ${name} runs past the end of the file.`);
  }

  if (member.uncompressedSize > MAX_MEMBER_BYTES) {
    throw new ZipFormatError(`${name} is larger than this reader will expand.`);
  }

  const data = bytes.subarray(start, end);

  // 0 is stored, 8 is deflate. Between them they cover every archive Office writes.
  if (member.method === 0) return Buffer.from(data);
  if (member.method !== 8) {
    throw new ZipFormatError(`${name} uses a compression method that is not supported.`);
  }

  /*
   * `maxOutputLength` is the actual defence rather than the size check above: the declared
   * size is the archive's own claim, and a hostile file simply lies about it. zlib stops at
   * the ceiling and errors, so the bomb costs 32 MB instead of the process.
   */
  try {
    return inflateRawSync(data, { maxOutputLength: MAX_MEMBER_BYTES });
  } catch {
    throw new ZipFormatError(`${name} could not be decompressed.`);
  }
}
