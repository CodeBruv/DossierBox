import { describe, expect, it } from "vitest";
import { buildWritingContext, type WritingContext } from "./context";
import { promptFor } from "./prompts";
/* The parser takes a prompt definition, so it is not part of the public surface — only the
 * orchestration is in a position to call it. The shapes it produces are public. */
import { parseWritingResponse } from "./response";
import {
  generatedText,
  hasGeneratedText,
  relevanceLevels,
  responseLimits,
  writingOutputKinds,
} from "./index";

/*
 * A provider's answer is untrusted input, so these tests are the usual ones for a parser at a
 * trust boundary: the malformed case, the nearly-right case, and the case that is well-formed
 * but refers to something we never sent.
 *
 * The last of those is the interesting one. A revision keyed to a fact id that was not in the
 * request is either a hallucinated identifier or an answer arriving for a request whose facts
 * have since changed, and both would attach generated text to the wrong record. No schema can
 * express that check, which is why it lives in the parser.
 */

const context = (facts: readonly { id: string; label: string; value: string }[] = []): WritingContext =>
  buildWritingContext({
    workload: "resume_tailoring",
    purpose: { objective: "A job", document: "Résumé", family: "Career" },
    facts,
  });

const withFacts = context([
  { id: "work_1", label: "Analyst", value: "did things" },
  { id: "work_2", label: "Assistant", value: "helped out" },
]);

const parse = (workload: Parameters<typeof promptFor>[0], raw: string, ctx = withFacts) =>
  parseWritingResponse(promptFor(workload), ctx, raw);

