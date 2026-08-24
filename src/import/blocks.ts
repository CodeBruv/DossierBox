/**
 * Recovering a document's shape from its lines.
 *
 * Extraction gives us lines. A dossier needs entries. Between those two things sit two
 * problems that have nothing to do with either file format.
 *
 * The first is that a line on a page is not a line of meaning. A PDF has no paragraphs at
 * all — it has glyphs at coordinates, and a sentence that wrapped is two lines that must be
 * put back together before anything can read them. The second is that a CV's sections are
 * announced by headings and its entries are not: a reader knows where one job ends and the
 * next begins from spacing, boldness and the fact that a second date has appeared, and none
 * of those are stated anywhere.
 *
 * So this module makes two structural guesses, and it is deliberately the only place that
 * makes them. Both are guesses the user can see and correct afterwards, which is the whole
 * reason the import flow reviews before it saves — a wrongly split job is a visible row on
 * a review screen, not a silent corruption of somebody's history.
 */

import type { ExtractedLine } from "./extract/line";
import { findPeriod } from "./dates";
import { classifyHeading, type SectionTarget } from "./headings";

/**
 * A run of lines under one heading.
 *
 * `heading` is kept as the document wrote it, not just as a resolved target, because the
 * wording carries information the target discards: "Internships" and "Volunteer Experience"
 * are both experience, and which one it was is a fact the user stated about those entries.
 */
export type Block = {
  /** `null` for the lines above the first heading — the name and contact details. */
  readonly target: SectionTarget | null;
  readonly heading: string | null;
  readonly lines: readonly ExtractedLine[];
};

/**
 * Puts wrapped lines back together.
 *
 * The test is conservative on purpose. Joining two lines that were separate turns two
 * entries into one and loses a fact; leaving a wrapped line split leaves a fragment that
 * still reads correctly on a review screen. So a join needs the previous line to be
 * unfinished — no sentence-ending punctuation — and this line to continue rather than
 * start: lower case, or an opening bracket. Anything that a document marked as a list item
 * or that reads as a heading is left alone whatever its punctuation, because those are
 * structure and structure does not wrap into the line above it.
 */
export function rejoinWrapped(lines: readonly ExtractedLine[]): ExtractedLine[] {
  const joined: ExtractedLine[] = [];

  for (const line of lines) {
    const previous = joined[joined.length - 1];
    if (previous && continuesLine(previous, line)) {
      joined[joined.length - 1] = {
        text: `${previous.text} ${line.text}`.trim(),
        bullet: previous.bullet,
        emphasis: previous.emphasis && line.emphasis,
        links: [...new Set([...previous.links, ...line.links])],
      };
      continue;
    }
    joined.push(line);
  }

  return joined;
}

/** A hard ceiling, so a document without punctuation cannot collapse into one line. */
const MAX_JOINED_LENGTH = 800;

function continuesLine(previous: ExtractedLine, line: ExtractedLine): boolean {
  if (!previous.text || !line.text) return false;
  if (line.bullet) return false;
  if (previous.text.length + line.text.length > MAX_JOINED_LENGTH) return false;

  /* Emphasis is a property of a whole line; a wrap keeps it, a new line often changes it. */
  if (previous.emphasis !== line.emphasis) return false;

  if (classifyHeading(previous) || classifyHeading(line)) return false;

  /* An unfinished line ends mid-thought. A colon finishes one: it introduces what follows. */
  if (/[.:;!?)\]]$/.test(previous.text)) return false;

  /*
   * A continuation is lower case. It is worth being strict here: "and", "of", "with" and
   * "to" are how a wrapped role or institution resumes, whereas a new entry starts with a
   * capital in every document convention there is.
   */
  return /^[a-z(]/.test(line.text);
}

/**
 * Splits lines into the sections the document announced.
 *
 * Everything before the first heading is one block with no target: that is where a CV puts
 * the person's name, and it is the one block whose contents are identified by what they
 * look like rather than by what they were filed under.
 */
export function splitBlocks(lines: readonly ExtractedLine[]): Block[] {
  const blocks: { target: SectionTarget | null; heading: string | null; lines: ExtractedLine[] }[] = [
    { target: null, heading: null, lines: [] },
  ];

  for (const line of lines) {
    const target = classifyHeading(line);
    if (target) {
      blocks.push({ target, heading: line.text, lines: [] });
      continue;
    }
    blocks[blocks.length - 1]!.lines.push(line);
  }

  return blocks.filter((block) => block.lines.length > 0 || block.target !== null);
}

/**
 * One entry's worth of lines: the header that identifies it, and the body that describes it.
 */
export type Entry = {
  readonly head: readonly ExtractedLine[];
  readonly body: readonly ExtractedLine[];
};

/**
 * Splits a section's lines into entries.
 *
 * Every CV entry has the same two-part shape — a header of one to three lines carrying the
 * role, the organization, the place and the dates, then a body of bullets or prose. The
 * split therefore turns on one question: has this entry's body started? Once it has, the
 * next line that does not read like body text begins the next entry.
 *
 * `headLimit` is how many header lines an entry of this kind can have before a further line
 * must belong to the next one. Experience and education write three ("Role" / "Employer" /
 * "Lagos, Nigeria"); a list of certifications writes one, and giving it three would fuse
 * three certificates into a single record.
 */
export function splitEntries(lines: readonly ExtractedLine[], headLimit: number): Entry[] {
  const entries: { head: ExtractedLine[]; body: ExtractedLine[] }[] = [];
  let current: { head: ExtractedLine[]; body: ExtractedLine[] } | null = null;
  let headHasPeriod = false;

  for (const line of lines) {
    if (!line.text) continue;

    if (current && startsNewEntry(current, line, headLimit, headHasPeriod)) {
      entries.push(current);
      current = null;
    }

    if (!current) {
      current = { head: [], body: [] };
      headHasPeriod = false;
    }

    if (current.body.length > 0 || line.bullet || isBodyText(line, current.head.length)) {
      current.body.push(line);
      continue;
    }

    current.head.push(line);
    if (findPeriod(line.text)) headHasPeriod = true;
  }

  if (current) entries.push(current);
  return entries;
}

function startsNewEntry(
  current: { head: ExtractedLine[]; body: ExtractedLine[] },
  line: ExtractedLine,
  headLimit: number,
  headHasPeriod: boolean,
): boolean {
  if (line.bullet) return false;

  /*
   * The body has begun, so a line that still reads like body text continues this entry's
   * description — a second paragraph — and anything shorter or dated is the next entry's
   * header.
   */
  if (current.body.length > 0) return !isBodyText(line, current.head.length);

  /*
   * A second date in the header means a second entry. The exception is the entry whose
   * header carries no date at all: there, the line bringing the date is still this entry's,
   * which is what makes "Certificate name" / "Issuer, 2023" one record rather than two.
   */
  if (findPeriod(line.text)) {
    return headHasPeriod ? current.head.length >= headLimit : current.head.length >= headLimit + 1;
  }

  return current.head.length >= headLimit;
}

/**
 * Whether a line is describing rather than identifying.
 *
 * A header line names things: a role, an employer, a date. A body line says something about
 * them, and says it at length or in a sentence. The word count is the reliable half of the
 * test — no job title runs to twelve words — and the first header line is exempt from the
 * sentence test because a document may well end a one-line entry with a full stop.
 */
function isBodyText(line: ExtractedLine, headLines: number): boolean {
  if (line.bullet) return true;
  if (headLines === 0) return false;
  const words = line.text.split(/\s+/).length;
  if (words >= 12) return true;
  return words >= 6 && /[.!?]$/.test(line.text);
}
