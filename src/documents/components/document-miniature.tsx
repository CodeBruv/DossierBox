/**
 * One page of a real document, small enough to compare against another.
 *
 * It renders the same {@link DocumentPreview} the workspace and the eventual PDF use, at a
 * reduced size — not a picture of a document, and not a mock-up. That is the whole point:
 * a template chooser showing invented content teaches the user nothing about what *their*
 * document will look like, and a chooser showing a screenshot goes stale the day a
 * template changes.
 *
 * ## How it is made small
 *
 * A CSS transform, applied to a stage holding the sheet at its true measure. The sheet
 * still lays out at 210mm (or 8.5in) and is then scaled visually, so every metric a
 * template sets — margins in millimetres, type in points, the rhythm between sections —
 * stays in the same proportion to the page as it will be on paper. Rendering the sheet
 * into a narrow box instead would keep the type at full size and shrink only the measure,
 * which is a different document.
 *
 * The frame is exactly one page, so what the user is comparing is the first page of their
 * own document in each template: how much fits, where the eye lands, how the headings
 * carry. Anything past the fold is clipped rather than scaled further.
 *
 * ## Why it is inert
 *
 * The miniature is decoration for a control that sits around it — a link or a label — and
 * a document contains links of its own. Without `inert`, choosing a template by clicking
 * its picture could instead follow the user's own portfolio URL, and a keyboard user would
 * tab through every link in every miniature before reaching the next choice. `inert`
 * removes the subtree from hit-testing, focus and the accessibility tree in one attribute;
 * the surrounding control carries the accessible name, and the document itself is
 * presented properly at full size elsewhere on the page.
 */

import type { CSSProperties } from "react";
import type { ComposedDocument } from "../composition";
import { templatePaperMetrics, type DocumentTemplate } from "../presentation";
import { DocumentPreview } from "./document-preview";
import styles from "@/styles/ui/document-miniature.module.css";

export type DocumentMiniatureProps = {
  document: ComposedDocument;
  template: DocumentTemplate;
};

export function DocumentMiniature({ document, template }: DocumentMiniatureProps) {
  const paper = templatePaperMetrics(template);

  /*
   * Both dimensions, because the frame is a page rather than a box: A4 and US Letter are
   * different shapes, and a miniature that ignored that would show the two templates on
   * the same paper when their difference in paper is one of the things being chosen.
   */
  const pageStyle = {
    "--miniature-paper-width": paper.width,
    "--miniature-paper-height": paper.height,
  } as CSSProperties;

  return (
    <div aria-hidden="true" className={styles.frame} inert style={pageStyle}>
      <div className={styles.stage}>
        <DocumentPreview document={document} template={template} />
      </div>
    </div>
  );
}
