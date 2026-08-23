/**
 * Reading a provider's answer.
 *
 * Everything a model returns is untrusted input, and the specification's test list names the
 * cases: a malformed response, an unsupported output shape. This module turns raw text into
 * one of five declared shapes or into a reason it could not, and it never throws — a caller
 * deciding between "use this" and "fall back to the user's own words" is served by a value,
 * not by an exception.
 *
 * ## Why this is not a zod schema
 *
 * Zod is already a dependency and is used for the application objective, so the default
 * expectation would be to use it here too. Its value at that boundary is per-field messages
 * for a person filling in a form. No person sees these messages: the only distinctions that
 * matter are "not JSON", "not the requested shape" and "refers to a record we did not send",
 * and each one leads to the same fallback. A hand-written parser states those three
 * distinctions directly, and keeps the fact-id check — which no schema can express, because
 * the valid ids differ per request — in the same place as the shape check.
 *
 * ## Tolerance, and its limit
 *
 * A markdown fence and surrounding commentary are stripped, because refusing a correct answer
 * over punctuation would mean falling back to unimproved text for no reason. Nothing about
 * the *content* is tolerated: a fact id we did not send is a refusal, and every string is
 * trimmed and truncated to a declared ceiling.
 */

import type { WritingContext } from "./context";
import type { PromptDefinition, WritingOutputKind } from "./prompts";

/**
 * Ceilings on what a response may contain.
 *
 * A provider is bounded on the way out as well as on the way in: a model that returns forty
 * thousand words of prose has failed, and truncating it silently would put a document out
 * with a sentence cut in half. These are what the shape check measures against, and a
 * response exceeding them is refused rather than trimmed.
 */
export const responseLimits = {
  /** One block of prose. */
  text: 8_000,
  /** One line of a list, one revision, one finding. */
  line: 1_000,
  /** Lines in any list. */
  items: 24,
  /** Entries in `missing`. */
  missing: 8,
  missingItem: 240,
  /** The raw response, before parsing. */
  raw: 32_000,
} as const;

export const relevanceLevels = ["high", "medium", "low"] as const;

export type RelevanceLevel = (typeof relevanceLevels)[number];

const relevanceSet: ReadonlySet<string> = new Set(relevanceLevels);

export type Revision = { factId: string; text: string };

export type Selection = { factId: string; relevance: RelevanceLevel };

export type Finding = { about: string; issue: string };

/**
 * A parsed response.
 *
 * `missing` is on every shape because the contract puts it there: it is how a model reports
 * that the facts did not support what was asked, which is the alternative to filling the gap.
 * A caller may turn it into a follow-up question — the specification's first response to
 * insufficient information — or ignore it.
 */
export type WritingOutput =
  | { kind: "prose"; text: string; missing: readonly string[] }
  | { kind: "bullets"; bullets: readonly string[]; missing: readonly string[] }
  | { kind: "revisions"; revisions: readonly Revision[]; missing: readonly string[] }
  | { kind: "selection"; selected: readonly Selection[]; missing: readonly string[] }
  | { kind: "findings"; findings: readonly Finding[]; missing: readonly string[] };

export const responseProblems = [
  /** Nothing JSON-shaped in the response at all. */
  "not_json",
  /** Valid JSON, but not the shape the prompt asked for. */
  "wrong_shape",
  /** Refers to a record that was not sent. Either a hallucinated id or a stale request. */
  "unknown_fact",
] as const;

export type ResponseProblem = (typeof responseProblems)[number];

export type ResponseParse =
  | { ok: true; output: WritingOutput }
  | { ok: false; problem: ResponseProblem; detail: string };

/**
 * Output kinds that contain language the integrity check applies to.
 *
 * A selection contains no prose — only ids and a relevance level — so there is nothing to
 * check for fabrication, and its validation is the id-membership check in this module.
 * Findings *are* checked: they quote the documents they are about, and those documents count
 * as supporting text, so a number appearing in a finding that appears in no draft is a
 * fabrication like any other.
 */
const textualKinds: ReadonlySet<WritingOutputKind> = new Set([
  "prose",
  "bullets",
  "revisions",
  "findings",
]);

export function hasGeneratedText(kind: WritingOutputKind): boolean {
  return textualKinds.has(kind);
}

/** The language in an output, for the integrity review. Empty for a selection. */
export function generatedText(output: WritingOutput): readonly string[] {
  switch (output.kind) {
    case "prose":
      return [output.text];
    case "bullets":
      return output.bullets;
    case "revisions":
      return output.revisions.map((revision) => revision.text);
    case "findings":
      return output.findings.map((finding) => `${finding.about} ${finding.issue}`);
    case "selection":
      return [];
  }
}

/*
 * Field access that ignores the prototype chain.
 *
 * `JSON.parse` creates an own `__proto__` property rather than setting one, so a plain read
 * is not itself dangerous — but `record.constructor` on a parsed object resolves to something
 * real, and a shape check that accepts it would pass a response with no `text` field at all.
 */
const field = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A non-empty string within its ceiling. Over the ceiling is a refusal, not a truncation. */
const asText = (value: unknown, limit: number): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length === 0 || trimmed.length > limit ? null : trimmed;
};

