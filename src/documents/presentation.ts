/**
 * How a document looks.
 *
 * This is the **presentation** layer in the chain
 * `dossier → composition → presentation`. Composition decided which sections a
 * document shows and what each entry's lines say; nothing here can change that.
 * What lives here is the visual identity of a document family: its paper, its
 * type, its rhythm, and — new in this pass — the *architecture* of its header,
 * its section headings and its entries.
 *
 * ---------------------------------------------------------------------------
 * Why this file grew structural fields
 * ---------------------------------------------------------------------------
 * The first version of this layer expressed a template as a bag of CSS custom
 * properties and two behaviour flags. It worked, and it was not enough: the three
 * styles differed almost entirely by scalar type values — 11pt against 10.5pt,
 * 1.34 line-height against 1.4, 20mm of margin against 17mm — and deltas that
 * small sit below the threshold at which anyone notices a change. Two of the three
 * shared a font. All three rendered a byte-identical header. Only one of the three
 * differed structurally from the others at all.
 *
 * A template is now allowed to change *shape*, not just size. Three named
 * architectures per axis (header, section heading, entry) give the styles
 * differences a reader sees before they read a word, which is the actual product
 * requirement: switching style must feel like choosing a different document, not
 * like nudging a slider.
 *
 * The data does not move. `ComposedDocument` is identical for all three styles —
 * same sections, same order, same facts, same strings. A style may re-arrange
 * those facts on the page and may decline to print a *convention* of its own
 * (a document title, a section number); it may never add or drop a fact.
 *
 * ---------------------------------------------------------------------------
 * What the three reference documents actually do
 * ---------------------------------------------------------------------------
 * Measured from the founder's own CV, International CV and résumé (`My Templates`),
 * read from `word/document.xml` rather than from appearance. Recorded here so those
 * files never need parsing again and are never a runtime dependency.
 *
 * | dimension        | CV (formal)                     | International CV (modern)      | Résumé (executive)              |
 * | ---------------- | ------------------------------- | ------------------------------ | ------------------------------- |
 * | paper            | A4 11906×16838tw                | A4 11906×16838tw               | US Letter 12240×15840tw         |
 * | margins          | 560tw ≈ 9.9mm, all round        | 893/936tw ≈ 15.7/16.5mm        | 851tw ≈ 15mm                    |
 * | face             | document default (serif set)    | Aptos (sans)                   | Aptos (sans)                    |
 * | body             | 11.5pt (sz 23)                  | 10.5pt (sz 21)                 | 10.5pt (sz 21), line 1.15       |
 * | header           | centred: "CURRICULUM VITAE"     | centred: name 17pt, tracked    | centred: name 17pt **navy**,    |
 * |                  | kicker, name 12.5pt caps,       | 0.11em caps, contact line,     | bold caps tagline in grey,      |
 * |                  | location line, contact line     | second line in grey #555       | then two contact lines          |
 * | section headings | `N.` + caps label, full rule    | caps, tracking 0.13em, 0.5pt   | caps **navy**, 0.75pt navy      |
 * |                  | 0.75pt #2C5282                  | #999 rule                      | rule                            |
 * | entries          | role / organisation / **dates   | **role — organisation** on one | **role — organisation** left,   |
 * |                  | on their own line, italic #444**| line, dates+location #555 next | **dates bold flush right** at a |
 * |                  |                                 |                                | 10960tw tab, italic #444 line   |
 * | rhythm           | tight (2pt between bullets)     | even (7.2pt after everything)  | medium (1.2pt/1.5pt)            |
 * | ink              | black                           | black + #555 metadata          | navy + #444/#555 metadata       |
 *
 * They are references, not specifications. Where the product's own direction
 * differs — Template 1 is serif-led and pure black ink, its rule is document ink
 * rather than the reference's slate blue, and its margins are 12mm because 9.9mm
 * is inside the unprintable edge of many desktop printers — the product wins.
 */

import type { DocumentType } from "./schema";

/**
 * Stable identifiers. These are stored in the database, so they are vocabulary,
 * not labels: renaming one would change the style of every document already
 * saved with it. Renaming what the *user* reads is what `label` is for.
 */
export const documentTemplateIds = ["formal", "modern", "executive"] as const;

export type DocumentTemplateId = (typeof documentTemplateIds)[number];

/**
 * Ids this build has retired, mapped to the style that carries on their design.
 *
 * `classic` was the serif, numbered, black-ink style — now `formal`. `international`
 * was the sans, grey-metadata style — now `modern`. `compact` was the navy US-Letter
 * style — now `executive`. Documents saved under the old names therefore keep the
 * style their owner chose instead of silently falling back to a family default,
 * which is the whole reason this map exists rather than a migration: presentation
 * vocabulary should not require a schema change to evolve.
 */
