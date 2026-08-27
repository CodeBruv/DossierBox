/**
 * Presentation styles — the **presentation** layer's vocabulary.
 *
 * A presentation style controls how a document looks. It does not control what the
 * document says: that is the composition layer, and it does not control the facts, which
 * are the dossier's. So a presentation style holds no career information and cannot add,
 * remove or reorder a section. Any of these can render any compatible document type,
 * which is what lets one dossier produce several genuinely different documents.
 *
 * ## Where these came from
 *
 * Three real career documents in `My Templates/` were measured — page size, margins,
 * type family, every paragraph's point size and weight, rule colours, and the
 * before/after spacing on each style — and the measurements are recorded against
 * each presentation style below. That inventory lives here, in the code that uses it,
 * rather than in a separate manifest: the `.docx` files never need parsing again, and a
 * number nobody reads is a number that goes stale.
 *
 * They were not reproduced. Copying one would produce a single hard-coded layout,
 * which is the thing the product must not be. What was taken instead is the
 * *variance* between them, because that variance is the design space:
 *
 * | axis          | Classic          | International      | Compact                 |
 * | ------------- | ---------------- | ------------------ | ----------------------- |
 * | paper         | A4               | A4                 | US Letter               |
 * | margins       | 10mm             | 16/17mm            | 15mm                    |
 * | family        | serif            | sans               | sans                    |
 * | body          | 11.5pt           | 10.5pt             | 10.5pt                  |
 * | headings       | numbered, ruled  | ruled, grey        | ruled, navy             |
 * | dates         | own line, italic | own line, grey     | right-aligned, inline   |
 * | rhythm        | tight            | even               | tight                   |
 * | ink           | black            | black + grey       | navy accent             |
 *
 * ## Why it is shaped like this
 *
 * Nearly every axis is a value rather than a behaviour, so most of a Presentation Style
 * is a set of CSS custom properties applied to the sheet element. That is not a trick:
 * `document-preview.module.css` already redefines inherited properties on the sheet to pin
 * the document palette, and because custom properties inherit, a Presentation Style can
 * redirect type and spacing through the same mechanism without a single global rule being
 * edited or duplicated. Adding a fourth Presentation Style is then a data change.
 *
 * Only the two axes that cannot be expressed as a value — where the date sits in the
 * entry, and whether headings are numbered — are flags. They are flags because they
 * change document structure, and `numberedSections` in particular is a real editorial
 * convention rather than decoration.
 *
 * This is deliberately not a general Presentation Style schema. There is no layout DSL, no
 * column model, no per-section override map, because two of the three references are
 * single-column and the third differs only in date placement. The abstraction stops
 * where the evidence stops; the next reference can widen it.
 *
 * ## Which style may present which document
 *
 * A style declares the *style categories* it serves and a document type declares the
 * categories it accepts; a user chooses from the intersection. Both sides speak the
 * catalogue's vocabulary, so neither has to know the other's list.
 *
 * That is what keeps this layer independent of the document catalogue rather than
 * enumerating it. The pairing a document *starts* on is derived from the same two
 * declarations plus a family preference, so registering a document type does not mean
 * editing a table of defaults here — and registering a style does not mean editing the
 * catalogue.
 *
 * It also states an honest gap. All three styles were measured from sectioned career
 * documents, so all three serve `resume` and `cv` and none serves `letter` or
 * `statement`. A cover letter therefore has *no* compatible style today, which is
 * exactly why it is a `planned` type. `presentation.test.ts` asserts that every *shipping*
 * type has at least one compatible style — asserted from this side, because the catalogue
 * must not import the presentation layer — so the day a letter ships is the day a test
 * demands a letter style rather than the day a user meets a broken page.
 */

import {
  documentTypeFamily,
  documentTypeStyleCategories,
  type DocumentFamilyKey,
  type DocumentStyleCategory,
  type DocumentTypeKey,
} from "./catalogue";
import type { DocumentType } from "./schema";

export const presentationStyleIds = ["classic", "international", "compact"] as const;

export type PresentationStyleId = (typeof presentationStyleIds)[number];

/**
 * Where an entry's dates and location sit.
 *
 * `stacked` gives the title, the organisation and the dates a line each — the
 * traditional CV arrangement, and the one that survives long titles, because
 * nothing has to share a line.
 *
 * `split` puts the dates hard right on the title's line, as a résumé does, so a
 * reader can scan the chronology down the right edge. It costs horizontal room,
 * which is why it is a choice and not the default.
 */
