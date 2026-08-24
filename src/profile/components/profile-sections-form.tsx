"use client";

import Link from "next/link";
import { useActionState } from "react";
import { profileSections } from "../sections";
import { initialProfileFormState, type ProfileFormState, type ProfileSectionKey } from "../types";
import styles from "@/styles/pages/profile.module.css";

type ProfileSectionsFormProps = {
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  /** Sections the user has already chosen. */
  selected: readonly ProfileSectionKey[];
  /** How many entries each section holds, so each row can say what unticking will do. */
  counts: Readonly<Partial<Record<ProfileSectionKey, number>>>;
};

/**
 * Choosing which sections the dossier is built around.
 *
 * This is a planning screen: it sets the sections the user wants to be walked through,
 * and the order they are walked through in. It is deliberately *not* a visibility switch
 * over saved information, and it is not where a user decides what a particular document
 * shows — that belongs to the document, where the change can be seen in the preview.
 *
 * Every box is a live control, including the ones for sections that already hold entries.
 * An earlier version locked those, reasoning that offering an unchecked box promised a
 * removal this form cannot perform. That was the wrong trade: it left the user staring at
 * a control they were not allowed to touch, with no explanation of what to do instead.
 *
 * The honest version says what actually happens. Unticking a populated section takes it
 * out of the build order; the entries stay, because information is removed by deleting it
 * on the section's own screen where the user can see what they are deleting — never as a
 * side effect of a checkbox on another page. Each populated row states that in place, so
 * the consequence is visible before the click rather than surprising after it.
 */
export function ProfileSectionsForm({ action, counts, selected }: ProfileSectionsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialProfileFormState);
  const submittedSections = state.multipleValues?.sections;
  const submitted = submittedSections ? new Set(submittedSections) : null;

  return (
    <form action={formAction} className={styles.form}>
      {state.message ? <div className={styles.errorSummary} role="alert">{state.message}</div> : null}
      <fieldset className={styles.sectionPicker}>
        <legend>Sections to build</legend>
        <p className={styles.fieldHint}>
          Tick the sections worth building for your background. Nothing you have saved is
          deleted by a change here — to remove information, delete its entries on that
          section. What each document shows is chosen on the document itself.
        </p>
        {profileSections.map((section) => {
          const held = counts[section.key] ?? 0;
          const checked = submitted ? submitted.has(section.key) : selected.includes(section.key);

          return (
            <label className={styles.sectionChoice} key={section.key}>
              <input
                defaultChecked={checked}
                name="sections"
                type="checkbox"
                value={section.key}
              />
              <span>
                <strong>{section.label}</strong>
                <small>
                  {held > 0
                    ? `${held} ${held === 1 ? "entry" : "entries"} saved · kept in your dossier either way`
                    : section.description}
                </small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className={styles.formActions}>
        <button
          className={styles.primaryButton}
          disabled={pending}
          name="intent"
          type="submit"
          value="continue"
        >
          {pending ? "Saving..." : "Save and start building"}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={pending}
          name="intent"
          type="submit"
          value="stay"
        >
          Save only
        </button>
        <Link className={styles.quietLink} href="/profile">Cancel</Link>
      </div>
    </form>
  );
}