const retiredTemplateIds: Readonly<Record<string, DocumentTemplateId>> = {
  classic: "formal",
  international: "modern",
  compact: "executive",
};

/**
 * The header architecture. Not a colour scheme — three different compositions.
 *
 * - `formal` — centred, led by the document's own title, name in tracked capitals,
 *   place and contact details on separate lines, closed by a double rule. The
 *   convention of an institutional or government submission.
 * - `modern` — ranged left, name at conversational scale, headline directly beneath,
 *   contact details as one quiet metadata row. No rule at all; whitespace separates.
 * - `executive` — ranged left, name large and in the accent ink, headline as a
 *   tracked capitals tagline, an accent hairline across the measure, contact details
 *   below the rule as secondary information.
 */
export type DocumentHeaderStyle = "formal" | "modern" | "executive";

/**
 * The section-heading architecture — where the rule goes, which is what a reader
 * registers first.
 *
 * - `numbered` — an automatic number, then the label, underlined across the measure.
 * - `understated` — the label alone over a short stub of a rule, with generous air
 *   above it.
 * - `banded` — a rule *above* the heading, in the accent ink, so the rule reads as a
 *   divider introducing the section rather than as an underline.
 */
export type DocumentSectionStyle = "numbered" | "understated" | "banded";

/**
 * The entry architecture.
 *
 * - `stacked` — every fact on its own line, dates last and set apart in italic.
 * - `runOn` — title and organisation share one line; dates and place follow beneath
 *   as one metadata row.
 * - `split` — title and organisation left, dates flush right on the same baseline,
 *   remaining qualifiers beneath.
 */
export type DocumentEntryStyle = "stacked" | "runOn" | "split";

export type DocumentPaper = "a4" | "us-letter";

/**
 * The custom properties a style may set.
 *
 * Typed as a union rather than `Record<string, string>` so a typo is a compile
 * error instead of a property that silently does nothing, and so this list doubles
 * as the inventory of every design dimension a style can reach. Each corresponding
 * rule in `styles/typography.css` or `styles/ui/document-preview.module.css` reads
 * its property with the untemplated value as the fallback, so a style supplies only
 * what it changes and no rule is ever written twice.
 */
type DocumentVariable =
  /* Page and type */
  | "--doc-family"
  | "--doc-margin"
  | "--doc-body-size"
  | "--doc-line-height"
  /* Masthead */
  | "--doc-header-align"
  | "--doc-header-gap"
  | "--doc-header-rule"
  | "--doc-kicker-size"
  | "--doc-kicker-tracking"
  | "--doc-name-size"
  | "--doc-name-tracking"
  | "--doc-name-transform"
  | "--doc-name-ink"
  | "--doc-headline-size"
  | "--doc-headline-weight"
  | "--doc-headline-tracking"
  | "--doc-headline-transform"
  | "--doc-headline-ink"
  | "--doc-contact-size"
  | "--doc-contact-ink"
  /* Sections */
  | "--doc-section-size"
  | "--doc-section-tracking"
  | "--doc-section-ink"
  | "--doc-section-rule"
  | "--doc-section-rule-length"
  | "--doc-section-gap"
  | "--doc-section-lead"
  | "--doc-summary-align"
  /* Entries */
  | "--doc-entry-gap"
  | "--doc-entry-title-size"
  | "--doc-entry-subtitle-weight"
  | "--doc-entry-subtitle-ink"
  | "--doc-meta-size"
  | "--doc-meta-style"
  | "--doc-meta-ink"
  | "--doc-period-weight"
  | "--doc-detail-gap"
  | "--doc-bullet-glyph"
  | "--doc-bullet-indent"
  | "--doc-bullet-gap";

/**
 * The dimensions with no sensible cross-style default: paper geometry and the
 * type it is set in. A style that omitted any of these would inherit another
 * style's rhythm by accident, so the compiler insists on them.
 */
type RequiredVariable =
  | "--doc-family"
  | "--doc-margin"
  | "--doc-body-size"
  | "--doc-line-height"
  | "--doc-name-size"
  | "--doc-section-size"
  | "--doc-section-gap"
  | "--doc-entry-gap";

export type DocumentVariables = Readonly<Record<RequiredVariable, string>> &
  Readonly<Partial<Record<Exclude<DocumentVariable, RequiredVariable>, string>>>;

