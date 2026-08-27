import { describe, expect, it } from "vitest";
import { documentType } from "./schema";
import {
  documentTypeKeys,
  documentTypeRegistry,
  plannedDocumentTypeKeys,
  shippingDocumentTypeKeys,
} from "./catalogue";
import {
  compatiblePresentationStyles,
  defaultPresentationStyleFor,
  defaultPresentationStyleIdFor,
  presentationStyleIds,
  presentationStyleList,
  presentationStyles,
  fallbackPresentationStyleId,
  isPresentationStyleId,
  resolvePresentationStyle,
  presentationStylePaperMetrics,
  presentationStyleSuitsType,
} from "./presentation";

/*
 * Three things are being guarded here.
 *
 * 1. The id guard is a *security* boundary, not a formality. It is the only check on the
 *    Presentation Style a configuration form posts into a plain `text` column.
 * 2. The default pairings must not move. Three documents already exist against them, and a
 *    derivation that changed one of them would silently restyle a user's saved document.
 * 3. Every document a user can actually create must have something that can present it.
 *    Asserted from this side because the catalogue is forbidden from importing presentation.
 */

describe("the Presentation Style id guard", () => {
  it("accepts every declared id and nothing else", () => {
    for (const id of presentationStyleIds) {
      expect(isPresentationStyleId(id)).toBe(true);
    }

    expect(isPresentationStyleId("")).toBe(false);
    expect(isPresentationStyleId("Classic")).toBe(false);
    expect(isPresentationStyleId(null)).toBe(false);
    expect(isPresentationStyleId(undefined)).toBe(false);
    expect(isPresentationStyleId(0)).toBe(false);
    expect(isPresentationStyleId({ id: "classic" })).toBe(false);
  });

  /**
   * `value in presentationStyles` walked the prototype chain and answered `true` here. The
   * posted value then passed validation, was stored, and came back out of the record as
   * `Object` — whose `variables` is `undefined` — so the document page threw on every
   * later view. A user could put their own document permanently beyond reach.
   */
  it("refuses an inherited property name", () => {
    expect(isPresentationStyleId("constructor")).toBe(false);
    expect(isPresentationStyleId("toString")).toBe(false);
    expect(isPresentationStyleId("hasOwnProperty")).toBe(false);
    expect(isPresentationStyleId("__proto__")).toBe(false);
  });

  it("resolves an inherited property name to a real Presentation Style", () => {
    for (const name of ["constructor", "toString", "__proto__"]) {
      const resolved = resolvePresentationStyle(name, "professional_cv");

      expect(presentationStyleIds).toContain(resolved.id);
      expect(typeof resolved.variables).toBe("object");
    }
  });
});

describe("Presentation Style declarations", () => {
  it("declares a coherent definition for every id", () => {
    for (const id of presentationStyleIds) {
      const style = presentationStyles[id];

      expect(style.id, "the record key and the definition id must match").toBe(id);
      expect(style.label.length, `${id} needs a label`).toBeGreaterThan(0);
      expect(style.description.length, `${id} needs a description`).toBeGreaterThan(0);
      expect(style.styleCategories.length, `${id} must present something`).toBeGreaterThan(0);
      expect(Object.keys(style.variables).length, `${id} needs variables`).toBeGreaterThan(0);
    }
  });

  /**
   * `bestFor` narrows `styleCategories`; it does not extend it. A style that claims to be
   * designed for something it cannot present would be chosen as a default and then rejected
   * as incompatible by the very next call.
   */
  it("is designed only for categories it can actually present", () => {
    for (const style of presentationStyleList) {
      expect(style.bestFor.length, `${style.id} needs a category it was built for`)
        .toBeGreaterThan(0);

      for (const category of style.bestFor) {
        expect(
          style.styleCategories,
          `${style.id} is designed for ${category} but cannot present it`,
        ).toContain(category);
      }
    }
  });

  /**
   * A style is named for how it reads, never for the reference document it was measured
   * from. Those files are a founder's own CVs; surfacing one in a product label would be
   * both meaningless to a user and a small privacy leak.
   */
  it("describes the look without naming a source file", () => {
    for (const style of presentationStyleList) {
      const text = `${style.label} ${style.description}`.toLowerCase();

      expect(text).not.toContain(".docx");
      expect(text).not.toContain("my styles");
      expect(text).not.toContain("reference");
    }
  });

  it("keeps the offered list in declared order", () => {
    expect(presentationStyleList.map((style) => style.id)).toEqual([...presentationStyleIds]);
  });

  it("contains presentation metadata, not document meaning or composed content", () => {
    for (const style of presentationStyleList) {
      expect(style).not.toHaveProperty("documentType");
      expect(style).not.toHaveProperty("purpose");
      expect(style).not.toHaveProperty("sections");
      expect(style).not.toHaveProperty("evidence");
      expect(style).not.toHaveProperty("requirements");
    }
  });
});

