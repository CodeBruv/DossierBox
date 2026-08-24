/**
 * The document, as a sheet of paper.
 *
 * This is the **presentation** layer in the chain
 * `dossier → composition → presentation`. It receives a {@link ComposedDocument}
 * and nothing else: no profile, no session, no database handle. Every decision
 * about which sections appear and what their lines say was already made by the
 * composition layer, so this file contains no product judgement — only markup and
 * type.
 *
 * That boundary is what makes the preview trustworthy. Because this component
 * cannot reach the dossier, it cannot quietly add, reorder or infer anything the
 * composition layer did not put in front of it, and the same input always produces
 * the same sheet. It is also why the eventual PDF renderer can consume the same
 * `ComposedDocument` and be held to producing the same output.
 *
 * Deliberately a server component: it holds no state, has no interactivity, and
 * shipping a career document's contents to the client as a hydration payload would
 * be pure cost.
 */

import type { CSSProperties } from "react";
import { isHttpUrl } from "@/profile/validation";
import type {
  ComposedDetail,
  ComposedDocument,
  ComposedEntry,
  ComposedSection,
} from "../composition";
import {
  templatePaperMetrics,
  type DocumentEntryLayout,
  type DocumentTemplate,
} from "../presentation";
import styles from "@/styles/ui/document-preview.module.css";

/**
 * Contacts and inline values arrive as arrays and are joined here rather than in
 * the composition layer, because a separator is a visual decision. `·` for facts
 * that are unrelated, `,` for members of one list.
 */
const FACT_SEPARATOR = " · ";
const LIST_SEPARATOR = ", ";

export type DocumentPreviewProps = {
  document: ComposedDocument;
  template: DocumentTemplate;
};

export function DocumentPreview({ document: composed, template }: DocumentPreviewProps) {
  const { header, sections } = composed;

  /*
   * The template becomes custom properties on the sheet, and inheritance carries
   * them to every rule that reads a `--doc-*` value. Applying it as one inline
   * style rather than a class per template is what keeps the stylesheet from
   * growing a copy of every rule for each style — and it is why adding a template
   * is a data change in presentation.ts rather than a CSS change here.
   *
   * Paper width is derived rather than stored, so `paper` stays the single place
   * that decides page size for both this view and, later, the PDF page box.
   */
  const sheetStyle = {
    ...template.variables,
    "--doc-paper-width": templatePaperMetrics(template).width,
  } as CSSProperties;

  return (
    <article
      aria-label="Document preview"
      /*
       * `document-frame` and `document-font`/`document-body` are the global
       * classes typography.css already defines for this component. Reusing them
       * rather than restating the type here is what keeps the preview and the
       * print/PDF output describable as the same document.
       */
      className={[
        styles.sheet,
        template.numberedSections ? styles.numbered : "",
        "document-frame document-font document-body",
      ]
        .filter(Boolean)
        .join(" ")}
      style={sheetStyle}
    >
      {header.name || header.headline || header.contacts.length > 0 ? (
        <header className={styles.masthead}>
          {header.name ? <h2 className={styles.name}>{header.name}</h2> : null}
          {header.headline ? <p className={styles.headline}>{header.headline}</p> : null}
          {header.contacts.length > 0 ? (
            <p className={styles.contacts}>{header.contacts.join(FACT_SEPARATOR)}</p>
          ) : null}
        </header>
      ) : null}

      {sections.map((section) => (
        <section key={section.key} className={styles.section}>
          <h3 className={`${styles.sectionTitle} document-section-title`}>{section.heading}</h3>
          <SectionBody section={section} entryLayout={template.entryLayout} />
        </section>
      ))}
    </article>
  );
}

function SectionBody({
  section,
  entryLayout,
}: {
  section: ComposedSection;
  entryLayout: DocumentEntryLayout;
}) {
  switch (section.layout) {
    case "prose":
      return <Detail detail={section.body} className={styles.prose} />;

    case "entries":
      return (
        <ul className={styles.entries}>
          {section.entries.map((entry, index) => (
            <li key={`${entry.title}-${index}`} className={styles.entry}>
              <Entry entry={entry} layout={entryLayout} />
            </li>
          ))}
        </ul>
      );

    case "inline":
      return <p className={styles.inlineItems}>{section.items.join(FACT_SEPARATOR)}</p>;

    case "grouped":
      return (
        <>
          {section.groups.map((group) => (
            <p key={group.label} className={styles.group}>
              <span className={styles.groupLabel}>{group.label}: </span>
              {group.items.join(LIST_SEPARATOR)}
            </p>
          ))}
        </>
      );
  }
}

/**
 * One entry, in whichever of the two reference arrangements the template asks for.
 *
 * Both branches render the same four values from the same composed entry — only
 * the order and grouping of the elements differ. That is the boundary holding: a
 * template can rearrange what a document shows, and cannot change it. Nothing is
 * dropped in either arrangement, so switching template never loses information.
 */
function Entry({ entry, layout }: { entry: ComposedEntry; layout: DocumentEntryLayout }) {
  const title = <h4 className={styles.entryTitle}>{entry.title}</h4>;
  const meta = entry.meta ? <p className={styles.entryMeta}>{entry.meta}</p> : null;
  const subtitle = entry.subtitle ? <p className={styles.entrySubtitle}>{entry.subtitle}</p> : null;

  return (
    <>
      {layout === "split" ? (
        <>
          {/* Dates flush right beside the title; the organisation drops below. */}
          <div className={styles.entryHead}>
            {title}
            {meta}
          </div>
          {subtitle}
        </>
      ) : (
        <>
          {title}
          {subtitle}
          {meta}
        </>
      )}
      {entry.detail ? <Detail detail={entry.detail} className={styles.entryDetail} /> : null}
      {entry.url ? <Url url={entry.url} /> : null}
    </>
  );
}

/**
 * The user's own text. Bullet lists and paragraphs both come from the global
 * document classes so that a bullet in the preview is the same bullet the print
 * stylesheet draws.
 */
function Detail({ detail, className }: { detail: ComposedDetail; className?: string }) {
  if (detail.kind === "bullets") {
    return (
      <ul className={`${className ?? ""} document-list`}>
        {detail.lines.map((line, index) => (
          <li key={`${index}-${line}`} className="document-bullet">
            {line}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={className}>
      {detail.lines.map((line, index) => (
        <p key={`${index}-${line}`} className="document-paragraph">
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * A link the user supplied.
 *
 * The protocol is re-checked here even though the profile forms already validate
 * it. Rendering an arbitrary stored string into `href` is the one place this
 * component could turn a database value into executable navigation, so it is
 * checked at the point of use rather than trusted from three layers away. Anything
 * that is not http(s) is still shown — the user typed it, and hiding it would look
 * like data loss — just not as something clickable.
 */
function Url({ url }: { url: string }) {
  if (!isHttpUrl(url)) {
    return <p className={styles.entryMeta}>{url}</p>;
  }

  return (
    <a className={styles.entryLink} href={url} rel="noopener noreferrer nofollow" target="_blank">
      {url}
    </a>
  );
}
