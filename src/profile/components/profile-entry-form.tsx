"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ProfileField, ProfileSectionDefinition } from "../sections";
import { initialProfileFormState, type ProfileFormState } from "../types";
import { CUSTOM_CHOICE, gradeControlFor, monthOptions } from "../vocabularies";
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

const MINIMUM_YEAR = 1900;

/**
 * One entry in one dossier section.
 *
 * The form is driven entirely by the section's field definitions, so a field becomes a
 * searchable list, a month picker or a grade box by declaring it — not by adding a branch
 * to a page. What this component contributes is the interactive part of that: three fields
 * change what other fields ask.
 *
 * 1. Ticking "I currently work here" removes the end date, and removing the inputs is how
 *    the end date gets cleared on save. There is no separate "blank these columns" step to
 *    forget.
 * 2. Choosing a grading system decides what a grade even looks like — a classification, a
 *    number out of five, a percentage — so the grade field appears only once the system is
 *    known, in the one form that applies.
 * 3. Any curated list can be escaped. Selecting the custom option hands the field's name to
 *    a text input, so the value that reaches the server is either a curated option or the
 *    user's own words, and never the sentinel that revealed the input.
 *
 * The interactive state is deliberately thin: a map of the fields the user has touched.
 * Everything else reads through {@link ProfileEntryForm.valueFor}, which prefers the
 * submitted value over the stored one, so a rejected save re-renders showing what the
 * person typed rather than what the database still holds.
 */
