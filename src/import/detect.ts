/**
 * Deciding what an uploaded file actually is.
 *
 * The filename and the content type both arrive from the browser, which means both arrive
 * from whoever is uploading. A file called `cv.pdf` sent as `application/pdf` is a claim, not
 * a fact, and the one thing that is not a claim is the bytes. So this reads the bytes.
 *
 * The distinction matters twice. Once for safety — handing a PDF to the ZIP reader or an
 * arbitrary archive to the Word reader is how parsers are made to misbehave — and once for
 * the user, because "this is a .doc, save it as .docx" is a message somebody can act on
 * whereas "unsupported file" is not.
 */

import { openZip, ZipFormatError } from "./extract/zip";

/**
 * How large an upload may be.
 *
 * A career document is a few hundred kilobytes; the reference CVs are under 40 kB as Word
 * files and under 200 kB as PDFs. Four megabytes is generous enough for a design-heavy CV
 * full of embedded images and small enough that nothing downstream has to stream.
 *
 * The ceiling is not arbitrary. The document arrives through a server action, whose body is
 * capped in next.config.js, and that cap has to sit under the deploy platform's own hard
 * request-body limit (~4.5 MB on Vercel's serverless functions). So the file limit here, the
 * `serverActions.bodySizeLimit`, and the platform ceiling are one decision made in three
 * places: keep this the smallest, leave the body limit a little larger for multipart overhead,
 * and keep both under the platform's hard limit. Raising this alone would only move the
 * rejection from a message the user can read to a platform error they cannot.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Enough bytes to find a header in, without reading a file we are going to reject. */
const HEADER_SCAN = 1024;

export type FormatDetection =
  | { readonly kind: "pdf" }
  | { readonly kind: "docx" }
  /** A ZIP, but not a Word document — most often .xlsx, .pptx or .pages. */
  | { readonly kind: "other-archive" }
  /** The pre-2007 binary Word format, which is a different problem entirely. */
  | { readonly kind: "legacy-doc" }
  | { readonly kind: "unsupported" };

/** ZIP local file header, and the OLE compound-document signature `.doc` files carry. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** The part whose presence is what makes an archive a Word document rather than a ZIP. */
const WORD_DOCUMENT_PART = "word/document.xml";

export function detectFormat(bytes: Buffer): FormatDetection {
  if (bytes.length < 8) return { kind: "unsupported" };

  /*
   * `%PDF-` is specified to be at the start of the file, and in practice frequently is not:
   * writers and mail systems prepend bytes, and every reader tolerates it. Searching a
   * bounded window accepts those files without accepting a file that merely mentions PDF
   * somewhere in its middle.
   */
  const header = bytes.subarray(0, HEADER_SCAN);
  if (header.includes("%PDF-")) return { kind: "pdf" };

  if (bytes.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC)) return { kind: "legacy-doc" };

  if (bytes.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    /*
     * Every Office format since 2007 is a ZIP, so the signature alone says nothing about
     * which one. Reading the directory is the only way to tell, and it costs a directory
     * walk rather than a decompression.
     */
    try {
      return openZip(bytes).names.includes(WORD_DOCUMENT_PART)
        ? { kind: "docx" }
        : { kind: "other-archive" };
    } catch (error) {
      if (error instanceof ZipFormatError) return { kind: "unsupported" };
      throw error;
    }
  }

  return { kind: "unsupported" };
}

/**
 * What to tell the user about a file we will not read.
 *
 * Each message names the format we found and the action that fixes it, because "unsupported
 * file type" leaves someone holding a document they cannot import and no idea why.
 */
export function unsupportedFormatMessage(detection: FormatDetection): string {
  switch (detection.kind) {
    case "legacy-doc":
      return "This is an older Word file (.doc). Open it in Word and save it as .docx, or export it as a PDF, then upload that.";
    case "other-archive":
      return "This looks like a spreadsheet or presentation rather than a document. Upload a PDF or a Word .docx file.";
    default:
      return "We can read PDF and Word (.docx) documents. This file is neither.";
  }
}
