import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_BREAK_ID,
  contentOrderFromArrangement,
  createClonedPageBreakId,
  normalizeArrangement,
  pageBreaksFromArrangement,
} from "./arrangement";

const content = ["summary", "experience", "skills"] as const;

describe("heterogeneous document arrangement", () => {
  it("adds exactly one default Page Break to a new content-only arrangement", () => {
    const arrangement = normalizeArrangement([], content);

    expect(arrangement).toEqual([
      "summary",
      "experience",
      "skills",
      DEFAULT_PAGE_BREAK_ID,
    ]);
    expect(pageBreaksFromArrangement(arrangement)).toEqual([
      DEFAULT_PAGE_BREAK_ID,
    ]);
  });

  it("preserves an explicit heterogeneous order as the authoritative order", () => {
    const arrangement = normalizeArrangement(
      ["experience", "page-break:skills", "skills"],
      content,
    );

    expect(arrangement).toEqual([
      "experience",
      "page-break:skills",
      "skills",
      "summary",
    ]);
    expect(contentOrderFromArrangement(arrangement)).toEqual([
      "experience",
      "skills",
      "summary",
    ]);
  });

  it("migrates legacy break-before values at the rendered position", () => {
    const arrangement = normalizeArrangement(
      ["summary", "experience", "skills"],
      content,
      ["skills"],
    );

    expect(arrangement).toEqual([
      "summary",
      "experience",
      "page-break:skills",
      "skills",
    ]);
  });

  it("keeps migration idempotent after the result becomes the saved arrangement", () => {
    const migrated = normalizeArrangement(
      ["summary", "experience", "skills"],
      content,
      ["skills"],
    );

    expect(normalizeArrangement(migrated, content, ["skills"])).toEqual(
      migrated,
    );
  });

  it("creates a distinct deterministic clone without reusing existing IDs", () => {
    expect(
      createClonedPageBreakId([
        "page-break:default",
        "page-break:copy-1",
        "page-break:copy-2",
      ]),
    ).toBe("page-break:copy-3");
  });

  it("deduplicates repeated arrangement items while retaining known content", () => {
    expect(
      normalizeArrangement(
        ["experience", "experience", "page-break:one", "page-break:one"],
        content,
      ),
    ).toEqual([
      "experience",
      "page-break:one",
      "summary",
      "skills",
    ]);
  });
});
