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
  /** How many entries each section holds, so this screen cannot offer to hide data. */
  counts: Readonly<Partial<Record<ProfileSectionKey, number>>>;
};

/**
 * Choosing what the dossier should hold.
 *
 * This screen picks the sections a user wants to be *walked through*. It is not a
 * visibility switch over saved information, and the difference matters: a section
 * holding entries is part of the dossier whatever this form says, because presence
 * is derived from the data rather than from a separate list that can disagree
 * with it.
 *
 * So a populated section is shown checked and locked rather than merely
 * pre-selected. Offering an unchecked box for a section holding six jobs would
 * promise a removal this form cannot perform — the entries would still be there,
 * and the dossier would still list them. Removing a section means removing its
 * information, which happens on the section's own screen where the user can see
 * exactly what they are deleting.
 *
 * A locked checkbox submits nothing, so each one is paired with a hidden input
 * carrying the same value. Without it, saving would drop the section from the
 * chosen order — recoverable, since the section reappears from its own entry
 * count, but it would silently reorder the user's dossier on every save.
 */
export function ProfileSectionsForm({ action, counts, selected }: ProfileSectionsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialProfileFormState);
  const submittedSections = state.multipleValues?.sections;
  const submitted = submittedSections ? new Set(submittedSections) : null;

  return (
    <form action={formAction} className={styles.form}>
      {state.message ? <div className={styles.errorSummary} role="alert">{state.message}</div> : null}
      <fieldset className={styles.sectionPicker}>
        <legend>Optional profile sections</legend>
        <p className={styles.fieldHint}>
          Choose the sections that are useful to you. Anything you have already saved
          stays in your dossier — to drop one of those sections, delete its entries.
        </p>
        {profileSections.map((section) => {
          const held = counts[section.key] ?? 0;

          return (
            <label className={styles.sectionChoice} key={section.key}>
              <input
                defaultChecked={
                  held > 0
                    ? true
                    : submitted
                      ? submitted.has(section.key)
                      : selected.includes(section.key)
                }
                disabled={held > 0}
                name={held > 0 ? undefined : "sections"}
                type="checkbox"
                value={section.key}
              />
              {held > 0 ? <input name="sections" type="hidden" value={section.key} /> : null}
              <span>
                <strong>{section.label}</strong>
                <small>
                  {held > 0
                    ? `${held} ${held === 1 ? "entry" : "entries"} saved · already in your dossier`
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
