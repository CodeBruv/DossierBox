/**
 * The line model both readers produce.
 *
 * This is the contract between reading a file and interpreting it, and it lives on its own
 * because it belongs to neither format. A Word document states its paragraphs; a PDF only
 * implies them through coordinates. Both are reduced to the same four signals here, so the
 * parser downstream never asks which format it came from — and so that adding a third reader
 * later is a matter of producing these lines rather than of touching the parser.
 *
 * The four signals are the ones a career document actually carries meaning through. Text is
 * obvious. List membership separates a responsibility from a job title. Emphasis is how
 * every CV in existence marks a heading. And links matter because the address behind
 * "Portfolio" is the entire content of a portfolio entry, and it is stored nowhere near the
 * word the reader sees.
 */

export type ExtractedLine = {
  /** The line as it read on the page, with runs joined and whitespace collapsed. */
  text: string;
  /** The source marked this as a list item. */
  bullet: boolean;
  /** The whole line was emphasised — a heading style, or every run bold. */
  emphasis: boolean;
  /** Web addresses the source attached to this line. */
  links: readonly string[];
};

/**
 * A file we could not read as the document it claimed to be.
 *
 * Every message thrown as one of these is written for the person who uploaded the file: it
 * says what went wrong in terms of their document and what they can do instead. Nothing
 * here is a stack trace or a format detail, because the user cannot act on either.
 */
export class DocumentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentFormatError";
  }
}