export type DocumentTemplate = {
  id: DocumentTemplateId;
  /** What the user reads. Names a purpose, not a number. */
  label: string;
  /** One line, in the user's terms, describing the document it produces. */
  description: string;
  /** Who it is for. Shown alongside the description so the choice is informed. */
  suitedTo: string;
  paper: DocumentPaper;
  header: DocumentHeaderStyle;
  sections: DocumentSectionStyle;
  entries: DocumentEntryStyle;
  /**
   * Whether the document prints its own title above the name — "Curriculum Vitae".
   * A convention of formal submissions, and one this product owns: it is not a fact
   * about the user, so a style may add or drop it without touching their dossier.
   */
  showsDocumentTitle: boolean;
  variables: DocumentVariables;
};

/**
 * The traditional title a formal document carries at the top of the first page.
 *
 * Our own vocabulary, like the section headings — not something inferred about the
 * user. Only the formal style prints it.
 */
export function documentTitleConvention(type: DocumentType) {
  switch (type) {
    case "professional_resume":
      return "Résumé";
    case "professional_cv":
    case "academic_cv":
      return "Curriculum Vitae";
  }
}

export const documentTemplates: Readonly<Record<DocumentTemplateId, DocumentTemplate>> = {
  /**
   * Formal international CV.
   *
   * The traditional editorial document: serif, black ink, numbered sections ruled
   * across the measure, dates set apart from the role rather than folded into it,
   * and a compact 12mm margin carrying a larger 11.5pt body — dense, but organised
   * so tightly that the density reads as thoroughness. Nothing is decorative.
   */
  formal: {
    id: "formal",
    label: "International",
    description: "Formal international CV — numbered sections, serif type, full career history.",
    suitedTo: "International applications, government and institutional submissions, academic use.",
    paper: "a4",
    header: "formal",
    sections: "numbered",
    entries: "stacked",
    showsDocumentTitle: true,
    variables: {
      "--doc-family": "var(--ds-font-document)",
      "--doc-margin": "12mm",
      "--doc-body-size": "11.5pt",
      "--doc-line-height": "1.3",

      "--doc-header-align": "center",
      "--doc-header-gap": "1.1em",
      /* Thick over thin: the closing device of a formal title page. */
      "--doc-header-rule": "3pt double var(--ds-document-ink)",
      "--doc-kicker-size": "10pt",
      "--doc-kicker-tracking": "0.18em",
      "--doc-name-size": "15pt",
      "--doc-name-tracking": "0.07em",
      "--doc-name-transform": "uppercase",
      "--doc-headline-size": "10.5pt",
      "--doc-contact-size": "10pt",
      "--doc-contact-ink": "var(--ds-document-ink)",

      "--doc-section-size": "11.5pt",
      "--doc-section-tracking": "0.05em",
      "--doc-section-rule": "0.75pt solid var(--ds-document-ink)",
      "--doc-section-gap": "1.05em",
      "--doc-section-lead": "0.45em",

      "--doc-entry-gap": "0.6em",
      "--doc-entry-title-size": "11.5pt",
      "--doc-entry-subtitle-weight": "400",
      "--doc-meta-size": "10.5pt",
      "--doc-meta-style": "italic",
      "--doc-detail-gap": "0.3em",
      "--doc-bullet-indent": "1em",
      "--doc-bullet-gap": "0.18em",
    },
  },

  /**
   * Contemporary corporate résumé.
   *
   * Sans-serif, ranged left, and deliberately light: no rule under the name, a
   * short stub of a rule under each heading, a full em of air above every section,
   * and every secondary fact — organisation, dates, place — set in grey so the
   * roles carry the page on their own. Less dense than the formal style by design.
   */
  modern: {
    id: "modern",
    label: "Modern",
    description: "Clean professional résumé — light rules, grey metadata, generous spacing.",
    suitedTo: "Corporate, technology, consulting and general professional applications.",
    paper: "a4",
    header: "modern",
    sections: "understated",
    entries: "runOn",
    showsDocumentTitle: false,
    variables: {
      "--doc-family": "var(--ds-font-document-sans)",
      "--doc-margin": "18mm",
      "--doc-body-size": "10.5pt",
      "--doc-line-height": "1.45",

      "--doc-header-align": "left",
      "--doc-header-gap": "1.9em",
      "--doc-name-size": "20pt",
      "--doc-name-tracking": "-0.015em",
      "--doc-headline-size": "11pt",
      "--doc-headline-weight": "500",
      "--doc-contact-size": "9.5pt",

      "--doc-section-size": "9.5pt",
      "--doc-section-tracking": "0.14em",
      "--doc-section-ink": "var(--ds-document-ink-weak)",
      "--doc-section-rule": "0.5pt solid var(--ds-document-rule)",
      /* A stub, not an underline: the heading is separated by air, not by a line. */
      "--doc-section-rule-length": "3.5em",
      "--doc-section-gap": "2.1em",
      "--doc-section-lead": "0.7em",

      "--doc-entry-gap": "1.25em",
      "--doc-entry-title-size": "10.5pt",
      "--doc-entry-subtitle-weight": "400",
      "--doc-entry-subtitle-ink": "var(--ds-document-ink-weak)",
      "--doc-meta-size": "9.5pt",
      "--doc-detail-gap": "0.45em",
      "--doc-bullet-indent": "1.15em",
      "--doc-bullet-gap": "0.3em",
    },
  },

  /**
   * Editorial executive résumé.
   *
   * US Letter, navy, and the only style with a real first-page identity: the name
   * at 26pt, a tracked capitals tagline beneath it, an accent hairline across the
   * measure, and section rules that sit *above* their headings so each section
   * opens like a chapter. Dates are pushed to the right edge, which is what makes a
   * long career scan as a chronology. Editorial rather than administrative.
   */
  executive: {
    id: "executive",
    label: "Executive",
    description: "Editorial executive résumé — accent headings, right-aligned dates, strong name.",
    suitedTo: "Senior professionals, leadership and consulting roles, portfolio presentation.",
    paper: "us-letter",
    header: "executive",
    sections: "banded",
    entries: "split",
    showsDocumentTitle: false,
    variables: {
      "--doc-family": "var(--ds-font-document-sans)",
      "--doc-margin": "15mm",
      "--doc-body-size": "10.5pt",
      "--doc-line-height": "1.38",

      "--doc-header-align": "left",
      "--doc-header-gap": "1.5em",
      "--doc-header-rule": "1pt solid var(--ds-document-accent)",
      "--doc-name-size": "26pt",
      "--doc-name-tracking": "-0.02em",
      "--doc-name-ink": "var(--ds-document-accent)",
      "--doc-headline-size": "9.5pt",
      "--doc-headline-weight": "600",
      "--doc-headline-tracking": "0.16em",
      "--doc-headline-transform": "uppercase",
      "--doc-headline-ink": "var(--ds-document-ink-weak)",
      "--doc-contact-size": "9.5pt",

      "--doc-section-size": "10.5pt",
      "--doc-section-tracking": "0.1em",
      "--doc-section-ink": "var(--ds-document-accent)",
      "--doc-section-rule": "1pt solid var(--ds-document-accent)",
      "--doc-section-gap": "1.7em",
      "--doc-section-lead": "0.55em",
      "--doc-summary-align": "justify",

      "--doc-entry-gap": "0.95em",
      "--doc-entry-title-size": "11pt",
      "--doc-entry-subtitle-weight": "400",
      "--doc-meta-size": "9.5pt",
      "--doc-meta-style": "italic",
      "--doc-period-weight": "600",
      "--doc-detail-gap": "0.4em",
      /* An en dash rather than a bullet: the editorial convention. */
      "--doc-bullet-glyph": '"–"',
      "--doc-bullet-indent": "1.05em",
      "--doc-bullet-gap": "0.22em",
    },
  },
};

