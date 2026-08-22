"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ProfileSectionDefinition } from "../sections";
import { initialProfileFormState, type ProfileFormState } from "../types";
import styles from "@/styles/pages/profile.module.css";

type ProfileEntryFormProps = {
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  /**
   * Only shown when creating. Editing one entry has no "another" to add, and
   * offering it there would be a button that exists because the code allows it
   * rather than because the user needs it.
   */
  allowAddAnother?: boolean;
  cancelHref: string;
  definition: ProfileSectionDefinition;
  initialValues?: Record<string, unknown>;
  submitLabel: string;
};

export function ProfileEntryForm({
  action,
  allowAddAnother = false,
  cancelHref,
  definition,
  initialValues = {},
  submitLabel,
}: ProfileEntryFormProps) {
  const [state, formAction, pending] = useActionState(action, initialProfileFormState);

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? (
        <div className={styles.errorSummary} role="alert">
          {state.message}
        </div>
      ) : null}

      <div className={styles.formFields}>
        {definition.fields.map((field) => {
          const errors = state.fieldErrors?.[field.name];
          const submittedValue = state.values?.[field.name];
          const initialValue = initialValues[field.name];
          const value = submittedValue ?? toInputValue(initialValue);
          const errorId = `${field.name}-error`;
          const hintId = `${field.name}-hint`;
          const describedBy = [field.hint ? hintId : null, errors?.length ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined;

          if (field.type === "checkbox") {
            return (
              <div className={styles.checkboxField} key={field.name}>
                <input
                  aria-describedby={describedBy}
                  defaultChecked={submittedValue ? submittedValue === "on" : Boolean(initialValue)}
                  id={field.name}
                  name={field.name}
                  type="checkbox"
                />
                <label htmlFor={field.name}>{field.label}</label>
                {errors?.length ? <FieldErrors id={errorId} errors={errors} /> : null}
              </div>
            );
          }

          return (
            <div
              className={field.type === "textarea" ? styles.fieldWide : styles.field}
              key={field.name}
            >
              <label htmlFor={field.name}>
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </label>

              {field.type === "textarea" ? (
                <textarea
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors?.length)}
                  defaultValue={value}
                  id={field.name}
                  name={field.name}
                  rows={5}
                />
              ) : field.type === "select" ? (
                <select
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors?.length)}
                  defaultValue={value}
                  id={field.name}
                  name={field.name}
                  required={field.required}
                >
                  <option value="">Choose an option</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors?.length)}
                  autoComplete={field.autocomplete}
                  defaultValue={value}
                  id={field.name}
                  inputMode={field.type === "number" ? "numeric" : undefined}
                  max={field.name.toLowerCase().includes("month") ? 12 : undefined}
                  min={field.name.toLowerCase().includes("month") ? 1 : undefined}
                  name={field.name}
                  required={field.required}
                  type={field.type ?? "text"}
                />
              )}

              {field.hint ? (
                <p className={styles.fieldHint} id={hintId}>
                  {field.hint}
                </p>
              ) : null}
              {errors?.length ? <FieldErrors id={errorId} errors={errors} /> : null}
            </div>
          );
        })}
      </div>

      <div className={styles.formActions}>
        <button
          className={styles.primaryButton}
          disabled={pending}
          name="intent"
          type="submit"
          value="stay"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        {allowAddAnother ? (
          <button
            className={styles.secondaryButton}
            disabled={pending}
            name="intent"
            type="submit"
            value="another"
          >
            Save and add another
          </button>
        ) : null}
        <Link className={styles.quietLink} href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FieldErrors({ id, errors }: { id: string; errors: string[] }) {
  return (
    <div className={styles.fieldError} id={id}>
      {errors.join(" ")}
    </div>
  );
}

function toInputValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}
