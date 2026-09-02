"use client";

import { useState } from "react";
import type { FormHTMLAttributes } from "react";
import {
  composeDocument,
  isComposedDocumentEmpty,
  composableSections,
} from "@/documents/composition";
import { DocumentPreview } from "@/documents/components/document-preview";
import { SectionArrangement } from "@/documents/components/section-arrangement";
import {
  compatiblePresentationStyles,
  resolvePresentationStyle,
  type PresentationStyleId,
} from "@/documents/presentation";
import type { DocumentType } from "@/documents/schema";
import type { DossierSnapshot } from "@/profile/dossier";
import styles from "@/styles/pages/documents.module.css";
import settings from "@/styles/ui/document-settings.module.css";

type DocumentWorkspaceProps = {
  documentId: string;
  title: string;
  documentType: DocumentType;
  presentationStyle: PresentationStyleId;
  hiddenSections: readonly string[];
  sectionOrder: readonly string[];
  snapshot: DossierSnapshot;
  saveAction: FormHTMLAttributes<HTMLFormElement>["action"];
};

/**
 * The product-facing editor. It deliberately receives only the Dossier snapshot needed to
 * compose the already-owned draft; all changes are pure local configuration until Save.
 */
export function DocumentWorkspace({
  documentId,
  title,
  documentType,
  presentationStyle: initialStyle,
  hiddenSections: initialHidden,
  sectionOrder: initialOrder,
  snapshot,
  saveAction,
}: DocumentWorkspaceProps) {
  const sections = composableSections(documentType, snapshot, initialOrder);
  const [workingTitle, setWorkingTitle] = useState(title);
  const [styleId, setStyleId] = useState<PresentationStyleId>(initialStyle);
  const [sectionOrder, setSectionOrder] = useState<readonly string[]>(initialOrder.length ? initialOrder : sections.map((section) => section.key));
  const [hiddenSections, setHiddenSections] = useState<readonly string[]>(initialHidden);
  const [previewOpen, setPreviewOpen] = useState(false);
  const style = resolvePresentationStyle(styleId, documentType);
  const composed = composeDocument(documentType, snapshot, { hiddenSections, sectionOrder });
  const hasContent = !isComposedDocumentEmpty(composed);

  return (
    <div className={styles.workspaceShell}>
      <div className={styles.workspaceToolbar} data-print-skip>
        <div>
          <p className={styles.eyebrow}>Your document workspace</p>
          <h2 className={styles.workspaceTitle}>{workingTitle || "Untitled document"}</h2>
        </div>
        <button className={styles.previewToggle} onClick={() => setPreviewOpen(true)} type="button">
          Preview
        </button>
      </div>

      <div className={styles.workspace}>
        <aside aria-label="Document customization" className={styles.workspaceControls} data-print-skip>
          <form action={saveAction} className={settings.settings}>
            <input name="documentId" type="hidden" value={documentId} />
            <input name="template" type="hidden" value={styleId} />
            {sections.map((section) => <input key={`offered-${section.key}`} name="offered" type="hidden" value={section.key} />)}
            {sectionOrder.map((key) => <input key={`order-${key}`} name="order" type="hidden" value={key} />)}
            {hiddenSections.map((key) => <input key={`hidden-${key}`} name="hidden" type="hidden" value={key} />)}

            <div className={settings.field}>
              <label className={settings.label} htmlFor="workspace-title">Document name</label>
              <input className={settings.input} id="workspace-title" maxLength={120} name="title" onChange={(event) => setWorkingTitle(event.target.value)} required type="text" value={workingTitle} />
              <p className={settings.hint}>Only you see this name.</p>
            </div>

            <details className={styles.workspaceGroup} open>
              <summary>Style <span>{style.label}</span></summary>
              <div className={settings.templates}>
                {compatiblePresentationStyles(documentType).map((option) => (
                  <label className={settings.template} key={option.id}>
                    <input checked={option.id === styleId} name="style-choice" onChange={() => setStyleId(option.id)} type="radio" value={option.id} />
                    <span className={settings.templateBody}><strong>{option.label}</strong><span>{option.description}</span></span>
                  </label>
                ))}
              </div>
            </details>

            {sections.length > 0 ? (
              <details className={styles.workspaceGroup} open>
                <summary>Sections <span>{sections.length - hiddenSections.length} shown</span></summary>
                <p className={settings.hint}>Choose what appears and arrange the order. Your Dossier stays unchanged.</p>
                <SectionArrangement hiddenSections={hiddenSections} onConfigurationChange={(order, hidden) => { setSectionOrder(order); setHiddenSections(hidden); }} sections={sections} />
              </details>
            ) : null}

            <button className={settings.save} type="submit">Save changes</button>
          </form>
        </aside>

        <div aria-label="Live document preview" className={`${styles.workspacePreview} ${previewOpen ? styles.previewFullscreen : ""}`}>
          <div className={styles.previewToolbar} data-print-skip>
            <span>Live preview · {style.label}</span>
            {previewOpen ? <button className={styles.previewClose} onClick={() => setPreviewOpen(false)} type="button">Close preview</button> : null}
          </div>
          {hasContent ? <DocumentPreview document={composed} presentationStyle={style} /> : <div className={styles.emptyNotice}><h2>There is nothing in your dossier to show yet.</h2><p>Add your name, contact details and one section to see the document here.</p></div>}
        </div>
      </div>
    </div>
  );
}