/** Presentation order for the style picker: formal, then modern, then executive. */
export const documentTemplateList: readonly DocumentTemplate[] = documentTemplateIds.map(
  (id) => documentTemplates[id],
);

export function isDocumentTemplateId(value: unknown): value is DocumentTemplateId {
  return typeof value === "string" && documentTemplateIds.includes(value as DocumentTemplateId);
}

/**
 * The style a family gets when the user has not chosen one.
 *
 * A general CV opens formal because that is the safest default for an unknown
 * destination; a résumé opens executive because that is the register a competitive
 * application is read in; an academic or international CV opens formal for the same
 * reason as the CV. The user can change it, and the choice is stored.
 */
export function defaultTemplateFor(type: DocumentType): DocumentTemplateId {
  switch (type) {
    case "professional_cv":
      return "formal";
    case "professional_resume":
      return "executive";
    case "academic_cv":
      return "formal";
  }
}

/**
 * The style for a stored value — falling back rather than throwing.
 *
 * A document must open. If the stored style was retired it resolves to the style
 * that carries on its design; if it is unrecognisable it resolves to the family
 * default. Neither case is an error the user should be shown, because neither is
 * anything they did.
 */
export function resolveTemplate(value: string | null | undefined, type: DocumentType) {
  if (isDocumentTemplateId(value)) return documentTemplates[value];
  const retired = value ? retiredTemplateIds[value] : undefined;
  return documentTemplates[retired ?? defaultTemplateFor(type)];
}
