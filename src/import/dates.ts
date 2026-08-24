/**
 * Reading dates out of a line of a career document.
 *
 * There is no standard for how a CV writes a date. `04/2025 – Present`, `Jan 2020 - Mar 2022`,
 * `2015 – 2019`, `September 2018 to August 2019` and `March 2023` are all the same idea
 * written five ways, and a global product meets all five in its first week. So this reads the
 * shapes rather than a format: it finds every point in the line that could be a date, then
 * decides whether two of them form a range by looking at what sits between them.
 *
 * It reports what it read and where it read it, because the caller needs both. The dossier
 * needs the numbers; the line the date came out of needs the date removed before the rest of
 * it can be interpreted as a role or an institution.
 *
 * Nothing is inferred. A line that states only a year yields only a year — filling in a month
 * would be inventing a fact about somebody's employment, and a document that says "2019" is
 * being precise about its own imprecision.
 */

/** Month names and the abbreviations documents actually use, in month order. */
const MONTH_NAMES: readonly (readonly string[])[] = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sept", "sep"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
];

const monthIndex = new Map<string, number>(
  MONTH_NAMES.flatMap((names, index) => names.map((name) => [name, index + 1] as const)),
);

/* Longest first, so "sept" is not consumed as "sep" leaving a stray "t". */
const monthPattern = [...monthIndex.keys()].sort((a, b) => b.length - a.length).join("|");

/**
 * The three ways a point in time appears.
 *
 * A bare year is restricted to 19xx and 20xx: without that, a credential id, a street number
 * or a version number reads as a date. It is still the loosest of the three, which is why the
 * caller is given the matched text — a wrong guess is visible and removable, not silent.
 */
const POINT_SOURCE =
  `(?:(${monthPattern})\\.?\\s*,?\\s*((?:19|20)\\d{2}))` +
  `|(?:(0?[1-9]|1[0-2])\\s*[/.]\\s*((?:19|20)\\d{2}))` +
  `|(\\b(?:19|20)\\d{2}\\b)`;

/** How a document says an entry has not ended. */
const CURRENT_SOURCE = "present|ongoing|current(?:ly)?|now|to\\s?date|till\\s?date|until\\s?now|today";

/**
 * What may sit between the two ends of a range.
 *
 * Deliberately narrow. Any word other than these turns "2019 Lagos 2021" into two separate
 * dates rather than a range, which is the correct reading — a range is written as a range.
 */
const SEPARATOR = /^(?:\s*(?:[–—‒−~]|-{1,2}|\bto\b|\bthrough\b|\buntil\b|\btill\b)\s*)$/i;

export type ParsedPeriod = {
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  /** The line said the entry has not ended. */
  current: boolean;
  /** Exactly the text the period was read from, so the caller can take it out of the line. */
  matched: string;
};

type Point = {
  month: number | null;
  year: number;
  start: number;
  end: number;
};

/**
 * Reads the period a line states, or nothing when it states none.
 *
 * A range wins over a single date, and the first range in the line wins over any later one:
 * a CV writes the period of the entry at the top and any date inside the description belongs
 * to the description.
 */
export function findPeriod(text: string): ParsedPeriod | null {
  const points = findPoints(text);
  const openEnded = findCurrentMarkers(text);

  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]!;

    const next = points[index + 1];
    if (next && SEPARATOR.test(text.slice(from.end, next.start))) {
      return {
        startMonth: from.month,
        startYear: from.year,
        endMonth: next.month,
        endYear: next.year,
        current: false,
        matched: text.slice(from.start, next.end),
      };
    }

    /*
     * `– Present` is a range whose end is the absence of an end. It is read here rather than
     * being left to the caller because "current" is a property of the period, and a period
     * with a start and no end is otherwise indistinguishable from a single date.
     */
    const marker = openEnded.find(
      (candidate) =>
        candidate.start >= from.end && SEPARATOR.test(text.slice(from.end, candidate.start)),
    );
    if (marker) {
      return {
        startMonth: from.month,
        startYear: from.year,
        endMonth: null,
        endYear: null,
        current: true,
        matched: text.slice(from.start, marker.end),
      };
    }
  }

  const only = points[0];
  if (!only) return null;

  return {
    startMonth: only.month,
    startYear: only.year,
    endMonth: null,
    endYear: null,
    current: false,
    matched: text.slice(only.start, only.end),
  };
}

/**
 * The single date a line states, for entries that have one rather than a period.
 *
 * A credential is issued on a date and an award is given on one; neither has a start and an
 * end. Where the line does contain a range — "valid 2023 – 2026" — the start is the date the
 * caller wants and the end is a separate question, so the range's first point is returned.
 */
export function findDate(text: string): { month: number | null; year: number | null; matched: string } | null {
  const period = findPeriod(text);
  if (!period) return null;
  return { month: period.startMonth, year: period.startYear, matched: period.matched };
}

/** Every point in the line that could be a date, in the order they appear. */
function findPoints(text: string): Point[] {
  const points: Point[] = [];
  const pattern = new RegExp(POINT_SOURCE, "gi");

  for (const match of text.matchAll(pattern)) {
    const [whole, monthName, monthNameYear, monthNumber, monthNumberYear, bareYear] = match;
    const start = match.index;

    if (monthName && monthNameYear) {
      points.push({
        month: monthIndex.get(monthName.toLowerCase()) ?? null,
        year: Number(monthNameYear),
        start,
        end: start + whole.length,
      });
      continue;
    }

    if (monthNumber && monthNumberYear) {
      points.push({
        month: Number(monthNumber),
        year: Number(monthNumberYear),
        start,
        end: start + whole.length,
      });
      continue;
    }

    if (bareYear) {
      points.push({ month: null, year: Number(bareYear), start, end: start + whole.length });
    }
  }

  return points;
}

function findCurrentMarkers(text: string): { start: number; end: number }[] {
  const pattern = new RegExp(`\\b(?:${CURRENT_SOURCE})\\b`, "gi");
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/**
 * The line with a period taken out and the punctuation that held it tidied away.
 *
 * Removing "04/2025 – Present" from "Frontend Developer, Code Bruv, 04/2025 – Present" leaves
 * a trailing comma, and a bracketed period leaves an empty pair of brackets. Both would end
 * up in the user's dossier as typographical debris, so both are cleared — but only where the
 * date was, never elsewhere in the line.
 */
export function removeSpan(text: string, span: string): string {
  const at = text.indexOf(span);
  if (at === -1) return text;

  const before = text.slice(0, at);
  const after = text.slice(at + span.length);
  return `${before} ${after}`
    .replace(/\(\s*\)/g, " ")
    .replace(/\[\s*\]/g, " ")
    .replace(/\s*([,;|·•])\s*(?=[,;|·•]|$)/g, "")
    .replace(/^[\s,;:|·•\-–—]+/, "")
    .replace(/[\s,;:|·•\-–—]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
