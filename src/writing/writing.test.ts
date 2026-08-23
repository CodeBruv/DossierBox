import { describe, expect, it } from "vitest";
import { chargeableUnits } from "@/entitlements/usage";
import { contentMarker } from "./context";
import { describeOutcome, requestWriting, type WritingActor, type WritingOutcome } from "./index";
import type { ProviderRequest, ProviderResult, WritingProvider } from "./index";

/*
 * These are the tests for the chain the specification insists on:
 *
 *     Engine → Context → AI writing assistance → Validation → Document renderer
 *
 * So they are less about what a model produces than about what cannot get past this function.
 * Four properties matter, and each is asserted directly rather than inferred:
 *
 *   1. A request that cannot succeed costs nothing — no provider call, nothing charged.
 *   2. A provider never receives anything but a rendered, bounded, fenced context.
 *   3. Text that is not supported by the user's own facts does not come back as usable.
 *   4. A failure of any kind leaves the caller holding the user's own words, not a substitute.
 *
 * The default provider is `unavailableProvider`, so the no-model path is the one a caller gets
 * by accident. That is tested too — it is the state the product is actually in.
 */

const actor: WritingActor = { userId: "user_1", plan: "plus" };

const at = new Date("2026-02-01T09:00:00.000Z");

const fact = (value: string, id = "f1", label = "Support Assistant") => ({ id, label, value });

const section = { key: "experience", heading: "Experience", layout: "bullets" } as const;

/** A provider that answers with fixed text and records what it was asked. */
const answering = (...texts: string[]) => {
  const calls: ProviderRequest[] = [];

  const provider: WritingProvider = {
    id: "test",
    model: "test-1",
    complete: async (request) => {
      calls.push(request);

      return {
        ok: true,
        text: texts[Math.min(calls.length - 1, texts.length - 1)] ?? "",
        model: "test-1",
        inputTokens: 100,
        outputTokens: 20,
      } satisfies ProviderResult;
    },
  };

  return { provider, calls };
};

const run = (
  draft: Parameters<typeof requestWriting>[0],
  provider?: WritingProvider,
): Promise<WritingOutcome> => requestWriting(draft, actor, { provider, now: at });

const reframe = (overrides: Partial<Parameters<typeof requestWriting>[0]> = {}) => ({
  workload: "achievement_reframing" as const,
  purpose: { objective: "A job", document: "Résumé", family: "Career" },
  facts: [fact("Helped customers use the company's software")],
  section,
  ...overrides,
});

