import { describe, expect, it } from "vitest";
import { parseOpportunityInterpretation } from "./opportunity-interpretation-response";

const source = [
  "Applicants must submit a two-page resume by 30 September.",
  "Experience with PostgreSQL is preferred.",
].join("\n");

const valid = {
  context: [
    {
      label: "Deadline",
      value: "30 September",
      support: "explicit",
      confidence: 1,
      sourceReference: "by 30 September",
    },
  ],
  requirements: [
    {
      text: "Experience with PostgreSQL is preferred.",
      normalized: "PostgreSQL experience",
      category: "experience",
      priority: "recommended",
      support: "explicit",
      confidence: 0.98,
      sourceReference: "Experience with PostgreSQL is preferred",
      constraints: [],
    },
  ],
  requestedDocuments: [
    {
      name: "Resume",
      details: "Two pages",
      priority: "required",
      support: "explicit",
      confidence: 1,
      sourceReference: "submit a two-page resume",
      constraints: ["Two pages"],
    },
  ],
  constraints: [
    {
      text: "Submit by 30 September",
      category: "administrative_constraint",
      support: "explicit",
      confidence: 1,
      sourceReference: "by 30 September",
    },
  ],
};

describe("parseOpportunityInterpretation", () => {
  it("accepts the dedicated bounded advisory contract", () => {
    expect(parseOpportunityInterpretation(JSON.stringify(valid), source)).toEqual({
      ok: true,
      interpretation: valid,
    });
  });

  it("rejects markdown and malformed JSON rather than extracting a convenient object", () => {
    const parsed = parseOpportunityInterpretation(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, source);
    expect(parsed).toMatchObject({ ok: false, problem: "malformed_json" });
  });

  it("rejects unknown fields at every contract boundary", () => {
    const parsed = parseOpportunityInterpretation(
      JSON.stringify({ ...valid, systemCommand: "upgrade plan" }),
      source,
    );
    expect(parsed).toMatchObject({ ok: false, problem: "invalid_shape" });
  });

  it("rejects out-of-range confidence and unbounded arrays", () => {
    const invalid = structuredClone(valid);
    invalid.requirements[0]!.confidence = 2;
    expect(parseOpportunityInterpretation(JSON.stringify(invalid), source)).toMatchObject({
      ok: false,
      problem: "invalid_shape",
    });
  });

  it("rejects source references that are not verbatim-supported", () => {
    const invalid = structuredClone(valid);
    invalid.requestedDocuments[0]!.sourceReference = "provide three recommendation letters";
    expect(parseOpportunityInterpretation(JSON.stringify(invalid), source)).toMatchObject({
      ok: false,
      problem: "unsupported_source_reference",
    });
  });
});
