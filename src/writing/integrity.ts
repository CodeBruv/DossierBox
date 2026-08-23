/**
 * Factual integrity — checking generated language against what the user actually said.
 *
 * The product's central promise is that a document contains no facts the user did not
 * supply. The specification lists twenty categories that must never be invented and gives
 * two worked examples: "I helped customers use the company's software" must not become
 * "Managed a portfolio of 200 enterprise customers", and "I reduced the time we spent
 * checking orders" must not become "Reduced processing time by 35%" unless the user supplied
 * 35%. Both fabrications share a shape — a number or a name appears in the output that
 * appears nowhere in the input — and that shape is checkable without a model.
 *
 * ## What this is and is not
 *
 * It is a backstop. The primary defence is the prompt contract in `prompts.ts`, which states
 * the rule to the model; this catches the cases where the model ignores it. A backstop is
 * worth having because the failure it guards against is silent: a fabricated statistic reads
 * *better* than the truth, so nothing about the output signals that it is wrong.
 *
 * It is also, deliberately, a **conservative** check, and the two directions of error are not
 * symmetric. A false positive costs the user a rewrite they cannot see the reason for: the
 * request is refused and their own words are used instead, which is a worse document but a
 * true one. A false negative puts a fabricated credential in a document someone sends to an
 * employer. So the check errs towards refusing.
 *
 * ## Known gaps, stated rather than implied
 *
 * - **Quantities written as words.** "Over two hundred customers" contains no digits and
 *   passes. Detecting it needs a number-word parser, and the naive version flags "one of the"
 *   in every third sentence.
 * - **Unquantified inflation.** "Senior", "led", "across several teams" assert seniority and
 *   scale with no number and no name. §5 forbids them and this cannot see them.
 * - **Fabrication at the start of a sentence.** Sentence-initial capitals are ordinary words,
 *   so a name in that position is not examined. A fabricated organisation appearing *only*
 *   there is missed.
 * - **The neutral-term list.** {@link neutralTerms} is judgement, it will need to grow, and
 *   every addition is a small widening of what passes unexamined.
 *
 * These are reported here because a check whose limits are undocumented gets trusted for
 * things it does not do.
 */

import type { WritingConstraints, WritingContext } from "./context";
import { supportingText } from "./context";

export const writingFindingKinds = [
  /** A digit sequence in the output that appears nowhere in the user's information. */
  "unsupported_number",
  /** A capitalised name or phrase with no basis in the user's information. */
  "unsupported_name",
  /** The output repeated part of our own instructions back. */
  "prompt_leak",
  /** Longer than the opportunity or the document allows. */
  "too_long",
  /** More lines than the section can take. */
  "too_many_items",
  /** Nothing usable came back. */
  "empty",
] as const;

export type WritingFindingKind = (typeof writingFindingKinds)[number];

const findingKindSet: ReadonlySet<string> = new Set(writingFindingKinds);

export function isWritingFindingKind(value: unknown): value is WritingFindingKind {
  return typeof value === "string" && findingKindSet.has(value);
}

/**
 * One reason the output was not accepted.
 *
 * `detail` is the offending fragment and nothing around it — the token, the phrase, the
 * count. Kept short on purpose: a finding exists so this request can be decided and so a
 * failure can be counted, and metering must not become a second copy of a user's career
 * information. A finding is not for persistence.
 */
export type WritingFinding = {
  kind: WritingFindingKind;
  detail: string;
};

export type WritingReview = {
  findings: readonly WritingFinding[];
  /** True when nothing was found. The only question a caller needs to ask. */
  acceptable: boolean;
};

/*
 * Numbers.
 *
 * A run of digits, with thousands separators and a decimal part allowed inside it. Not
 * anchored, because the claim is about the number wherever it appears: "35%", "£1,200",
 * "24/7" and "200 customers" all reduce to digit runs.
 */
const numberPattern = /\d[\d,]*(?:\.\d+)?/g;

/**
 * A digit run reduced to a form two spellings of the same quantity share.
 *
 * `1,200` and `1200` are one number; `03` and `3` are one number; `3.50` and `3.5` are one
 * number. Without this the check would flag a model for reformatting a date the user
 * supplied, which is not a fabrication — it is the reason the writing layer exists.
 */
export function normaliseNumber(raw: string): string {
  const [whole = "", fraction] = raw.replace(/,/g, "").split(".");
  const integral = whole.replace(/^0+(?=\d)/, "");

  if (fraction === undefined) return integral;

  const significant = fraction.replace(/0+$/, "");

  return significant.length === 0 ? integral : `${integral}.${significant}`;
}

function numbersIn(text: string): readonly string[] {
  return [...text.matchAll(numberPattern)].map((match) => normaliseNumber(match[0]));
}

/**
 * Digit runs in the output that no supporting text contains.
 *
 * Exported because the number check is the one part of this module with no judgement in it,
 * and it is worth being able to use and test on its own.
 */
export function unsupportedNumbers(
  text: string,
  support: readonly string[],
): readonly string[] {
  const supported = new Set(support.flatMap((value) => numbersIn(value)));

  return [...new Set(numbersIn(text))].filter((value) => !supported.has(value));
}

/*
 * Names.
 *
 * A word is any run of letters with internal apostrophes or hyphens, so "O'Brien",
 * "Kaiserslautern-Landstuhl" and "NHS" are each one word. Unicode-aware, because the market
 * is global and "Universität" must not become two words at the umlaut.
 */
