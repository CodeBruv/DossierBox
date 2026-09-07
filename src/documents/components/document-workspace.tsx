"use client";

import { useEffect, useRef, useState } from "react";
import type { FormHTMLAttributes } from "react";
import {
  composeEvidenceBoundDocument,
  isComposedDocumentEmpty,
  composableSections,
  type SelectedEvidence,
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
  selectedEvidence: readonly SelectedEvidence[];
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
  selectedEvidence,
  snapshot,
  saveAction,
}: DocumentWorkspaceProps) {
  const normalizedInitialOrder = [...new Set(initialOrder)];
  const sections = composableSections(documentType, snapshot, normalizedInitialOrder, selectedEvidence);
  const [workingTitle, setWorkingTitle] = useState(title);
  const [styleId, setStyleId] = useState<PresentationStyleId>(initialStyle);
  const [sectionOrder, setSectionOrder] = useState<readonly string[]>(normalizedInitialOrder.length ? normalizedInitialOrder : sections.map((section) => section.key));
  const [hiddenSections, setHiddenSections] = useState<readonly string[]>([...new Set(initialHidden)]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!previewOpen) return;
    previewCloseRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPreviewOpen(false);
      previewTriggerRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [previewOpen]);

  const closePreview = () => {
    setPreviewOpen(false);
    previewTriggerRef.current?.focus();
  };
  const style = resolvePresentationStyle(styleId, documentType);
  const composed = composeEvidenceBoundDocument(documentType, snapshot, selectedEvidence, { hiddenSections, sectionOrder });
  const hasContent = !isComposedDocumentEmpty(composed);

  return (
    <div className={styles.workspaceShell}>
      <div className={styles.workspaceToolbar} data-print-skip>
        <div>
          <p className={styles.eyebrow}>Your document workspace</p>
          <h2 className={styles.workspaceTitle}>{workingTitle || "Untitled document"}</h2>
        </div>
        <div className={styles.workspaceToolbarActions}>
          <button aria-controls="document-preview" aria-expanded={previewOpen} className={styles.previewToggle} onClick={() => setPreviewOpen(true)} ref={previewTriggerRef} type="button">
            Preview
          </button>
          <button aria-expanded={customizeOpen} className={styles.customizeToggle} onClick={() => setCustomizeOpen((open) => !open)} type="button">
            {customizeOpen ? "Close customize" : "Customize"}
          </button>
        </div>
      </div>

      <div className={styles.workspace}>
        <div aria-labelledby="document-preview-heading" className={`${styles.workspacePreview} ${previewOpen ? styles.previewFullscreen : ""}`} id="document-preview" role={previewOpen ? "dialog" : undefined} aria-modal={previewOpen ? "true" : undefined}>
          <div className={styles.previewToolbar} data-print-skip>
            <span id="document-preview-heading">Live preview · {style.label}</span>
            {previewOpen ? <button aria-label="Close document preview" className={styles.previewClose} onClick={closePreview} ref={previewCloseRef} type="button">Close preview</button> : null}
          </div>
          {hasContent ? <DocumentPreview document={composed} presentationStyle={style} /> : <div className={styles.emptyNotice}><h2>This document has no visible content.</h2><p>Choose a different section set or add more information to your saved Dossier before customizing this document.</p></div>}
        </div>

        <aside aria-label="Document customization" className={`${styles.workspaceControls} ${customizeOpen ? styles.workspaceControlsOpen : ""}`} data-print-skip>
          <form action={saveAction} className={settings.settings}>
            <input name="documentId" type="hidden" value={documentId} />
            <input name="template" type="hidden" value={styleId} />

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

      </div>
    </div>
  );
}