const asList = <T>(
  value: unknown,
  maximum: number,
  read: (entry: unknown) => T | null,
): readonly T[] | null => {
  if (!Array.isArray(value) || value.length > maximum) return null;

  const parsed: T[] = [];

  for (const entry of value) {
    const item = read(entry);

    /* One bad entry fails the response. A list silently missing its third line is worse
     * than no list, because nothing downstream can tell that something was dropped. */
    if (item === null) return null;
    parsed.push(item);
  }

  return parsed;
};

/**
 * `missing` is advisory, so a malformed one is dropped rather than failing the response.
 *
 * The asymmetry is deliberate: the *content* is what a document is made of and must be exact,
 * while `missing` only decides whether we ask the user a follow-up question. Losing it costs
 * a prompt for more detail; failing the whole response over it costs the user their document.
 */
const readMissing = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, responseLimits.missing)
    .map((entry) => asText(entry, responseLimits.missingItem))
    .filter((entry): entry is string => entry !== null);
};

/**
 * The JSON object in a response that may be wrapped in other things.
 *
 * Models add fences and preambles. Taking the span from the first `{` to the last `}` handles
 * both without a parser, and anything it produces still has to parse and still has to match
 * the shape — so the tolerance cannot let a malformed response through, only a well-formed
 * one that arrived untidily.
 */
function extractJson(raw: string): Record<string, unknown> | null {
  const bounded = raw.slice(0, responseLimits.raw);
  const start = bounded.indexOf("{");
  const end = bounded.lastIndexOf("}");

  if (start === -1 || end <= start) return null;

  try {
    return asRecord(JSON.parse(bounded.slice(start, end + 1)));
  } catch {
    return null;
  }
}

const wrongShape = (detail: string): ResponseParse => ({
  ok: false,
  problem: "wrong_shape",
  detail,
});

/**
 * Parse a provider response against the shape its prompt asked for.
 *
 * `context` is needed for the fact ids: a revision or a selection naming a record we did not
 * send is refused, which catches both a hallucinated id and a response arriving for a request
 * whose facts have since changed.
 */
export function parseWritingResponse(
  prompt: PromptDefinition,
  context: WritingContext,
  raw: string,
): ResponseParse {
  const record = extractJson(raw);

  if (!record) return { ok: false, problem: "not_json", detail: "no JSON object in response" };

  const missing = readMissing(field(record, "missing"));
  const knownIds = new Set(context.facts.map((fact) => fact.id));

  switch (prompt.output) {
    case "prose": {
      const text = asText(field(record, "text"), responseLimits.text);

      return text === null
        ? wrongShape("text")
        : { ok: true, output: { kind: "prose", text, missing } };
    }

    case "bullets": {
      const bullets = asList(field(record, "bullets"), responseLimits.items, (entry) =>
        asText(entry, responseLimits.line),
      );

      /* Zero lines is a shape failure here, unlike in `findings` below. A section was asked
       * for and nothing came back, so there is no answer to attach — and treating it as a
       * successful empty result would let the caller replace the user's own words with
       * nothing. */
      return bullets === null || bullets.length === 0
        ? wrongShape("bullets")
        : { ok: true, output: { kind: "bullets", bullets, missing } };
    }

    case "revisions": {
      const revisions = asList(field(record, "revisions"), responseLimits.items, (entry) => {
        const item = asRecord(entry);
        if (!item) return null;

        const factId = asText(field(item, "factId"), responseLimits.line);
        const text = asText(field(item, "text"), responseLimits.text);

        return factId === null || text === null ? null : { factId, text };
      });

      if (revisions === null) return wrongShape("revisions");

      const unknown = revisions.find((revision) => !knownIds.has(revision.factId));

      return unknown
        ? { ok: false, problem: "unknown_fact", detail: unknown.factId }
        : { ok: true, output: { kind: "revisions", revisions, missing } };
    }

    case "selection": {
      const selected = asList(field(record, "selected"), responseLimits.items, (entry) => {
        const item = asRecord(entry);
        if (!item) return null;

        const factId = asText(field(item, "factId"), responseLimits.line);
        const relevance = field(item, "relevance");

        return factId === null || typeof relevance !== "string" || !relevanceSet.has(relevance)
          ? null
          : { factId, relevance: relevance as RelevanceLevel };
      });

      if (selected === null) return wrongShape("selected");

      const unknown = selected.find((entry) => !knownIds.has(entry.factId));

      return unknown
        ? { ok: false, problem: "unknown_fact", detail: unknown.factId }
        : { ok: true, output: { kind: "selection", selected, missing } };
    }

    case "findings": {
      const findings = asList(field(record, "findings"), responseLimits.items, (entry) => {
        const item = asRecord(entry);
        if (!item) return null;

        const about = asText(field(item, "about"), responseLimits.line);
        const issue = asText(field(item, "issue"), responseLimits.line);

        return about === null || issue === null ? null : { about, issue };
      });

      /* An empty findings list is the answer when a document is consistent, and the prompt
       * says so — so unlike every other shape, absence here is success. */
      return findings === null
        ? wrongShape("findings")
        : { ok: true, output: { kind: "findings", findings, missing } };
    }
  }
}