export type DocumentEntryLayout = "stacked" | "split";

export type PresentationStyle = {
  id: PresentationStyleId;
  /** Shown when choosing. Describes the look, never the file it came from. */
  label: string;
  /** One line, in the product's voice: what this is for, not what it contains. */
  description: string;
  paper: "a4" | "us-letter";
  entryLayout: DocumentEntryLayout;
  numberedSections: boolean;
  /**
   * The style categories this system may present.
   *
   * Intersected with a document type's own `styleCategories` to decide what a user may
   * choose. Declaring more than one is normal and not a compromise: the difference
   * between these three is density and date placement, and a reader would accept any of
   * them for either a résumé or a CV.
   */
  styleCategories: readonly DocumentStyleCategory[];
  /**
   * The categories this system was designed *around* — always a subset of
   * `styleCategories`.
   *
   * The distinction is what makes a default derivable. All three serve a résumé; only
   * one was measured from a résumé and puts the dates where a résumé reader looks for
   * them. Without this, "compatible" and "the obvious choice" would be the same
   * question and every new document type would need a hand-written pairing.
   */
  bestFor: readonly DocumentStyleCategory[];
  /**
   * Families this system suits, used only to settle a tie between styles that are
   * equally well designed for the category.
   *
   * A professional CV and an academic CV are both `cv`, so category alone cannot explain
   * why one starts formal and the other starts on the even rhythm. Family can, and it is
   * declared here — on the style, which knows what it was built for — rather than in a
   * table keyed by document type, which would need editing every time the catalogue grows.
   */
  preferredFamilies: readonly DocumentFamilyKey[];
  /**
   * Custom properties set on the sheet. Every one has a fallback in
   * `document-preview.module.css`, so a property omitted here is inherited rather
   * than empty, and a Presentation Style can be partial.
   */
  variables: Readonly<Record<string, string>>;
};

/**
 * Classic — measured from the numbered A4 CV.
 *
 * Source metrics: A4 210×297mm, 10mm margins all round, Times New Roman, body
 * 11.5pt, headings 11–12pt bold uppercase over a 0.5pt rule, 105/48 twentieths
 * before/after, role bold then organisation then italic dates.
 *
 * The 10mm margin was not carried across. On paper it is a deliberate choice to win
 * a page; on screen it makes the measure far too long to read comfortably, and this
 * view is read on screen far more often than it is printed. 20mm keeps the density
 * without the eye strain.
 */
const classic: PresentationStyle = {
  id: "classic",
  label: "Classic",
  description: "Serif type and numbered sections. Formal, dense, and familiar to any reader.",
  paper: "a4",
  entryLayout: "stacked",
  numberedSections: true,
  /* Numbered serif sections read as a CV; a résumé reader would find them ceremonious. */
  styleCategories: ["cv", "resume"],
  bestFor: ["cv"],
  preferredFamilies: ["career"],
  variables: {
    "--doc-family": "var(--ds-font-document)",
    "--doc-margin": "20mm",
    "--doc-body-size": "11pt",
    "--doc-line-height": "1.34",
    "--doc-name-size": "17pt",
    "--doc-name-tracking": "0",
    "--doc-section-size": "11pt",
    "--doc-section-tracking": "0.04em",
    /* The reference's rule is a blue-grey at 0.5pt; kept, at document-ink strength. */
    "--doc-section-rule": "0.75pt solid var(--ds-document-ink)",
    "--doc-section-gap": "1.35em",
    "--doc-entry-gap": "0.8em",
    "--doc-meta-style": "italic",
  },
};

/**
 * International — measured from the three-page international CV.
 *
 * Source metrics: A4, 16mm top/bottom and 17mm left/right, Calibri, body 10.5pt,
 * headings 11.5pt bold uppercase over a #999999 rule, name 17pt with heavy
 * letter-spacing, and — the characteristic detail — a uniform 144 twentieths (7.2pt)
 * of space after almost every paragraph.
 *
 * That uniform spacing is the whole identity of this one. It reads as unhurried and
 * evenly weighted, which suits a document that will be read by someone unfamiliar
 * with the writer's market and given more than a six-second scan.
 */
