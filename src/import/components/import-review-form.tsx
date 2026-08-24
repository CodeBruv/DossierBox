"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { discardDocumentImportAction } from "../actions";
import {
  importFieldName,
  IMPORT_ROW_LEVEL_FIELD,
  type ImportReview,
  type ImportReviewBasics,
  type ImportReviewField,
  type ImportReviewRow,
} from "../review";
import { initialImportFormState, type ImportFormState } from "../state";
import { ImportFieldControl } from "./import-field";
import styles from "@/styles/pages/import.module.css";

type ImportReviewFormProps = {
  /** Already bound to the import being reviewed, so the id is not a client-supplied value. */
  action: (state: ImportFormState, formData: FormData) => Promise<ImportFormState>;
  importId: string;
  filename: string;
  review: ImportReview;
};

/**
 * The review screen: everything the document proposed, for the user to confirm or correct.
 *
 * The whole component is stateful because it has to be. A commit can be rejected — a corrected
 * grade still missing the system it is expressed in, say — and when it is, the server returns
 * messages but not the twenty rows, which live in the database. The screen re-renders from the
 * stored reading, and if the inputs took their values from that reading, every correction the
 * user had made would vanish on the failure of a single unrelated row. So the field values and
 * the tick state are held here and survive the action's re-render.
 *
 * What is ticked at the start is what can be saved without further typing. A row the document
 * stated completely is ticked; a row still missing something its section requires is left for
 * the user to complete and tick themselves, rather than pre-ticked into a submission the
 * validation would only reject. Nothing reaches the dossier that the person did not look at.
 */
