"use client";

import type { ProfileField } from "@/profile/sections";
import { CUSTOM_CHOICE, gradeControlFor, monthOptions } from "@/profile/vocabularies";
import styles from "@/styles/pages/import.module.css";

const MINIMUM_YEAR = 1900;

type ImportFieldControlProps = {
  field: ProfileField;
  /** The prefixed form name this field submits under. */
  name: string;
  value: string;
  /** The document stated this. Where false, the user is being asked rather than shown. */
  read: boolean;
  errors?: readonly string[];
  /** The current value of the field named in `dependsOn` — a grade needs its system. */
  dependencyValue: string;
  onChange: (value: string) => void;
};

/**
 * One field on the review screen.
 *
 * Every control here is fully controlled, which is the opposite of the dossier's own form and
 * is deliberate. A review submission can fail on row nineteen, and when it does this screen
 * re-renders from the *stored reading* rather than from the submission — the reading is where
 * the rows come from. If the inputs took their values from that reading, a correction the user
 * made to row three would be silently thrown away by a failure in row nineteen. Holding the
 * values in React state instead means the component survives the action's re-render and so do
 * the corrections.
 *
 * The controls themselves are the dossier's, chosen from the same field definitions, so a
 * grading system offers the same systems and a month offers the same months. What is added is
 * the one thing only an import has: a field the document did not state is marked as such,
 * rather than looking like an answer the user gave and left blank.
 */
export function ImportFieldControl({
  field,
  name,
  value,
  read,
  errors,
  dependencyValue,
  onChange,
}: ImportFieldControlProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const listId = `${name}-options`;

  if (field.type === "checkbox") {
    return (
      <div className={styles.checkboxField}>
        <input
          checked={value === "on"}
          id={name}
          name={name}
          onChange={(event) => onChange(event.target.checked ? "on" : "")}
          type="checkbox"
        />
        <label htmlFor={name}>{field.label}</label>
        {errors?.length ? <FieldErrors errors={errors} id={errorId} /> : null}
      </div>
    );
  }

  const grade = field.type === "grade" ? gradeControlFor(dependencyValue) : null;

  /* A grade with no system chosen is a box whose answer cannot be interpreted. */
  if (field.type === "grade" && !grade) return null;

  const custom = isCustom(field, value);
  const hint = custom
    ? undefined
    : field.hint ?? (grade?.kind === "number" ? grade.hint : undefined);
  const describedBy =
    [hint ? hintId : null, errors?.length ? errorId : null].filter(Boolean).join(" ") || undefined;

  const shared = {
    "aria-describedby": describedBy,
    "aria-invalid": Boolean(errors?.length),
    id: name,
    name,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };

  return (
    <div className={fieldClassName(field)}>
      <label htmlFor={name}>
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
        {/*
         * Only said about a field the section requires. Marking every unstated optional
         * field would put a warning beside two thirds of a normal CV, which trains people
         * to ignore all of them.
         */}
        {!read && field.required ? (
          <span className={styles.notRecognised}>Not recognised</span>
        ) : null}
      </label>

      {custom ? (
        <>
          <input
            {...shared}
            type="text"
            value={value === CUSTOM_CHOICE ? "" : value}
          />
          <button className={styles.inlineReset} onClick={() => onChange("")} type="button">
            Choose from the list instead
          </button>
        </>
      ) : field.type === "textarea" ? (
        <textarea {...shared} rows={5} value={value} />
      ) : field.type === "month" ? (
        <select {...shared} value={value}>
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
          inputMode="numeric"
          max={new Date().getUTCFullYear() + 20}
          min={MINIMUM_YEAR}
          placeholder="YYYY"
          type="number"
          value={value}
        />
      ) : field.type === "combobox" ? (
        <>
          <input {...shared} autoComplete="off" list={listId} type="text" value={value} />
          <datalist id={listId}>
            {field.suggestions?.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </>
      ) : field.type === "grade" && grade ? (
        grade.kind === "options" ? (
          <select {...shared} value={value}>
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
            inputMode="decimal"
            max={grade.kind === "number" ? grade.max : undefined}
            min={grade.kind === "number" ? 0 : undefined}
            step={grade.kind === "number" ? grade.step : undefined}
            type={grade.kind === "number" ? "number" : "text"}
            value={value}
          />
        )
      ) : field.type === "select" ? (
        <select {...shared} value={value}>
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
          placeholder={field.placeholder}
          type={field.type ?? "text"}
          value={value}
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
}

/**
 * Whether a field is showing its own text input rather than the curated list.
 *
 * This matters more on an import than anywhere else. A document can perfectly well say
 * "Higher National Diploma" or name a grading system we do not list, and treating a value
 * that is not one of our options as "nothing selected" would quietly discard the user's own
 * qualification on the way into their dossier.
 */
function isCustom(field: ProfileField, value: string): boolean {
  if (!field.allowCustom) return false;
  if (value === CUSTOM_CHOICE) return true;
  return value !== "" && !field.options?.some((option) => option.value === value);
}

function fieldClassName(field: ProfileField): string {
  if (field.type === "textarea") return styles.fieldWide as string;
  if (field.type === "month" || field.type === "year" || field.type === "grade") {
    return styles.fieldNarrow as string;
  }
  return styles.field as string;
}

function FieldErrors({ id, errors }: { id: string; errors: readonly string[] }) {
  return (
    <div className={styles.fieldError} id={id}>
      {errors.join(" ")}
    </div>
  );
}