export function ProfileEntryForm({
  action,
  allowAddAnother = false,
  cancelHref,
  definition,
  initialValues = {},
  submitLabel,
}: ProfileEntryFormProps) {
  const [form, formAction, pending] = useActionState(action, initialProfileFormState);

  /**
   * Only the fields the user has actually changed. Everything else resolves from the
   * submitted values or the stored row, so this holds no copy of the entry and cannot
   * drift out of step with it.
   */
  const [touched, setTouchedValues] = useState<Record<string, string>>({});
  const setTouched = (name: string, value: string) =>
    setTouchedValues((previous) => ({ ...previous, [name]: value }));

  const valueFor = (name: string): string => {
    if (Object.hasOwn(touched, name)) return touched[name] as string;
    const submitted = form.values?.[name];
    if (submitted !== undefined) return submitted;
    return toInputValue(initialValues[name]);
  };

  /**
   * Fields whose value another field reads, plus fields that can switch to a custom
   * input. Only these are controlled; the rest stay uncontrolled so typing in a text box
   * does not re-render the form.
   */
  const controlled = new Set<string>();
  for (const field of definition.fields) {
    if (field.dependsOn) controlled.add(field.dependsOn);
    if (field.clearedBy) controlled.add(field.clearedBy);
    if (field.allowCustom) controlled.add(field.name);
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      {form.message ? (
        <div className={styles.errorSummary} role="alert">
          {form.message}
        </div>
      ) : null}

      <div className={styles.formFields}>
        {definition.fields.map((field) => {
          // Cleared by a checkbox: not rendered, so it submits nothing and the column is
          // blanked. "Still studying here" and a stored end date cannot both survive.
          if (field.clearedBy && valueFor(field.clearedBy) === "on") return null;

          const errors = form.fieldErrors?.[field.name];
          const value = valueFor(field.name);
          const errorId = `${field.name}-error`;
          const hintId = `${field.name}-hint`;
          const listId = `${field.name}-options`;

          if (field.type === "checkbox") {
            const checked = value === "on";
            return (
              <div className={styles.checkboxField} key={field.name}>
                <input
                  checked={controlled.has(field.name) ? checked : undefined}
                  defaultChecked={controlled.has(field.name) ? undefined : checked}
                  id={field.name}
                  name={field.name}
                  onChange={
                    controlled.has(field.name)
                      ? (event) => setTouched(field.name, event.target.checked ? "on" : "")
                      : undefined
                  }
                  type="checkbox"
                />
                <label htmlFor={field.name}>{field.label}</label>
                {errors?.length ? <FieldErrors errors={errors} id={errorId} /> : null}
              </div>
            );
          }

          const grade = field.type === "grade" ? gradeControlFor(valueFor(field.dependsOn ?? "")) : null;

          // A grade with no grading system chosen is a box that cannot be interpreted.
          // It appears when the question has an answer, which is the whole point of
          // asking about the system first.
          if (field.type === "grade" && !grade) return null;

          const custom = isCustom(field, value);
          const hint = custom ? undefined : field.hint ?? (grade?.kind === "number" ? grade.hint : undefined);
          const describedBy =
            [hint ? hintId : null, errors?.length ? errorId : null].filter(Boolean).join(" ") || undefined;
          const shared = {
            "aria-describedby": describedBy,
            "aria-invalid": Boolean(errors?.length),
            id: field.name,
            name: field.name,
          };

          return (
            <div className={fieldClassName(field)} key={field.name}>
              <label htmlFor={field.name}>
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </label>

              {custom ? (
                <>
                  <input
                    {...shared}
                    autoFocus
                    defaultValue={value === CUSTOM_CHOICE ? "" : value}
                    required={field.required}
                    type="text"
                  />
                  <button
                    className={styles.inlineReset}
                    onClick={() => setTouched(field.name, "")}
                    type="button"
                  >
                    Choose from the list instead
                  </button>
                </>
              ) : field.type === "textarea" ? (
                <textarea {...shared} defaultValue={value} rows={5} />
              ) : field.type === "month" ? (
                <select {...shared} defaultValue={value}>
                  <option value="">Month</option>
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "year" ? (
                <input
                  {...shared}
                  defaultValue={value}
                  inputMode="numeric"
                  max={new Date().getUTCFullYear() + 20}
                  min={MINIMUM_YEAR}
                  placeholder="YYYY"
                  type="number"
                />
              ) : field.type === "combobox" ? (
                <>
                  <input
                    {...shared}
                    autoComplete="off"
                    defaultValue={value}
                    list={listId}
                    required={field.required}
                    type="text"
                  />
                  <datalist id={listId}>
                    {field.suggestions?.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                </>
              ) : field.type === "grade" && grade ? (
                grade.kind === "options" ? (
                  <select {...shared} defaultValue={value}>
                    <option value="">Not stated</option>
                    {grade.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...shared}
                    defaultValue={value}
                    inputMode="decimal"
                    max={grade.kind === "number" ? grade.max : undefined}
                    min={grade.kind === "number" ? 0 : undefined}
                    step={grade.kind === "number" ? grade.step : undefined}
                    type={grade.kind === "number" ? "number" : "text"}
                  />
                )
              ) : field.type === "select" ? (
                <select
                  {...shared}
                  defaultValue={controlled.has(field.name) ? undefined : value}
                  onChange={
                    controlled.has(field.name)
                      ? (event) => setTouched(field.name, event.target.value)
                      : undefined
                  }
                  required={field.required}
                  value={controlled.has(field.name) ? value : undefined}
                >
                  <option value="">Choose an option</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  {field.allowCustom ? (
                    <option value={CUSTOM_CHOICE}>{field.customLabel ?? "Something else"}</option>
                  ) : null}
                </select>
              ) : (
                <input
                  {...shared}
                  autoComplete={field.autocomplete}
                  defaultValue={value}
                  placeholder={field.placeholder}
                  required={field.required}
                  type={field.type ?? "text"}
                />
              )}

              {hint ? (
                <p className={styles.fieldHint} id={hintId}>
                  {hint}
                </p>
              ) : null}
              {errors?.length ? <FieldErrors errors={errors} id={errorId} /> : null}
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

/**
 * Whether a field is currently showing its custom text input.
 *
 * Two ways in, and both matter. The user can pick the custom option, which stores the
 * sentinel. Or they can be editing a record whose stored value predates the curated list —
 * or came from an import, or from a country we do not list — in which case the value is
 * real and simply is not an option. Treating that as "nothing selected" would silently
 * discard the user's own words the next time they saved.
 */
function isCustom(field: ProfileField, value: string): boolean {
  if (!field.allowCustom) return false;
  if (value === CUSTOM_CHOICE) return true;
  return value !== "" && !field.options?.some((option) => option.value === value);
}

/**
 * Narrow fields pair up on a wide screen; a textarea and a wide field take the row. Dates
 * are the reason: four separate full-width boxes for one period is a form that looks like a
 * database table.
 */
function fieldClassName(field: ProfileField): string {
  if (field.type === "textarea") return styles.fieldWide as string;
  if (field.type === "month" || field.type === "year" || field.type === "grade") {
    return styles.fieldNarrow as string;
  }
  return styles.field as string;
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
