"use client";

import { useEffect, useRef, useState } from "react";
import type { FormHTMLAttributes } from "react";
import {
  composeEvidenceBoundDocument,
  isComposedDocumentEmpty,
  composableSections,
  type ComposedDetail,
  type ComposedEntry,
  type ComposedSection,
  type DocumentContentOverrides,
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
  pageBreaks: readonly string[];
  contentOverrides: Record<string, unknown>;
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
  pageBreaks: initialPageBreaks,
  contentOverrides: initialOverrides,
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
  const [pageBreaks, setPageBreaks] = useState<readonly string[]>([...new Set(initialPageBreaks)]);
  const [contentOverrides, setContentOverrides] = useState<DocumentContentOverrides>(initialOverrides as DocumentContentOverrides);
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
  const composed = composeEvidenceBoundDocument(documentType, snapshot, selectedEvidence, { hiddenSections, sectionOrder, pageBreaks, contentOverrides });
  const hasContent = !isComposedDocumentEmpty(composed);

  return (
    <div className={styles.workspaceShell}>
      <div className={styles.workspaceToolbar} data-print-skip>
        <div>
          <strong>Draft workspace</strong>
          <span className={settings.hint}> Save changes, then review and accept before exporting.</span>
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
          {hasContent ? <DocumentPreview document={composed} presentationStyle={style} pageBreaks={pageBreaks} /> : <div className={styles.emptyNotice}><h2>This document has no visible content.</h2><p>Choose a different section set or add more information to your saved Dossier before customizing this document.</p></div>}
        </div>

        <aside aria-label="Document customization" className={`${styles.workspaceControls} ${customizeOpen ? styles.workspaceControlsOpen : ""}`} data-print-skip>
          <form action={saveAction} className={settings.settings}>
            <input name="documentId" type="hidden" value={documentId} />
            <input name="template" type="hidden" value={styleId} />
            <input name="contentOverrides" type="hidden" value={JSON.stringify(contentOverrides)} />
            {pageBreaks.map((key) => <input key={key} name="pageBreak" type="hidden" value={key} />)}

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
                <div className={settings.field}>
                  <p className={settings.label}>Document content</p>
                  {composed.sections.map((section) => <SectionEditor key={section.key} section={section} overrides={contentOverrides} onChange={setContentOverrides} />)}
                </div>
              </details>
            ) : null}

            {sections.length > 1 ? (
              <details className={styles.workspaceGroup} open>
                <summary>Page breaks <span>{pageBreaks.length}</span></summary>
                <p className={settings.hint}>Start a section on a new page in the saved document.</p>
                {sectionOrder.filter((key) => !hiddenSections.includes(key)).map((key, index) => index > 0 ? (
                  <label className={settings.visibility} key={key}>
                    <input checked={pageBreaks.includes(key)} onChange={(event) => setPageBreaks((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((entry) => entry !== key))} type="checkbox" />
                    <span>New page before {key}</span>
                  </label>
                ) : null)}
              </details>
            ) : null}

            <button className={settings.save} type="submit">Save changes</button>
            <p className={settings.hint}>PDF export becomes available from the accepted version.</p>
          </form>
        </aside>

      </div>
    </div>
  );
}

function SectionEditor({
  section,
  overrides,
  onChange,
}: {
  section: ComposedSection;
  overrides: DocumentContentOverrides;
  onChange: React.Dispatch<React.SetStateAction<DocumentContentOverrides>>;
}) {
  const current = overrides.sections?.[section.key];
  const update = (patch: Record<string, unknown>) =>
    onChange((value) => ({
      ...value,
      sections: {
        ...value.sections,
        [section.key]: {
          ...value.sections?.[section.key],
          ...patch,
        } as never,
      },
    }));
  const detailText = (detail: ComposedDetail) => detail.lines.join("\n");
  const entries = section.layout === "entries"
    ? current && "entries" in current && current.entries
      ? current.entries
      : section.entries
    : [];

  const updateEntry = (index: number, patch: Partial<ComposedEntry>) =>
    update({ entries: entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry) });

  return (
    <fieldset className={settings.field}>
      <legend className={settings.label}>{section.heading}</legend>
      <label className={settings.field}>
        <span className={settings.hint}>Heading</span>
        <input
          className={settings.input}
          maxLength={200}
          onChange={(event) => update({ heading: event.target.value })}
          value={current && "heading" in current ? current.heading ?? section.heading : section.heading}
        />
      </label>

      {section.layout === "prose" ? (
        <label className={settings.field}>
          <span className={settings.hint}>Text</span>
          <textarea
            className={settings.textarea}
            rows={5}
            onChange={(event) => update({ body: { kind: "paragraphs", lines: event.target.value.split(/\r?\n/).filter(Boolean) } })}
            value={current && "body" in current && current.body ? detailText(current.body) : detailText(section.body)}
          />
        </label>
      ) : null}

      {section.layout === "entries" ? (
        <div className={settings.field}>
          <span className={settings.hint}>Entries</span>
          {entries.map((entry, index) => (
            <fieldset className={settings.field} key={`${section.key}-${index}`}>
              <legend className={settings.hint}>Entry {index + 1}</legend>
              <label className={settings.field}><span className={settings.hint}>Title</span><input className={settings.input} value={entry.title} onChange={(event) => updateEntry(index, { title: event.target.value })} /></label>
              <label className={settings.field}><span className={settings.hint}>Subtitle</span><input className={settings.input} value={entry.subtitle ?? ""} onChange={(event) => updateEntry(index, { subtitle: event.target.value || null })} /></label>
              <label className={settings.field}><span className={settings.hint}>Meta</span><input className={settings.input} value={entry.meta ?? ""} onChange={(event) => updateEntry(index, { meta: event.target.value || null })} /></label>
              <label className={settings.field}><span className={settings.hint}>Details</span><textarea className={settings.textarea} rows={3} value={entry.detail?.lines.join("\n") ?? ""} onChange={(event) => updateEntry(index, { detail: event.target.value ? { kind: "paragraphs", lines: event.target.value.split(/\r?\n/).filter(Boolean) } : null })} /></label>
              <label className={settings.field}><span className={settings.hint}>URL</span><input className={settings.input} inputMode="url" type="url" value={entry.url ?? ""} onChange={(event) => updateEntry(index, { url: event.target.value || null })} /></label>
            </fieldset>
          ))}
        </div>
      ) : null}

      {section.layout === "inline" ? (
        <label className={settings.field}><span className={settings.hint}>Items (one per line)</span><textarea className={settings.textarea} rows={4} onChange={(event) => update({ items: event.target.value.split(/\r?\n/).filter(Boolean) })} value={current && "items" in current && current.items ? current.items.join("\n") : section.items.join("\n")} /></label>
      ) : null}

      {section.layout === "grouped" ? (
        <label className={settings.field}><span className={settings.hint}>Groups (Label: item, item)</span><textarea className={settings.textarea} rows={5} onChange={(event) => update({ groups: event.target.value.split(/\r?\n/).filter(Boolean).map((line) => { const [label, ...items] = line.split(":"); return { label: label.trim(), items: items.join(":").split(",").map((item) => item.trim()).filter(Boolean) }; }) })} value={current && "groups" in current && current.groups ? current.groups.map((group) => `${group.label}: ${group.items.join(", ")}`).join("\n") : section.groups.map((group) => `${group.label}: ${group.items.join(", ")}`).join("\n")} /></label>
      ) : null}
    </fieldset>
  );
}