export function ImportReviewForm({
  action,
  importId,
  filename,
  review,
}: ImportReviewFormProps) {
  const [form, formAction, pending] = useActionState<ImportFormState, FormData>(
    action,
    initialImportFormState,
  );

  const rows = useMemo(() => review.groups.flatMap((group) => group.rows), [review.groups]);

  /* Every field's current value, keyed by its prefixed form name. */
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(review));
  const setValue = (name: string, value: string) =>
    setValues((previous) => ({ ...previous, [name]: value }));

  /* Which rows are ticked for import. The details row behaves like any other row here. */
  const [included, setIncluded] = useState<Record<string, boolean>>(() => initialIncluded(review));
  const setRowIncluded = (rowId: string, on: boolean) =>
    setIncluded((previous) => ({ ...previous, [rowId]: on }));

  const fieldErrors = form.fieldErrors ?? {};
  const rowsWithErrors = new Set(form.rowsWithErrors ?? []);

  const selectedCount =
    rows.filter((row) => included[row.id]).length +
    (!review.basics.empty && included[review.basics.id] ? 1 : 0);

  const shared = {
    fieldErrors,
    onValueChange: setValue,
    values,
  };

  return (
    <>
      <form action={formAction} className={styles.reviewForm} noValidate>
        <div className={styles.scanBanner} role="status">
          <p className={styles.scanTitle}>Your document has been scanned</p>
          <p className={styles.scanDetail}>
            We read <strong>{filename}</strong> and matched what we found against your dossier.
            Nothing is added until you add it. Check each item, correct anything we misread, and
            untick anything you would rather leave out.
          </p>
          <p className={styles.scanCounts}>
            {review.totalRows} {review.totalRows === 1 ? "item" : "items"} found
            {review.rowsNeedingReview > 0
              ? ` · ${review.rowsNeedingReview} to review`
              : " · all matched automatically"}
          </p>
        </div>

        {form.message ? (
          <div className={styles.errorSummary} role="alert">
            {form.message}
          </div>
        ) : null}

        {!review.basics.empty ? (
          <BasicsCard
            {...shared}
            basics={review.basics}
            hasError={rowsWithErrors.has(review.basics.id)}
            included={Boolean(included[review.basics.id])}
            onIncludedChange={(on) => setRowIncluded(review.basics.id, on)}
          />
        ) : null}

        {review.groups.map((group) => (
          <section
            aria-labelledby={`group-${group.section}`}
            className={styles.group}
            key={group.section}
          >
            <h2 className={styles.groupHeading} id={`group-${group.section}`}>
              {group.label}
              <span className={styles.groupCount}>
                {group.rows.length} {group.rows.length === 1 ? "item" : "items"}
              </span>
            </h2>
            <div className={styles.rowList}>
              {group.rows.map((row) => (
                <RowCard
                  {...shared}
                  hasError={rowsWithErrors.has(row.id)}
                  included={Boolean(included[row.id])}
                  key={row.id}
                  onIncludedChange={(on) => setRowIncluded(row.id, on)}
                  row={row}
                />
              ))}
            </div>
          </section>
        ))}

        {review.skipped.length > 0 ? (
          <details className={styles.skipped}>
            <summary>
              Not recognised
              <span className={styles.groupCount}>{review.skipped.length}</span>
            </summary>
            <p className={styles.skippedLead}>
              We read these lines but could not place them in your dossier. Nothing here is lost
              from your original document — add anything that matters directly once you are done.
            </p>
            <ul className={styles.skippedList}>
              {review.skipped.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className={styles.reviewActions}>
          <button
            className={styles.primaryButton}
            disabled={pending || selectedCount === 0}
            type="submit"
          >
            {pending
              ? "Adding…"
              : selectedCount === 0
                ? "Select items to add"
                : `Add ${selectedCount} ${selectedCount === 1 ? "item" : "items"} to my dossier`}
          </button>
          <Link className={styles.quietLink} href="/profile">
            Cancel
          </Link>
        </div>
      </form>

      {/*
       * A separate form, not a button inside the one above. Discarding needs none of the
       * review's fields, and nesting forms is invalid HTML.
       */}
      <form action={discardDocumentImportAction} className={styles.discardForm}>
        <input name="importId" type="hidden" value={importId} />
        <p>
          Not the document you meant to upload?{" "}
          <button className={styles.linkButton} type="submit">
            Discard this scan
          </button>
        </p>
      </form>
    </>
  );
}

/* Cards ----------------------------------------------------------------------- */

type SharedCardProps = {
  fieldErrors: Record<string, string[]>;
  hasError: boolean;
  included: boolean;
  onIncludedChange: (on: boolean) => void;
  onValueChange: (name: string, value: string) => void;
  values: Record<string, string>;
};

function BasicsCard({ basics, ...rest }: SharedCardProps & { basics: ImportReviewBasics }) {
  return (
    <Card
      {...rest}
      fields={basics.fields}
      includeName={basics.includeName}
      notes={basics.notes}
      ready={basics.ready}
      rowId={basics.id}
      source={basics.source}
      status={basics.status}
      subtitle="Your name and how people reach you"
      title="Your details"
    />
  );
}

function RowCard({ row, ...rest }: SharedCardProps & { row: ImportReviewRow }) {
  return (
    <Card
      {...rest}
      fields={row.fields}
      includeName={row.includeName}
      notes={row.notes}
      ready={row.ready}
      rowId={row.id}
      source={row.source}
      status={row.status}
      subtitle={row.sectionLabel}
      title={row.title}
    />
  );
}

function Card({
  fieldErrors,
  fields,
  hasError,
  includeName,
  included,
  notes,
  onIncludedChange,
  onValueChange,
  ready,
  rowId,
  source,
  status,
  subtitle,
  title,
  values,
}: SharedCardProps & {
  fields: readonly ImportReviewField[];
  includeName: string;
  notes: readonly string[];
  ready: boolean;
  rowId: string;
  source: readonly string[];
  status: ImportReviewRow["status"];
  subtitle: string;
  title: string;
}) {
  const headingId = `${rowId}-heading`;
  const rowErrors = fieldErrors[importFieldName(rowId, IMPORT_ROW_LEVEL_FIELD)];

  /*
   * "I currently work here" makes the end date not a question, so its fields are dropped
   * here as well as on the server. Without this, ticking the box on this screen would submit
   * a current entry *and* an end date, which the dossier's own validation refuses.
   */
  const visible = fields.filter((entry) => {
    const clearedBy = entry.field.clearedBy;
    if (!clearedBy) return true;
    return values[importFieldName(rowId, clearedBy)] !== "on";
  });

  return (
    <section
      aria-labelledby={headingId}
      className={[styles.card, hasError ? styles.cardError : ""].filter(Boolean).join(" ")}
    >
      <header className={styles.cardHeader}>
        <label className={styles.include}>
          {/*
           * An unticked checkbox submits nothing at all, which is how the server reads "no".
           * The name is the row's own, from the review model, so the form cannot address a
           * row the import does not contain.
           */}
          <input
            checked={included}
            name={includeName}
            onChange={(event) => onIncludedChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong id={headingId}>{title}</strong>
            <small>{subtitle}</small>
          </span>
        </label>
        <span
          className={[
            styles.badge,
            status === "matched" ? styles.badgeMatched : styles.badgeReview,
          ].join(" ")}
        >
          {status === "matched" ? "Matched automatically" : "Needs review"}
        </span>
      </header>

      <div className={styles.cardBody}>
        {!ready ? (
          <p className={styles.needsDetail}>
            Your document did not give everything this needs. Fill in the highlighted field,
            then tick this item to add it.
          </p>
        ) : null}

        {notes.length > 0 ? (
          <ul className={styles.notes}>
            {notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        ) : null}

        <div className={styles.fields}>
          {visible.map((entry) => (
            <ImportFieldControl
              dependencyValue={
                entry.field.dependsOn
                  ? values[importFieldName(rowId, entry.field.dependsOn)] ?? ""
                  : ""
              }
              errors={fieldErrors[entry.name]}
              field={entry.field}
              key={entry.name}
              name={entry.name}
              onChange={(value) => onValueChange(entry.name, value)}
              read={entry.read}
              value={values[entry.name] ?? ""}
            />
          ))}
        </div>

        {rowErrors?.length ? <div className={styles.fieldError}>{rowErrors.join(" ")}</div> : null}

        {source.length > 0 ? (
          <details className={styles.source}>
            <summary>Read from your document</summary>
            <ul>
              {source.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

/* Initial state --------------------------------------------------------------- */

function initialValues(review: ImportReview): Record<string, string> {
  const values: Record<string, string> = {};

  const take = (fields: readonly ImportReviewField[]) => {
    for (const entry of fields) values[entry.name] = entry.value;
  };

  take(review.basics.fields);
  for (const group of review.groups) {
    for (const row of group.rows) take(row.fields);
  }

  return values;
}

/**
 * Which rows begin ticked.
 *
 * A row that can be saved as it stands is ticked; one still missing a required field is not,
 * so the user completes it deliberately. The details row follows the same rule but is never
 * ticked when the document said nothing about the person.
 */
function initialIncluded(review: ImportReview): Record<string, boolean> {
  const included: Record<string, boolean> = {};

  if (!review.basics.empty) included[review.basics.id] = review.basics.ready;
  for (const group of review.groups) {
    for (const row of group.rows) included[row.id] = row.ready;
  }

  return included;
}
