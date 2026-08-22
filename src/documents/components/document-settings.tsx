/**
 * The document's controls.
 *
 * A server component wrapping one plain `<form>` that posts to a server action.
 * There is no client JavaScript here at all, which is a deliberate choice rather
 * than an omission:
 *
 * - The alternative is a client component, and a live template switch would mean
 *   shipping the composition layer and the whole document's contents to the
 *   browser as a hydration payload. A career document is the most sensitive data
 *   this product holds; sending it twice to render it once is a poor trade.
 * - A form submission re-renders the page on the server, so what the user sees
 *   after saving is the document as it will actually be produced — not a client
 *   approximation that could drift from the server's output.
 * - It works before JavaScript loads, and on a slow connection that is not a
 *   hypothetical.
 *
 * The cost is honest and small: the preview updates when the user saves rather
 * than as they click. Everything here works; nothing is decorative.
 */

import { updateDocumentAction } from "../actions";
import { documentTemplateList } from "../presentation";
import type { ComposedSectionKey } from "../composition";
import styles from "@/styles/ui/document-settings.module.css";

export type DocumentSettingsProps = {
  documentId: string;
  title: string;
  template: string;
  /** Every section this document could show, in the order it shows them. */
  sections: readonly { key: ComposedSectionKey; heading: string }[];
  hiddenSections: readonly string[];
};

export function DocumentSettings({
  documentId,
  title,
  template,
  sections,
  hiddenSections,
}: DocumentSettingsProps) {
  const hidden = new Set(hiddenSections);

  return (
    <form action={updateDocumentAction} className={styles.settings}>
      <input type="hidden" name="documentId" value={documentId} />

      <div className={styles.field}>
        <label className={styles.label} htmlFor="document-title">
          Document name
        </label>
        <input
          className={styles.input}
          defaultValue={title}
          id="document-title"
          maxLength={120}
          name="title"
          required
          type="text"
        />
        <p className={styles.hint}>Only you see this. It is how the document is listed.</p>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Style</legend>
        <div className={styles.templates}>
          {documentTemplateList.map((option) => (
            <label className={styles.template} key={option.id}>
              <input
                defaultChecked={option.id === template}
                name="template"
                type="radio"
                value={option.id}
              />
              <span className={styles.templateBody}>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/*
        Only sections with content are listed, because a toggle for a section the
        user has not filled in would do nothing and tell them nothing. When the
        dossier is empty this whole block is absent rather than an empty box.
      */}
      {sections.length > 0 ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Sections</legend>
          <p className={styles.hint}>
            Everything you have recorded is included. Clear a section to leave it out of
            this document — it stays in your dossier.
          </p>
          <ul className={styles.sections}>
            {sections.map((section) => (
              <li key={section.key}>
                <label className={styles.section}>
                  {/*
                    An unchecked box posts nothing, so the server cannot tell a
                    cleared section from one this form never offered. `offered`
                    carries the full list alongside it, which is what lets the
                    action work out the difference.
                  */}
                  <input type="hidden" name="offered" value={section.key} />
                  <input
                    defaultChecked={!hidden.has(section.key)}
                    name="visible"
                    type="checkbox"
                    value={section.key}
                  />
                  <span>{section.heading}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <button className={styles.save} type="submit">
        Save changes
      </button>
    </form>
  );
}