describe("which style may present which document", () => {
  it("agrees with the intersection of the two declarations", () => {
    for (const type of documentTypeKeys) {
      const accepted = documentTypeRegistry[type].styleCategories;

      for (const style of presentationStyleList) {
        const shares = style.styleCategories.some((category) => accepted.includes(category));

        expect(presentationStyleSuitsType(style.id, type)).toBe(shares);
      }
    }
  });

  it("allows one Document Type to use multiple compatible Presentation Styles", () => {
    expect(compatiblePresentationStyles("professional_cv").map((style) => style.id)).toEqual([
      "classic",
      "international",
      "compact",
    ]);
  });

  it("allows one Presentation Style to serve multiple compatible Document Types", () => {
    const typesForClassic = shippingDocumentTypeKeys.filter((type) =>
      presentationStyleSuitsType("classic", type),
    );

    expect(typesForClassic).toEqual([
      "professional_cv",
      "professional_resume",
      "academic_cv",
    ]);
  });

  it("offers compatible styles in the order they are declared", () => {
    for (const type of documentTypeKeys) {
      const compatible = compatiblePresentationStyles(type).map((style) => style.id);

      expect(compatible).toEqual(
        presentationStyleIds.filter((id) => presentationStyleSuitsType(id, type)),
      );
    }
  });

  /**
   * The rule that keeps `defaultPresentationStyleFor` honest, and the reason it is asserted here
   * rather than in the catalogue: the catalogue must not import this layer.
   *
   * It fails the day a `planned` letter or statement is flipped to `shipping` without a
   * style built for it — which is the moment a style is needed, rather than the moment a
   * user opens a letter rendered as a CV.
   */
  it("can present every document a user may create", () => {
    for (const type of shippingDocumentTypeKeys) {
      expect(
        compatiblePresentationStyles(type).length,
        `${type} is offered to users but no style can present it`,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * The gap, stated rather than hidden. All three styles were measured from sectioned
   * career documents, so nothing can present a letter or a statement today. That is
   * precisely why those types are `planned`.
   */
  it("has nothing that can present a letter or a statement yet", () => {
    for (const type of ["cover_letter", "motivation_letter", "research_statement"] as const) {
      expect(compatiblePresentationStyles(type)).toHaveLength(0);
      expect(defaultPresentationStyleIdFor(type)).toBeNull();
      expect(plannedDocumentTypeKeys, `${type} must not be offered`).toContain(type);
    }
  });

  /**
   * The other half of the same fact, and the reason the style picker could start filtering
   * by document type without changing what any user sees: every storable type accepts every
   * style today. If this ever fails, the picker's list has genuinely narrowed — which is the
   * intended behaviour, and worth noticing rather than discovering.
   */
  it("currently offers every style for every document a user can create", () => {
    for (const stored of documentType.enumValues) {
      expect(compatiblePresentationStyles(stored).map((style) => style.id)).toEqual([
        ...presentationStyleIds,
      ]);
    }
  });
});

describe("the Presentation Style a document starts on", () => {
  /**
   * Not a preference — a compatibility guarantee. Three documents already exist in the
   * database against these pairings, and a derivation that produced a different answer
   * would restyle a saved document the next time it was opened.
   */
  it("preserves the pairings the product already shipped", () => {
    expect(defaultPresentationStyleFor("professional_cv")).toBe("classic");
    expect(defaultPresentationStyleFor("professional_resume")).toBe("compact");
    expect(defaultPresentationStyleFor("academic_cv")).toBe("international");
  });

  it("chooses a style that can actually present the document", () => {
    for (const type of documentTypeKeys) {
      const chosen = defaultPresentationStyleIdFor(type);
      if (chosen === null) continue;

      expect(presentationStyleSuitsType(chosen, type), `${type} starts on a style that cannot present it`)
        .toBe(true);
    }
  });

  /** Otherwise a résumé could start on the one style that was never designed for one. */
  it("prefers a style designed for the document over one that merely permits it", () => {
    for (const type of documentTypeKeys) {
      const chosen = defaultPresentationStyleIdFor(type);
      if (chosen === null) continue;

      const accepted = documentTypeRegistry[type].styleCategories;
      const anyDesigned = compatiblePresentationStyles(type).some((style) =>
        style.bestFor.some((category) => accepted.includes(category)),
      );
      if (!anyDesigned) continue;

      expect(
        presentationStyles[chosen].bestFor.some((category) => accepted.includes(category)),
        `${type} starts on a style not designed for it, though one exists`,
      ).toBe(true);
    }
  });

  it("uses the family only to settle a tie", () => {
    /* Both start from `cv` and both have two styles designed for it; family separates them. */
    expect(documentTypeRegistry.professional_cv.family).toBe("career");
    expect(documentTypeRegistry.academic_cv.family).toBe("academic");
    expect(defaultPresentationStyleFor("professional_cv")).not.toBe(defaultPresentationStyleFor("academic_cv"));
  });

  /**
   * The column default and the code fallback must be the same value, or a row written
   * before a style was chosen and a row whose style cannot be resolved would render as two
   * different documents.
   */
  it("falls back to the same style the database column defaults to", () => {
    expect(isPresentationStyleId(fallbackPresentationStyleId)).toBe(true);

    for (const stored of documentType.enumValues) {
      expect(defaultPresentationStyleIdFor(stored), `${stored} should not need the fallback`).not.toBeNull();
    }
  });
});

describe("resolving a stored Presentation Style", () => {
  it("keeps a stored style the user chose", () => {
    for (const stored of documentType.enumValues) {
      for (const style of compatiblePresentationStyles(stored)) {
        expect(resolvePresentationStyle(style.id, stored).id).toBe(style.id);
      }
    }
  });

  it("falls back rather than throwing on anything unrecognised", () => {
    expect(resolvePresentationStyle(undefined, "academic_cv").id).toBe("international");
    expect(resolvePresentationStyle(null, "professional_resume").id).toBe("compact");
    expect(resolvePresentationStyle("", "professional_cv").id).toBe("classic");
    expect(resolvePresentationStyle(42, "professional_cv").id).toBe("classic");
    expect(resolvePresentationStyle("a_style_removed_last_year", "professional_resume").id).toBe("compact");
  });

  /**
   * Nothing can produce this pairing today — all three styles suit all three storable
   * types — so this asserts the guard rather than a current behaviour. It matters the day a
   * style stops serving a category: silently correcting the presentation is far milder than
   * rendering a letter with numbered sections.
   */
  it("ignores a recognised style that does not suit the document", () => {
    const type = "professional_cv" as const;
    const unsuited = presentationStyleList.find((style) => !presentationStyleSuitsType(style.id, type));

    if (unsuited === undefined) {
      expect(compatiblePresentationStyles(type).length).toBe(presentationStyleList.length);
      return;
    }

    expect(resolvePresentationStyle(unsuited.id, type).id).toBe(defaultPresentationStyleFor(type));
  });
});

/**
 * The page box is derived in three places — the full-size preview, the miniature in the
 * create flow, and eventually the PDF page box — which is why it is one function. These
 * assertions exist so a Presentation Style that changes paper cannot change shape in one
 * view only.
 */
describe("presentationStylePaperMetrics", () => {
  it("gives every Presentation Style both dimensions of a real page", () => {
    for (const style of presentationStyleList) {
      const metrics = presentationStylePaperMetrics(style);

      expect(metrics.width).toMatch(/^var\(--ds-page-/);
      expect(metrics.height).toMatch(/^var\(--ds-page-/);
      expect(metrics.width).not.toBe(metrics.height);
    }
  });

  it("follows the Presentation Style's own paper rather than a single default", () => {
    for (const style of presentationStyleList) {
      const metrics = presentationStylePaperMetrics(style);
      const expected = style.paper === "us-letter" ? "us-letter" : "a4";

      expect(metrics.width).toBe(`var(--ds-page-${expected}-w)`);
      expect(metrics.height).toBe(`var(--ds-page-${expected}-h)`);
    }
  });
});