const international: PresentationStyle = {
  id: "international",
  label: "International",
  description: "Even spacing and a wide margin. Built to be read carefully, across markets.",
  paper: "a4",
  entryLayout: "stacked",
  numberedSections: false,
  styleCategories: ["cv", "resume"],
  bestFor: ["cv"],
  /* The unhurried rhythm is for a reader outside the writer's own market. */
  preferredFamilies: ["academic", "international"],
  variables: {
    "--doc-family": "var(--ds-font-document-sans)",
    "--doc-margin": "17mm",
    "--doc-body-size": "10.5pt",
    "--doc-line-height": "1.4",
    "--doc-name-size": "17pt",
    "--doc-name-tracking": "0.06em",
    "--doc-section-size": "11pt",
    "--doc-section-tracking": "0.06em",
    "--doc-section-rule": "0.5pt solid var(--ds-document-rule)",
    "--doc-section-gap": "1.6em",
    "--doc-entry-gap": "1em",
    "--doc-meta-style": "normal",
  },
};

/**
 * Compact — measured from the two-page US Letter résumé.
 *
 * Source metrics: US Letter 8.5×11in, 15mm margins, Calibri, body 10.5pt, name 17pt
 * in navy #1F3864, headings 11.5pt over a navy rule, a bold headline line under the
 * name, technical skills placed above experience, and dates set flush right on the
 * role line via a right tab stop at 7.61in.
 *
 * The navy is the only colour in any of the three references, and it is doing real
 * work: it marks the name and every section rule without adding a second typeface or
 * a background. It is kept as an accent on those two things alone — body text stays
 * black, because a coloured paragraph reads as a web page.
 *
 * Section order is not set here. Which sections appear and in what order belongs to
 * the composition layer, and `professional_resume` already leads with skills.
 */
const compact: PresentationStyle = {
  id: "compact",
  label: "Compact",
  description: "Tight rhythm with dates set flush right. Made to be scanned quickly.",
  paper: "us-letter",
  entryLayout: "split",
  numberedSections: false,
  styleCategories: ["resume", "cv"],
  /* The only one measured from a résumé, and the only one that sets dates flush right. */
  bestFor: ["resume"],
  preferredFamilies: ["career"],
  variables: {
    "--doc-family": "var(--ds-font-document-sans)",
    "--doc-margin": "15mm",
    "--doc-body-size": "10.5pt",
    "--doc-line-height": "1.32",
    "--doc-name-size": "18pt",
    "--doc-name-tracking": "0.01em",
    "--doc-name-ink": "var(--ds-document-accent)",
    "--doc-section-size": "10.5pt",
    "--doc-section-tracking": "0.05em",
    "--doc-section-rule": "0.75pt solid var(--ds-document-accent)",
    "--doc-section-ink": "var(--ds-document-accent)",
    "--doc-section-gap": "1.15em",
    "--doc-entry-gap": "0.7em",
    "--doc-meta-style": "normal",
  },
};

export const presentationStyles: Readonly<Record<PresentationStyleId, PresentationStyle>> = {
  classic,
  international,
  compact,
};

/** In the order they are offered. Stable, so the choice list does not reshuffle. */
export const presentationStyleList: readonly PresentationStyle[] = presentationStyleIds.map(
  (id) => presentationStyles[id],
);

/**
 * A `Set`, not `value in presentationStyles`.
 *
 * `in` walks the prototype chain, so it answered `true` for `"constructor"` — and this
 * guard is the only check on the presentation style a document-configuration form posts.
 * A posted `"constructor"` therefore passed validation, was stored in a plain `text`
 * column, and came back out of `presentationStyles` as `Object`, whose `variables` is
 * `undefined`:
 * the document page then threw on every subsequent view. A user could put their own
 * document permanently beyond reach, and a shared preview would have carried the same
 * fault to its reader.
 */
const presentationStyleIdSet: ReadonlySet<string> = new Set(presentationStyleIds);

export function isPresentationStyleId(value: unknown): value is PresentationStyleId {
  return typeof value === "string" && presentationStyleIdSet.has(value);
}

/**
 * The page box a presentation style prints on, as design-token references.
 *
 * Stated once, here, because three places need it and they must agree: the preview sets
 * the sheet's measure from `width`, the create flow's miniature needs both to keep a page
 * the right shape at a reduced size, and the PDF page box will need both again. A second
 * `paper === "us-letter" ? … : …` somewhere else is how a US Letter document ends up
 * rendered on A4 in one view and not the other.
 */