describe("parseWritingResponse", () => {
  it("reads prose", () => {
    const result = parse("cover_letter_generation", '{"text": "I am applying.", "missing": []}');

    expect(result).toEqual({
      ok: true,
      output: { kind: "prose", text: "I am applying.", missing: [] },
    });
  });

  it("tolerates a markdown fence and surrounding commentary", () => {
    const result = parse(
      "cover_letter_generation",
      'Sure! Here is the letter:\n```json\n{"text": "I am applying."}\n```\nLet me know.',
    );

    expect(result.ok).toBe(true);
  });

  it("refuses a response with no JSON in it at all", () => {
    const result = parse("cover_letter_generation", "I cannot help with that.");

    expect(result).toEqual({ ok: false, problem: "not_json", detail: "no JSON object in response" });
  });

  it("refuses unparseable JSON", () => {
    const result = parse("cover_letter_generation", '{"text": "unterminated}');

    expect(result).toMatchObject({ ok: false, problem: "not_json" });
  });

  it("refuses a JSON array, which has no fields to read", () => {
    const result = parse("cover_letter_generation", '["I am applying."]');

    expect(result).toMatchObject({ ok: false, problem: "not_json" });
  });

  it("refuses prose with no text field", () => {
    expect(parse("cover_letter_generation", '{"missing": ["a role"]}')).toEqual({
      ok: false,
      problem: "wrong_shape",
      detail: "text",
    });
  });

  it("refuses empty prose rather than accepting a blank document section", () => {
    expect(parse("cover_letter_generation", '{"text": "   "}')).toMatchObject({
      problem: "wrong_shape",
    });
  });

  it("refuses prose over the ceiling rather than truncating mid-sentence", () => {
    const long = JSON.stringify({ text: "a".repeat(responseLimits.text + 1) });

    expect(parse("cover_letter_generation", long)).toMatchObject({ problem: "wrong_shape" });
  });

  it("does not read a field from the prototype chain", () => {
    /* `JSON.parse` makes `__proto__` an own property rather than setting one, so this record
     * has no `text` of its own and the response is refused. A shape check reading through the
     * chain would accept it and then render "injected" into a document. */
    const result = parse(
      "cover_letter_generation",
      '{"__proto__": {"text": "injected"}, "bullets": ["a"]}',
    );

    expect(result).toMatchObject({ ok: false, problem: "wrong_shape" });
  });

  it("reads a list of lines", () => {
    const result = parse("achievement_reframing", '{"bullets": ["Did things.", "Helped out."]}');

    expect(result).toEqual({
      ok: true,
      output: { kind: "bullets", bullets: ["Did things.", "Helped out."], missing: [] },
    });
  });

  it("refuses a list with a non-string entry", () => {
    expect(parse("achievement_reframing", '{"bullets": ["Did things.", 7]}')).toMatchObject({
      problem: "wrong_shape",
    });
  });

  it("refuses a list longer than the ceiling", () => {
    const many = JSON.stringify({ bullets: Array.from({ length: responseLimits.items + 1 }, () => "x") });

    expect(parse("achievement_reframing", many)).toMatchObject({ problem: "wrong_shape" });
  });

  it("refuses an empty list, since a section was asked for and nothing came back", () => {
    /* Not symmetrical with `findings` below, deliberately. There, absence is the answer. Here,
     * an empty list accepted as success would let a caller replace the user's own words with
     * nothing at all. */
    expect(parse("achievement_reframing", '{"bullets": []}')).toMatchObject({
      problem: "wrong_shape",
      detail: "bullets",
    });
  });

  it("reads revisions keyed to the facts they replace", () => {
    const result = parse(
      "resume_tailoring",
      '{"revisions": [{"factId": "work_1", "text": "Analysed things."}]}',
    );

    expect(result).toEqual({
      ok: true,
      output: {
        kind: "revisions",
        revisions: [{ factId: "work_1", text: "Analysed things." }],
        missing: [],
      },
    });
  });

  it("refuses a revision for a fact that was never sent", () => {
    const result = parse(
      "resume_tailoring",
      '{"revisions": [{"factId": "work_9", "text": "Led the division."}]}',
    );

    expect(result).toEqual({ ok: false, problem: "unknown_fact", detail: "work_9" });
  });

  it("refuses a revision with no id, which could not be attached to anything", () => {
    expect(parse("resume_tailoring", '{"revisions": [{"text": "Led the division."}]}')).toMatchObject(
      { problem: "wrong_shape" },
    );
  });

  it("reads a selection with its relevance levels", () => {
    const result = parse(
      "experience_relevance_matching",
      '{"selected": [{"factId": "work_2", "relevance": "high"}]}',
    );

    expect(result).toMatchObject({
      ok: true,
      output: { kind: "selection", selected: [{ factId: "work_2", relevance: "high" }] },
    });
  });

  it("refuses a relevance level it does not recognise", () => {
    expect(
      parse("experience_relevance_matching", '{"selected": [{"factId": "work_2", "relevance": "critical"}]}'),
    ).toMatchObject({ problem: "wrong_shape" });
  });

  it("refuses a selection naming a fact that was never sent", () => {
    expect(
      parse("experience_relevance_matching", '{"selected": [{"factId": "work_9", "relevance": "low"}]}'),
    ).toMatchObject({ problem: "unknown_fact", detail: "work_9" });
  });

  it("accepts every declared relevance level", () => {
    for (const relevance of relevanceLevels) {
      expect(
        parse(
          "experience_relevance_matching",
          JSON.stringify({ selected: [{ factId: "work_1", relevance }] }),
        ).ok,
        relevance,
      ).toBe(true);
    }
  });

  it("reads findings", () => {
    const result = parse(
      "document_consistency_review",
      '{"findings": [{"about": "the second paragraph", "issue": "two end dates for one role"}]}',
    );

    expect(result).toMatchObject({ ok: true, output: { kind: "findings" } });
  });

  it("treats no findings as a valid answer, unlike every other shape", () => {
    const result = parse("document_consistency_review", '{"findings": []}');

    expect(result).toEqual({ ok: true, output: { kind: "findings", findings: [], missing: [] } });
  });

  it("reads what the model says it needed", () => {
    const result = parse(
      "cover_letter_generation",
      '{"text": "I am applying.", "missing": ["the organisation", "the role"]}',
    );

    expect(result).toMatchObject({ output: { missing: ["the organisation", "the role"] } });
  });

  it("drops a malformed gap report rather than failing the whole response", () => {
    /* The asymmetry is deliberate: losing `missing` costs a follow-up question, and failing the
     * response costs the user their document. */
    const result = parse("cover_letter_generation", '{"text": "I am applying.", "missing": "a role"}');

    expect(result).toEqual({
      ok: true,
      output: { kind: "prose", text: "I am applying.", missing: [] },
    });
  });

  it("drops unusable entries from a gap report and keeps the rest", () => {
    const result = parse(
      "cover_letter_generation",
      JSON.stringify({ text: "I am applying.", missing: ["a role", 7, "", "x".repeat(500)] }),
    );

    expect(result).toMatchObject({ output: { missing: ["a role"] } });
  });

  it("bounds how much raw response it will scan", () => {
    const buried = `${"noise ".repeat(9_000)}{"text": "I am applying."}`;

    expect(buried.length).toBeGreaterThan(responseLimits.raw);
    expect(parse("cover_letter_generation", buried)).toMatchObject({ problem: "not_json" });
  });
});

describe("hasGeneratedText", () => {
  it("covers every declared output kind", () => {
    for (const kind of writingOutputKinds) expect(typeof hasGeneratedText(kind), kind).toBe("boolean");
  });

  it("excludes a selection, which contains no language", () => {
    expect(hasGeneratedText("selection")).toBe(false);
    expect(hasGeneratedText("prose")).toBe(true);
    expect(hasGeneratedText("bullets")).toBe(true);
    expect(hasGeneratedText("revisions")).toBe(true);
    /* Findings quote the documents they are about, so they are checked like anything else. */
    expect(hasGeneratedText("findings")).toBe(true);
  });
});

describe("generatedText", () => {
  it("returns the language in each shape", () => {
    expect(generatedText({ kind: "prose", text: "one", missing: [] })).toEqual(["one"]);
    expect(generatedText({ kind: "bullets", bullets: ["a", "b"], missing: [] })).toEqual(["a", "b"]);
    expect(
      generatedText({ kind: "revisions", revisions: [{ factId: "work_1", text: "a" }], missing: [] }),
    ).toEqual(["a"]);
    expect(
      generatedText({ kind: "findings", findings: [{ about: "x", issue: "y" }], missing: [] }),
    ).toEqual(["x y"]);
    expect(
      generatedText({ kind: "selection", selected: [{ factId: "work_1", relevance: "high" }], missing: [] }),
    ).toEqual([]);
  });
});
