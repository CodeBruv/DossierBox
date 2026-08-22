"use client";

import Link from "next/link";
import { useActionState } from "react";
import { profileSections } from "../sections";
import { initialProfileFormState, type ProfileFormState, type ProfileSectionKey } from "../types";
import styles from "@/styles/pages/profile.module.css";

type ProfileSectionsFormProps = {
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  selected: readonly ProfileSectionKey[];
};

export function ProfileSectionsForm({ action, selected }: ProfileSectionsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialProfileFormState);
  const submittedSections = state.multipleValues?.sections;
  const submitted = submittedSections ? new Set(submittedSections) : null;

  return (
    <form action={formAction} className={styles.form}>
      {state.message ? <div className={styles.errorSummary} role="alert">{state.message}</div> : null}
      <fieldset className={styles.sectionPicker}>
        <legend>Optional profile sections</legend>
        <p className={styles.fieldHint}>Choose only the sections that are useful to you. You can change this later without deleting saved entries.</p>
        {profileSections.map((section) => (
          <label className={styles.sectionChoice} key={section.key}>
            <input
              defaultChecked={submitted ? submitted.has(section.key) : selected.includes(section.key)}
              name="sections"
              type="checkbox"
              value={section.key}
            />
            <span>
              <strong>{section.label}</strong>
              <small>{section.description}</small>
            </span>
          </label>
        ))}
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
