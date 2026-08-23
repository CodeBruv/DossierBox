import { describe, expect, it } from "vitest";
import { buildWritingContext, type WritingContextDraft } from "./context";
import {
  isWritingFindingKind,
  neutralTerms,
  normaliseNumber,
  reviewOutput,
  unsupportedNames,
  unsupportedNumbers,
  writingFindingKinds,
} from "./integrity";

/*
 * The two fabrications the specification names are the tests that matter most here.
 *
 * "I helped customers use the company's software" must not become "Managed a portfolio of 200
 * enterprise customers", and "I reduced the time we spent checking orders" must not become
 * "Reduced processing time by 35%". Both are the same failure — a token in the output that is
 * in no input — and if either of these two assertions ever goes green while the check is
 * broken, the product's central promise is broken with it.
 *
 * The documented gaps are asserted as gaps rather than left silent. A test that pins current
 * behaviour is how the next person finds out that "Over two hundred customers" passes.
 */

const context = (draft: Partial<WritingContextDraft> = {}) =>
  buildWritingContext({
    workload: "achievement_reframing",
    purpose: { objective: "A job", document: "Résumé", family: "Career" },
    ...draft,
  });

const fact = (value: string, label = "Support Assistant") => ({ id: "f1", label, value });

describe("normaliseNumber", () => {
  it("treats two spellings of one quantity as one number", () => {
    expect(normaliseNumber("1,200")).toBe("1200");
    expect(normaliseNumber("03")).toBe("3");
    expect(normaliseNumber("3.50")).toBe("3.5");
    expect(normaliseNumber("3.00")).toBe("3");
    expect(normaliseNumber("0.50")).toBe("0.5");
  });

  it("leaves a plain number alone", () => {
    expect(normaliseNumber("0")).toBe("0");
    expect(normaliseNumber("35")).toBe("35");
    expect(normaliseNumber("2019")).toBe("2019");
  });
});

describe("unsupportedNumbers", () => {
  it("catches the specification's invented percentage", () => {
    expect(
      unsupportedNumbers("Reduced processing time by 35%.", [
        "I reduced the time we spent checking orders",
      ]),
    ).toEqual(["35"]);
  });

  it("catches the specification's invented headcount", () => {
    expect(
      unsupportedNumbers("Managed a portfolio of 200 enterprise customers.", [
        "I helped customers use the company's software",
      ]),
    ).toEqual(["200"]);
  });

  it("accepts a number the user supplied", () => {
    expect(unsupportedNumbers("Reduced checking time by 35%.", ["cut order checking by 35%"])).toEqual(
      [],
    );
  });

  it("accepts the same number written differently", () => {
    expect(unsupportedNumbers("Handled 1200 orders in 2019.", ["1,200 orders, 2019"])).toEqual([]);
    expect(unsupportedNumbers("Rated 3.5 out of 5.", ["scored 3.50 of 05"])).toEqual([]);
  });

  it("reports each invented number once", () => {
    expect(unsupportedNumbers("40 hours, then 40 hours more, then 12.", ["worked shifts"])).toEqual([
      "40",
      "12",
    ]);
  });
});

describe("unsupportedNames", () => {
  it("catches an employer the user never mentioned", () => {
    expect(unsupportedNames("Worked as an analyst at Northwind Traders.", ["analyst, 2019"])).toEqual(
      ["Northwind Traders"],
    );
  });

  it("merges an invented multi-word name into one finding", () => {
    expect(unsupportedNames("Joined the Acme Global Solutions team.", ["joined a company"])).toEqual([
      "Acme Global Solutions",
    ]);
  });

  it("accepts a name the user supplied, however they capitalised it", () => {
    expect(unsupportedNames("Studied at Kaiserslautern University.", ["kaiserslautern university"])).toEqual(
      [],
    );
  });

  it("accepts a month, because a supplied date may be written out", () => {
    expect(unsupportedNames("From March 2019 to Present.", ["2019-03 to now"])).toEqual([]);
  });

  it("accepts a letter's salutation", () => {
    expect(unsupportedNames("Dear Hiring Manager, I am writing to apply.", ["a job"])).toEqual([]);
  });

  it("does not examine a capital at the start of a sentence — a documented gap", () => {
    expect(unsupportedNames("Northwind was my employer.", ["an employer"])).toEqual([]);
    expect(unsupportedNames("Led a team. Northwind trained me.", ["led a team"])).toEqual([]);
  });

  it("does not examine a quantity written as words — a documented gap", () => {
    expect(unsupportedNumbers("Supported over two hundred customers.", ["supported customers"])).toEqual(
      [],
    );
  });

  it("does not treat an inherited property name as a supported word", () => {
    /* `neutralTerms` is looked up through a Set, so a word that happens to name something on
     * Object.prototype is examined like any other. A plain object lookup would pass it. */
    expect(unsupportedNames("Reported to the Constructor board.", ["reported to a board"])).toEqual([
      "Constructor",
    ]);
  });
});

describe("neutralTerms", () => {
  it("holds only lower-case entries, since comparison is lowercased", () => {
    expect(neutralTerms.filter((term) => term !== term.toLowerCase())).toEqual([]);
  });
});