export function presentationStylePaperMetrics(style: PresentationStyle): {
  width: string;
  height: string;
} {
  return style.paper === "us-letter"
    ? { width: "var(--ds-page-us-letter-w)", height: "var(--ds-page-us-letter-h)" }
    : { width: "var(--ds-page-a4-w)", height: "var(--ds-page-a4-h)" };
}

/** Whether a style may present a type at all — the categories they share. */
export function presentationStyleSuitsType(
  id: PresentationStyleId,
  type: DocumentTypeKey,
): boolean {
  const accepted = documentTypeStyleCategories(type);

  return presentationStyles[id].styleCategories.some((category) => accepted.includes(category));
}

/**
 * The styles a user may choose for a document type, in the order they are offered.
 *
 * Empty is a legitimate answer, and an informative one: it means no style has been built
 * for that kind of document yet. Callers must handle it rather than assume a first
 * element — which is why nothing offers a `planned` type in the first place.
 */
export function compatiblePresentationStyles(type: DocumentTypeKey): readonly PresentationStyle[] {
  return presentationStyleList.filter((style) => presentationStyleSuitsType(style.id, type));
}

/**
 * The style a document type starts on, derived rather than tabulated.
 *
 * Three declarations decide it, in order: the categories a style serves narrow the field
 * to what *may* present this document; `bestFor` narrows it to what was designed for it;
 * `preferredFamilies` settles a remaining tie. Whatever survives first in offering order
 * wins.
 *
 * `null` when nothing is compatible. That is a real state — no style presents a letter
 * today — and returning it plainly is better than inventing a pairing that would render a
 * letter as though it had sections.
 */
export function defaultPresentationStyleIdFor(
  type: DocumentTypeKey,
): PresentationStyleId | null {
  const compatible = compatiblePresentationStyles(type);
  if (compatible.length === 0) return null;

  const accepted = documentTypeStyleCategories(type);
  const designed = compatible.filter((style) =>
    style.bestFor.some((category) => accepted.includes(category)),
  );
  const shortlist = designed.length > 0 ? designed : compatible;
  const family = documentTypeFamily(type).key;
  const chosen = shortlist.find((style) => style.preferredFamilies.includes(family));

  return (chosen ?? shortlist[0]).id;
}

/**
 * The style used when a document's own type yields nothing.
 *
 * Deliberately the same value as the legacy `documents.template` column default, so a row
 * written before a Presentation Style was chosen and a row whose type has no style resolve
 * to the same document rather than to two different ones.
 */
export const fallbackPresentationStyleId: PresentationStyleId = "classic";

/**
 * The presentation style a storable document type starts on.
 *
 * Narrower than {@link defaultPresentationStyleIdFor} on purpose: this is the signature
 * the repository and the create flow use, and they need a style rather than a `null` to
 * handle. Every type they can pass has a compatible style — `presentation.test.ts` fails
 * if one ever does not — so the fallback is unreachable in practice and present only so a
 * data slip degrades the look of a document instead of preventing it from opening.
 */
export function defaultPresentationStyleFor(type: DocumentType): PresentationStyleId {
  return defaultPresentationStyleIdFor(type) ?? fallbackPresentationStyleId;
}

/**
 * Resolves a stored presentation-style id.
 *
 * Falls back rather than throwing, because the id comes out of a database column
 * that a later migration could widen or a rolled-back deployment could narrow. An
 * unrecognised value means the document renders in a different style than intended;
 * an exception here would mean the user cannot open their document at all.
 *
 * A *recognised* id that does not suit the document's type falls back too. Nothing can
 * produce that pairing today — all three styles suit all three storable types — but a
 * document stored against a style that later stops serving its category would otherwise
 * render as the wrong kind of document, and silently correcting the presentation is far
 * milder than showing a letter with numbered sections.
 */
export function resolvePresentationStyle(
  value: unknown,
  type: DocumentType,
): PresentationStyle {
  const stored =
    isPresentationStyleId(value) && presentationStyleSuitsType(value, type) ? value : null;

  return presentationStyles[stored ?? defaultPresentationStyleFor(type)];
}
