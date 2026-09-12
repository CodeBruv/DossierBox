/**
 * Physical document preview.
 *
 * The preview and PDF renderer both consume the canonical presentation model and
 * its shared physical page plan. A preview sheet is therefore a real A4/Letter
 * page, not an arrangement group, and every natural or explicit boundary is the
 * same boundary the PDF renderer receives.
 */

import type { CSSProperties } from "react";
import type { ComposedDocument } from "../composition";
import { compilePresentationModel, PRESENTATION_CONTRACT_VERSION } from "../export-presentation";
import { paginatePresentation } from "../presentation-pagination";
import type { PresentationStyle } from "../presentation";
import styles from "@/styles/ui/document-preview.module.css";

export type DocumentPreviewProps = {
  document: ComposedDocument;
  presentationStyle: PresentationStyle;
};

export function DocumentPreview({ document, presentationStyle }: DocumentPreviewProps) {
  const model = compilePresentationModel({
    document,
    presentationContractVersion: PRESENTATION_CONTRACT_VERSION,
    presentationStyleId: presentationStyle.id,
  });
  const pages = paginatePresentation(model);
  const sheetStyle = {
    "--doc-paper-width-points": model.paper.widthPoints,
    "--doc-paper-height-points": model.paper.heightPoints,
  } as CSSProperties;

  return (
    <div className={styles.pages}>
      {pages.map((page, pageIndex) => (
        <div
          aria-label={`Document preview, page ${pageIndex + 1} of ${pages.length}`}
          className={styles.page}
          key={pageIndex}
        >
          <div className={styles.pageIndicator}>Page {pageIndex + 1} of {pages.length}</div>
          <article className={`${styles.sheet} document-frame`} style={sheetStyle}>
            {page.blocks.map((block, blockIndex) => {
              const blockStyle = {
                top: `${block.top}pt`,
                left: `${model.margins.left}pt`,
                right: `${model.margins.right}pt`,
                height: `${block.height}pt`,
                color: block.color,
                fontSize: `${block.fontSize}pt`,
                fontWeight: block.bold ? 700 : 400,
                lineHeight: `${block.lineHeight}pt`,
              } as CSSProperties;
              const content = block.lines.map((line, lineIndex) => (
                <span className={line.bullet ? styles.bulletLine : styles.line} key={lineIndex}>
                  {line.bullet ? <span aria-hidden="true" className={styles.bullet}>•</span> : null}
                  {line.text}
                </span>
              ));

              return block.source.kind === "link" ? (
                <a
                  className={`${styles.block} ${styles.link}`}
                  href={block.source.url}
                  key={`${blockIndex}-${block.top}`}
                  rel="noopener noreferrer nofollow"
                  style={blockStyle}
                  target="_blank"
                >
                  {content}
                </a>
              ) : (
                <div
                  className={`${styles.block} ${block.source.kind === "text" && block.source.role === "heading" ? styles.heading : ""}`}
                  key={`${blockIndex}-${block.top}`}
                  style={blockStyle}
                >
                  {content}
                </div>
              );
            })}
          </article>
        </div>
      ))}
    </div>
  );
}
