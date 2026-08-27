"use client";

import { useState } from "react";
import type { FormHTMLAttributes } from "react";
import {
  applicationObjectiveKindList,
  type ApplicationObjectiveKind,
} from "@/applications";
import {
  composeDocument,
  composableSections,
  isComposedDocumentEmpty,
  type ComposedSectionKey,
} from "@/documents/composition";
import { DocumentPreview } from "@/documents/components/document-preview";
import { SectionArrangement } from "@/documents/components/section-arrangement";
import {
  compatiblePresentationStyles,
  defaultPresentationStyleFor,
  resolvePresentationStyle,
  type PresentationStyleId,
} from "@/documents/presentation";
import type { ShippingDocumentTypeKey } from "@/documents/catalogue";
import type { DossierSnapshot } from "@/profile/dossier";
import styles from "@/styles/pages/document-create.module.css";
import settingsStyles from "@/styles/ui/document-settings.module.css";
import shell from "@/styles/pages/documents.module.css";

export type DocumentComposerProps = {
  type: ShippingDocumentTypeKey;
  objective: ApplicationObjectiveKind | null;
  snapshot: DossierSnapshot;
  createAction: FormHTMLAttributes<HTMLFormElement>["action"];
};

export function DocumentComposer({ type, objective, snapshot, createAction }: DocumentComposerProps) {
  const presentationStyles = compatiblePresentationStyles(type);
  const [presentationStyle, setPresentationStyle] = useState<PresentationStyleId>(() =>
    defaultPresentationStyleFor(type),
  );
  const [selectedObjective, setSelectedObjective] = useState<ApplicationObjectiveKind | "">(
    objective ?? "",
  );
  const initialSections = composableSections(type, snapshot);
  const [sectionOrder, setSectionOrder] = useState<readonly string[]>(() =>
    initialSections.map((section) => section.key),
  );
  const [hiddenSections, setHiddenSections] = useState<readonly string[]>([]);

  const composed = composeDocument(type, snapshot, { hiddenSections, sectionOrder });
  const selectedPresentationStyle = resolvePresentationStyle(presentationStyle, type);
  const hasContent = !isComposedDocumentEmpty(composed);

  return (
    <div className={styles.composer}>
      <section aria-labelledby="composer-preview-heading" className={styles.previewPanel}>
        <div className={styles.previewPanelHeader}>
          <div>
            <p className={shell.eyebrow}>Live preview</p>
            <h2 id="composer-preview-heading">{selectedPresentationStyle.label}</h2>
          </div>
          <span className={styles.previewHint}>Updates as you configure</span>
        </div>
        {hasContent ? (
          <DocumentPreview document={composed} presentationStyle={selectedPresentationStyle} />
        ) : (
          <div className={styles.emptyNotice}>
            <h2>There is nothing in your dossier to show yet.</h2>
            <p>Add your name, contact details and one section to see the document here.</p>
          </div>
        )}
      </section>

      <aside aria-label="Document configuration" className={styles.composerControls}>
        <div className={settingsStyles.field}>
          <label className={settingsStyles.label} htmlFor="document-objective">
            Purpose <span className={styles.optionalLabel}>(optional)</span>
          </label>
          <select
            className={settingsStyles.input}
            id="document-objective"
            onChange={(event) =>
              setSelectedObjective(event.target.value as ApplicationObjectiveKind | "")
            }
            value={selectedObjective}
          >
            <option value="">No application context</option>
            {applicationObjectiveKindList.map((kind) => (
              <option key={kind.key} value={kind.key}>{kind.label}</option>
            ))}
          </select>
          <p className={settingsStyles.hint}>
            Adds context to this draft. It does not change your dossier.
          </p>
        </div>

        <fieldset className={settingsStyles.fieldset}>
          <legend className={settingsStyles.legend}>Style</legend>
          <div className={styles.styleChoices} role="radiogroup" aria-label="Document style">
            {presentationStyles.map((option) => (
              <label
                className={`${styles.styleChoice} ${option.id === presentationStyle ? styles.styleChoiceSelected : ""}`}
                key={option.id}
              >
                <input
                  checked={option.id === presentationStyle}
                  name="presentation-style-choice"
                  onChange={() => setPresentationStyle(option.id)}
                  type="radio"
                  value={option.id}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {initialSections.length > 0 ? (
          <fieldset className={settingsStyles.fieldset}>
            <legend className={settingsStyles.legend}>Sections</legend>
            <p className={settingsStyles.hint}>
              Choose what appears and arrange the order before creating the document.
            </p>
            <SectionArrangement
              hiddenSections={hiddenSections}
              onConfigurationChange={(nextOrder, nextHidden) => {
                setSectionOrder(nextOrder);
                setHiddenSections(nextHidden);
              }}
              sections={initialSections}
            />
          </fieldset>
        ) : null}

        <form action={createAction} className={styles.createForm}>
          <input name="objective" type="hidden" value={selectedObjective} />
          <input name="type" type="hidden" value={type} />
          <input name="template" type="hidden" value={presentationStyle} />
          {sectionOrder.map((key) => (
            <input key={`order-${key}`} name="order" type="hidden" value={key} />
          ))}
          {hiddenSections.map((key) => (
            <input key={`hidden-${key}`} name="hidden" type="hidden" value={key} />
          ))}
          <button className={shell.primaryButton} type="submit">
            Create document
          </button>
          <p className={styles.createNote}>
            Your dossier stays unchanged. This saves the current style and section choices as a draft.
          </p>
        </form>
      </aside>
    </div>
  );
}