describe("isWritingFindingKind", () => {
  it("accepts the declared kinds and nothing else", () => {
    for (const kind of writingFindingKinds) expect(isWritingFindingKind(kind)).toBe(true);

    expect(isWritingFindingKind("unsupported_qualification")).toBe(false);
    expect(isWritingFindingKind("toString")).toBe(false);
    expect(isWritingFindingKind("constructor")).toBe(false);
    expect(isWritingFindingKind(undefined)).toBe(false);
  });
});

describe("reviewOutput", () => {
  it("accepts output built only from what the user said", () => {
    const review = reviewOutput(
      context({ facts: [fact("Helped customers use the company's software")] }),
      ["Helped customers use the company's software."],
    );

    expect(review.acceptable).toBe(true);
    expect(review.findings).toEqual([]);
  });

  it("refuses the specification's invented statistic", () => {
    const review = reviewOutput(
      context({ facts: [fact("I reduced the time we spent checking orders")] }),
      ["Reduced order-checking time by 35%."],
    );

    expect(review.acceptable).toBe(false);
    expect(review.findings).toEqual([{ kind: "unsupported_number", detail: "35" }]);
  });

  it("treats the destination as support, so a letter may name its recipient", () => {
    const review = reviewOutput(
      context({
        facts: [fact("Helped customers use the company's software")],
        target: { organisation: "Northwind Traders", role: "Support Analyst" },
      }),
      ["I am applying for the Support Analyst role at Northwind Traders."],
    );

    expect(review.acceptable).toBe(true);
  });

  it("does not count a pasted advert's requirements as support", () => {
    /* The notes field is usually somebody else's advertisement. A requirement listed in it is
     * evidence of what the employer wants, never evidence that the user has it — and this is
     * the fabrication most likely to reach a real employer. */
    const review = reviewOutput(
      context({
        facts: [fact("Support work")],
        notes: "Required: AWS certification and Kubernetes experience.",
      }),
      ["I hold an AWS certification."],
    );

    expect(review.acceptable).toBe(false);
    expect(review.findings).toEqual([{ kind: "unsupported_name", detail: "AWS" }]);
  });

  it("does not count the product's own vocabulary as support", () => {
    /* `purpose` is what DossierBox calls the thing, not something the user claimed. A document
     * must not be able to assert "Doctorate" merely because a document family is named one. */
    const review = reviewOutput(
      context({
        purpose: { objective: "A Doctorate", document: "Academic CV", family: "Academic" },
        facts: [fact("Taught undergraduates")],
      }),
      ["Taught undergraduates during my Doctorate."],
    );

    expect(review.acceptable).toBe(false);
    expect(review.findings).toEqual([{ kind: "unsupported_name", detail: "Doctorate" }]);
  });

  it("refuses an echo of our own instructions", () => {
    const review = reviewOutput(context({ facts: [fact("Support work")] }), ["support work"], {
      markers: ["Rules, in order of precedence"],
    });

    expect(review.findings).toEqual([]);

    const leaked = reviewOutput(context({ facts: [fact("Support work")] }), [
      "rules, in order of precedence: support work",
    ], { markers: ["Rules, in order of precedence"] });

    expect(leaked.findings).toEqual([
      { kind: "prompt_leak", detail: "Rules, in order of precedence" },
    ]);
  });

  it("refuses empty output rather than accepting nothing", () => {
    const review = reviewOutput(context({ facts: [fact("Support work")] }), ["", "   "]);

    expect(review.acceptable).toBe(false);
    expect(review.findings).toEqual([{ kind: "empty", detail: "no text" }]);
  });

  it("measures a word limit across the whole output, not per line", () => {
    const words = Array.from({ length: 12 }, () => "alpha");
    const review = reviewOutput(
      context({ facts: [fact("alpha")], constraints: { maxWords: 10 } }),
      [words.slice(0, 6).join(" "), words.slice(6).join(" ")],
    );

    expect(review.findings).toEqual([{ kind: "too_long", detail: "12/10 words" }]);
  });

  it("counts lines against a list limit", () => {
    const review = reviewOutput(
      context({ facts: [fact("alpha")], constraints: { maxItems: 2 } }),
      ["alpha", "alpha", "alpha"],
    );

    expect(review.findings).toEqual([{ kind: "too_many_items", detail: "3/2 lines" }]);
  });

  it("prefers an explicit constraint over the context's own", () => {
    const reviewed = reviewOutput(
      context({ facts: [fact("alpha")], constraints: { maxWords: 2 } }),
      ["alpha alpha alpha"],
      { constraints: { voice: "impersonal", register: "formal", maxWords: 10, maxItems: null } },
    );

    expect(reviewed.acceptable).toBe(true);
  });

  it("reports every reason at once", () => {
    const review = reviewOutput(
      context({ facts: [fact("Support work")], constraints: { maxWords: 3 } }),
      ["Managed 200 accounts at Northwind Traders every quarter without fail."],
    );

    expect(review.findings.map((finding) => finding.kind)).toEqual([
      "unsupported_number",
      "unsupported_name",
      "too_long",
    ]);
  });

  it("keeps findings short enough not to be a second copy of the content", () => {
    const review = reviewOutput(context({ facts: [fact("Support work")] }), [
      "Managed a portfolio of 200 enterprise customers across the Northwind Traders group.",
    ]);

    for (const finding of review.findings) expect(finding.detail.length).toBeLessThan(40);
  });
});