const wordPattern = /\p{L}[\p{L}'’-]*/gu;
const capitalised = /^\p{Lu}/u;

/**
 * Words that make no claim about the user.
 *
 * Every entry is a capitalised word that can appear in a correct document without asserting
 * anything about someone's history: a month, a salutation, the name of the document itself.
 * That is the test for adding one — not "this came up in testing".
 *
 * This list is the weakest part of the check and the honest way to describe it is as a
 * standing cost: it must be maintained, and each addition widens what passes unexamined.
 */
export const neutralTerms: readonly string[] = [
  /* Calendar. A date the user supplied as "2019-03" is legitimately written "March 2019". */
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "present", "current", "ongoing", "today",

  /* Letters. "Dear Hiring Manager" names nobody and claims nothing. */
  "dear", "sincerely", "faithfully", "yours", "regards", "kind", "best", "sir", "madam",
  "hiring", "manager", "committee", "team", "panel", "admissions", "selection", "chair",
  "professor", "dr", "mr", "mrs", "ms", "to", "whom", "it", "may", "concern",

  /* The documents themselves. */
  "cv", "resume", "résumé", "curriculum", "vitae", "cover", "letter", "statement",
  "application", "portfolio", "reference", "references", "attached", "enclosed",

  /* Pronoun-adjacent words that begin sentences after a colon or a bullet. */
  "i", "my", "the", "a", "an", "this", "these", "as", "with", "and",
];

const neutralTermSet: ReadonlySet<string> = new Set(neutralTerms);

/** True when only whitespace separates two positions — the test for a merged phrase. */
const onlySpaces = (between: string): boolean => /^[ \t]+$/.test(between);

/**
 * Whether a match sits where a capital letter carries no information.
 *
 * The start of the text, the start of a sentence, the start of a bullet, or immediately
 * after an opening quote or bracket. Everything before the match is scanned backwards for
 * the last character that is not whitespace.
 */
function atSentenceStart(text: string, index: number): boolean {
  for (let position = index - 1; position >= 0; position -= 1) {
    const character = text[position] ?? "";

    if (/\s/.test(character)) continue;

    return /[.!?:;•*"'“”(\[\-–—]/.test(character);
  }

  return true;
}

/**
 * Capitalised names and phrases in the output that the user's information does not support.
 *
 * Adjacent unsupported words are merged, so a fabricated "Acme Global Solutions" is one
 * finding rather than three. Comparison is on lowercased words, so a model capitalising a
 * word the user wrote in lower case is not treated as an invention.
 */
export function unsupportedNames(
  text: string,
  support: readonly string[],
): readonly string[] {
  const supported = new Set(
    support.flatMap((value) => [...value.matchAll(wordPattern)].map((m) => m[0].toLowerCase())),
  );

  const phrases: string[] = [];
  let openPhrase: { words: string[]; end: number } | null = null;

  const close = () => {
    if (openPhrase) phrases.push(openPhrase.words.join(" "));
    openPhrase = null;
  };

  for (const match of text.matchAll(wordPattern)) {
    const word = match[0];
    const index = match.index ?? 0;

    const examined =
      word.length > 1 &&
      capitalised.test(word) &&
      !neutralTermSet.has(word.toLowerCase()) &&
      !supported.has(word.toLowerCase()) &&
      !atSentenceStart(text, index);

    if (!examined) {
      close();
      continue;
    }

    if (openPhrase && onlySpaces(text.slice(openPhrase.end, index))) {
      openPhrase.words.push(word);
      openPhrase.end = index + word.length;
      continue;
    }

    close();
    openPhrase = { words: [word], end: index + word.length };
  }

  close();

  return [...new Set(phrases)];
}

const wordCount = (text: string): number => {
  const trimmed = text.trim();

  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
};

export type ReviewOptions = {
  /**
   * Phrases from our own instructions. Output containing one has echoed the contract
   * instead of following it, and the specification forbids exposing internal prompts.
   */
  markers?: readonly string[];
  /** Overrides the context's constraints, for a caller applying a stricter local limit. */
  constraints?: WritingConstraints;
};

/**
 * Check generated output against the context it was generated from.
 *
 * `output` is the text the provider produced, already parsed into its pieces — the lines of
 * a list, the paragraphs of a letter. Length is measured across all of them together,
 * because a word limit belongs to the section rather than to one line of it.
 */
export function reviewOutput(
  context: WritingContext,
  output: readonly string[],
  options: ReviewOptions = {},
): WritingReview {
  const findings: WritingFinding[] = [];
  const constraints = options.constraints ?? context.constraints;
  const usable = output.map((value) => value.trim()).filter((value) => value.length > 0);

  if (usable.length === 0) {
    return { findings: [{ kind: "empty", detail: "no text" }], acceptable: false };
  }

  const support = supportingText(context);
  const combined = usable.join("\n");

  for (const value of unsupportedNumbers(combined, support)) {
    findings.push({ kind: "unsupported_number", detail: value });
  }

  for (const value of unsupportedNames(combined, support)) {
    findings.push({ kind: "unsupported_name", detail: value });
  }

  const lowered = combined.toLowerCase();
  for (const marker of options.markers ?? []) {
    if (marker.length > 0 && lowered.includes(marker.toLowerCase())) {
      findings.push({ kind: "prompt_leak", detail: marker });
    }
  }

  if (constraints.maxWords !== null) {
    const words = wordCount(combined);

    if (words > constraints.maxWords) {
      findings.push({ kind: "too_long", detail: `${words}/${constraints.maxWords} words` });
    }
  }

  if (constraints.maxItems !== null && usable.length > constraints.maxItems) {
    findings.push({
      kind: "too_many_items",
      detail: `${usable.length}/${constraints.maxItems} lines`,
    });
  }

  return { findings, acceptable: findings.length === 0 };
}