describe("requestWriting", () => {
  it("returns validated text, with the work metered against the user", async () => {
    const { provider, calls } = answering(
      '{"bullets": ["Helped customers use the company\'s software."]}',
    );

    const outcome = await run(reframe(), provider);

    expect(outcome.status).toBe("written");
    expect(outcome).toMatchObject({
      workload: "achievement_reframing",
      promptId: "achievement_reframing@1",
      output: { kind: "bullets", bullets: ["Helped customers use the company's software."] },
    });
    expect(calls).toHaveLength(1);

    expect(outcome.usage).toMatchObject({
      userId: "user_1",
      plan: "plus",
      workload: "achievement_reframing",
      outcome: "succeeded",
      /* One unit, because restating an achievement is the cheapest workload in the table —
       * asserted so that a change to the weights has to be a deliberate one. */
      estimatedUnits: 1,
      units: 1,
      provider: "test",
      model: "test-1",
      providerCost: { inputTokens: 100, outputTokens: 20 },
      occurredAt: at,
    });
    expect(chargeableUnits(outcome.usage)).toBe(1);
  });

  it("fingerprints the request, so the same work is recognisable", async () => {
    const first = await run(reframe(), answering('{"bullets": ["Helped customers."]}').provider);
    const second = await run(reframe(), answering('{"bullets": ["Helped customers."]}').provider);

    if (first.status !== "written" || second.status !== "written") throw new Error("not written");

    expect(first.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("records what the model said it needed, without refusing the text over it", async () => {
    const { provider } = answering(
      '{"bullets": ["Helped customers."], "missing": ["the size of the team"]}',
    );

    const outcome = await run(reframe(), provider);

    expect(outcome).toMatchObject({ status: "written", missing: ["the size of the team"] });
  });

  it("stops before the provider when the prompt's requirements are not met", async () => {
    const { provider, calls } = answering('{"bullets": ["Helped customers."]}');

    const outcome = await run(reframe({ section: null }), provider);

    expect(outcome).toMatchObject({ status: "insufficient", missing: ["section"] });
    /* The point of the check: an impossible request must not cost a call or a unit. */
    expect(calls).toEqual([]);
    expect(outcome.usage.outcome).toBe("failed");
    expect(chargeableUnits(outcome.usage)).toBe(0);
  });

  it("reports every unmet requirement, so one round trip fixes all of them", async () => {
    const outcome = await run(reframe({ facts: [], section: null }));

    expect(outcome).toMatchObject({ status: "insufficient", missing: ["facts", "section"] });
  });

  it("declines when there is no provider, which is the product's current state", async () => {
    /* No provider argument at all — the default is `unavailableProvider`, so this is what a
     * caller gets today. The document must still be composable from the user's own words. */
    const outcome = await requestWriting(reframe(), actor, { now: at });

    expect(outcome).toMatchObject({
      status: "declined",
      cause: "provider",
      failure: "unavailable",
    });
    expect(outcome.usage).toMatchObject({ outcome: "failed", provider: "unavailable", model: null });
    expect(chargeableUnits(outcome.usage)).toBe(0);
  });

  it("declines an answer it cannot read, keeping the provider's attribution", async () => {
    const { provider } = answering("I would rather not.");

    const outcome = await run(reframe(), provider);

    expect(outcome).toMatchObject({ status: "declined", cause: "response", problem: "not_json" });
    /* The provider did the work and may have billed us for it, so the record keeps its
     * attribution — but the user asked for help and did not get it, so it is not charged. */
    expect(outcome.usage).toMatchObject({ outcome: "failed", provider: "test", model: "test-1" });
    expect(chargeableUnits(outcome.usage)).toBe(0);
  });

  it("declines an answer keyed to a fact that was never sent", async () => {
    const { provider } = answering(
      '{"revisions": [{"factId": "invented_9", "text": "Led the division."}]}',
    );

    const outcome = await run(
      {
        workload: "resume_tailoring",
        purpose: { objective: "A job", document: "Résumé", family: "Career" },
        facts: [fact("Helped customers use the company's software")],
      },
      provider,
    );

    expect(outcome).toMatchObject({
      status: "declined",
      cause: "response",
      problem: "unknown_fact",
    });
  });

  it("refuses an invented statistic rather than writing it into a document", async () => {
    const { provider } = answering('{"bullets": ["Reduced processing time by 35%."]}');

    const outcome = await run(
      reframe({ facts: [fact("I reduced the time we spent checking orders")] }),
      provider,
    );

    expect(outcome).toMatchObject({
      status: "declined",
      cause: "review",
      findings: [{ kind: "unsupported_number", detail: "35" }],
    });
    expect(chargeableUnits(outcome.usage)).toBe(0);
  });

  it("refuses an invented employer", async () => {
    const { provider } = answering('{"bullets": ["Supported customers at Northwind Traders."]}');

    const outcome = await run(reframe(), provider);

    expect(outcome).toMatchObject({
      status: "declined",
      cause: "review",
      findings: [{ kind: "unsupported_name", detail: "Northwind Traders" }],
    });
  });

  it("refuses a credential the advert asked for and the user never claimed", async () => {
    /* The whole chain, on the failure that matters most. A pasted advertisement reaches the
     * provider — a model has to know what is being asked for — but nothing in it is evidence
     * about the user, so a document cannot come back claiming it. */
    const { provider, calls } = answering('{"bullets": ["Holds an AWS certification."]}');

    const outcome = await run(
      reframe({ notes: "Required: an AWS certification and three years of support experience." }),
      provider,
    );

    expect(calls[0]?.input).toContain("AWS certification");
    expect(outcome).toMatchObject({
      status: "declined",
      cause: "review",
      findings: [{ kind: "unsupported_name", detail: "AWS" }],
    });
  });

  it("refuses an echo of its own instructions", async () => {
    const { provider } = answering(
      '{"bullets": ["Rules, in order of precedence: helped customers."]}',
    );

    const outcome = await run(reframe(), provider);

    expect(outcome).toMatchObject({ status: "declined", cause: "review" });
    if (outcome.status !== "declined" || outcome.cause !== "review") throw new Error("not review");
    expect(outcome.findings.map((finding) => finding.kind)).toContain("prompt_leak");
  });

  it("enforces the word limit the workload itself sets", async () => {
    /* `cover_letter_generation` defaults to 350 words. The model is told the limit and the
     * answer is measured against the same number — the two coming from one place is the point. */
    const { provider, calls } = answering(
      JSON.stringify({ text: Array.from({ length: 400 }, () => "alpha").join(" ") }),
    );

    const outcome = await requestWriting(
      {
        workload: "cover_letter_generation",
        purpose: { objective: "A job", document: "Cover letter", family: "Career" },
        facts: [fact("alpha")],
      },
      actor,
      { provider, now: at },
    );

    expect(calls[0]?.input).toContain("Maximum words: 350");
    expect(outcome).toMatchObject({
      status: "declined",
      cause: "review",
      findings: [{ kind: "too_long", detail: "400/350 words" }],
    });
  });

  it("lets the caller tighten or loosen that limit, end to end", async () => {
    /* Precedence proven through the whole function: the caller's number is what the model is
     * told and what the answer is measured against. An opportunity with a 500-word allowance
     * must not be refused by our own default. */
    const { provider, calls } = answering(
      JSON.stringify({ text: Array.from({ length: 400 }, () => "alpha").join(" ") }),
    );

    const outcome = await requestWriting(
      {
        workload: "cover_letter_generation",
        purpose: { objective: "A job", document: "Cover letter", family: "Career" },
        facts: [fact("alpha")],
        constraints: { maxWords: 500 },
      },
      actor,
      { provider, now: at },
    );

    expect(calls[0]?.input).toContain("Maximum words: 500");
    expect(outcome.status).toBe("written");
  });

  it("does not review a selection, which contains no language to check", async () => {
    /* A selection is fact ids and relevance levels. Reviewing it would find no text and
     * refuse the request for being empty. */
    const { provider } = answering('{"selected": [{"factId": "f1", "relevance": "high"}]}');

    const outcome = await run(
      {
        workload: "experience_relevance_matching",
        purpose: { objective: "A job", document: "Résumé", family: "Career" },
        facts: [fact("Helped customers use the company's software")],
      },
      provider,
    );

    expect(outcome).toMatchObject({
      status: "written",
      output: { kind: "selection", selected: [{ factId: "f1", relevance: "high" }] },
    });
  });

  it("accepts a review that found nothing wrong", async () => {
    /* An empty findings list is the answer to "is this document consistent?", and for a while
     * this function declined it as empty output. A user whose document is fine must be told so. */
    const { provider } = answering('{"findings": []}');

    const outcome = await run(
      {
        workload: "document_consistency_review",
        purpose: { objective: "A job", document: "Résumé", family: "Career" },
        drafts: [{ id: "d1", document: "Résumé", text: "Helped customers. 2019 to 2021." }],
      },
      provider,
    );

    expect(outcome).toMatchObject({
      status: "written",
      output: { kind: "findings", findings: [] },
    });
  });

  it("reads existing documents when a workload has no facts to work from", async () => {
    const { provider, calls } = answering(
      '{"findings": [{"about": "the dates", "issue": "two end dates for one role"}]}',
    );

    const outcome = await run(
      {
        workload: "document_consistency_review",
        purpose: { objective: "A job", document: "Résumé", family: "Career" },
        drafts: [{ id: "d1", document: "Résumé", text: "Helped customers. 2019 to 2021." }],
      },
      provider,
    );

    expect(calls[0]?.input).toContain("document d1 — Résumé");
    expect(outcome.status).toBe("written");
  });

  it("charges the heavier workloads more", async () => {
    const { provider } = answering(
      '{"findings": [{"about": "the dates", "issue": "two end dates for one role"}]}',
    );

    const outcome = await run(
      {
        workload: "application_set_alignment",
        purpose: { objective: "A job", document: "Résumé", family: "Career" },
        drafts: [
          { id: "d1", document: "Résumé", text: "Helped customers." },
          { id: "d2", document: "Cover letter", text: "I helped customers." },
        ],
      },
      provider,
    );

    expect(outcome.usage.workload).toBe("application_set_alignment");
    expect(outcome.usage.units).toBeGreaterThan(1);
  });
});

describe("what the provider is given", () => {
  it("receives the contract, not the caller's arguments", async () => {
    const { provider, calls } = answering('{"bullets": ["Helped customers."]}');

    await run(reframe(), provider);

    const request = calls[0];

    expect(request?.system).toContain("Rules, in order of precedence");
    expect(request?.system).toContain("Never introduce a number");
    expect(request?.system).toContain(contentMarker);
    expect(request?.maxOutputCharacters).toBeGreaterThan(0);
  });

  it("receives the facts fenced, and nothing that was not in the context", async () => {
    const { provider, calls } = answering('{"bullets": ["Helped customers."]}');

    await run(reframe(), provider);

    const input = calls[0]?.input ?? "";

    expect(input).toContain("fact f1 — Support Assistant");
    expect(input).toContain(contentMarker);
    /* The actor is metering information. A user id in a prompt is a privacy leak with no
     * possible benefit to the writing. */
    expect(input).not.toContain("user_1");
    expect(input).not.toContain("plus");
  });

  it("bounds the context however much the caller passes in", async () => {
    const { provider } = answering('{"bullets": ["Helped customers."]}');

    const outcome = await run(
      reframe({
        facts: Array.from({ length: 80 }, (_, index) =>
          fact("x".repeat(5_000), `f${index}`, "Assistant"),
        ),
        notes: "n".repeat(9_000),
      }),
      provider,
    );

    /* The context that was assembled is capped regardless of the dossier's size, so a request
     * cannot be a function of how much career history somebody happens to have entered. */
    expect(outcome.context.facts).toHaveLength(40);
    expect(outcome.context.facts[0]?.value).toHaveLength(2_000);
    expect(outcome.context.notes).toHaveLength(2_000);
  });

  it("refuses a context too large to send rather than quietly truncating it", async () => {
    /* Forty facts of two thousand characters is a legal context and still far over a provider's
     * input ceiling, so the request is refused before it is sent. This is the honest failure:
     * fact *selection* is the engine's job — `experience_relevance_matching` exists for it — and
     * silently dropping half a career history to fit would produce a document missing the part
     * that mattered, with nothing to indicate it. */
    const { provider, calls } = answering('{"bullets": ["Helped customers."]}');

    const outcome = await run(
      reframe({
        facts: Array.from({ length: 80 }, (_, index) =>
          fact("x".repeat(5_000), `f${index}`, "Assistant"),
        ),
      }),
      provider,
    );

    expect(outcome).toMatchObject({
      status: "declined",
      cause: "provider",
      failure: "oversized",
    });
    expect(calls).toEqual([]);
    expect(chargeableUnits(outcome.usage)).toBe(0);
  });
});

describe("describeOutcome", () => {
  it("names the prompt and the outcome and nothing else", async () => {
    const written = await run(reframe(), answering('{"bullets": ["Helped customers."]}').provider);

    expect(describeOutcome(written)).toBe("achievement_reframing@1 written");
  });

  it("says what was missing", async () => {
    const outcome = await run(reframe({ section: null }));

    expect(describeOutcome(outcome)).toBe("achievement_reframing@1 insufficient: missing section");
  });

  it("distinguishes the three ways a request can be declined", async () => {
    const noProvider = await requestWriting(reframe(), actor, { now: at });
    const unreadable = await run(reframe(), answering("no.").provider);
    const unsupported = await run(
      reframe(),
      answering('{"bullets": ["Managed 200 accounts."]}').provider,
    );

    expect(describeOutcome(noProvider)).toBe(
      "achievement_reframing@1 declined: provider unavailable",
    );
    expect(describeOutcome(unreadable)).toBe("achievement_reframing@1 declined: response not_json");
    expect(describeOutcome(unsupported)).toBe(
      "achievement_reframing@1 declined: review unsupported_number",
    );
  });

  it("carries no part of the document, because a log line must not", async () => {
    const outcome = await run(
      reframe({ facts: [fact("Supported the retail team at Northwind")] }),
      answering(
        '{"bullets": ["Managed a portfolio of 200 enterprise customers at Contoso Global."]}',
      ).provider,
    );

    const line = describeOutcome(outcome);

    expect(line).not.toContain("portfolio");
    expect(line).not.toContain("Contoso");
    expect(line).not.toContain("Northwind");
    expect(line).toContain("unsupported_number");
  });

  it("reports each reason once, however many times it occurred", async () => {
    const outcome = await run(
      reframe(),
      answering('{"bullets": ["Managed 200 accounts.", "Closed 40 tickets."]}').provider,
    );

    expect(describeOutcome(outcome)).toBe(
      "achievement_reframing@1 declined: review unsupported_number",
    );
  });
});
