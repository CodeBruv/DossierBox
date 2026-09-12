"use client";

/**
 * The one control that decides which sections this document shows and in what order.
 *
 * Visibility and order are deliberately the same list rather than two. They are the same
 * decision seen twice — "what is on this page, and what does the reader meet first" — and
 * splitting them produces the familiar bad version of this UI: a checkbox list beside an
 * order list, which the user has to mentally join to work out what they are getting.
 *
 * ## Why this one component is a client island
 *
 * The rest of the workspace form is server-rendered on purpose (see `document-settings`),
 * and that has not changed. Reordering is the exception because there is no server-only
 * way to express it: a re-render per nudge would mean a round trip and a page repaint for
 * every move, on a control whose whole point is trying arrangements quickly.
 *
 * The island is small and carries no career information — only the section headings the
 * page is already showing. Nothing about the document's contents is sent to the browser to
 * make this work.
 *
 * ## Without JavaScript
 *
 * The rows render on the server in the document's saved order, and the hidden `order`
 * inputs render with them, so submitting the form before this component hydrates saves the
 * existing order rather than clearing it. Visibility keeps working, because it is a real
 * checkbox. Only the moving itself needs JavaScript, and that is the honest cost.
 *
 * ## How order reaches the server
 *
 * Each row carries `<input type="hidden" name="order">`. `FormData.getAll` preserves
 * document order, so moving a row in the DOM *is* the submission — there are no position
 * numbers to be written, validated, or to drift out of step with what the user sees.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClonedPageBreakId, DEFAULT_PAGE_BREAK_ID, isPageBreakId } from "@/documents/arrangement";
import styles from "@/styles/ui/section-arrangement.module.css";

export type ArrangeableSection = {
  key: string;
  heading: string;
  type?: "content" | "pageBreak";
};

export type SectionArrangementProps = {
  /** Every section this document can show, in its current saved order. */
  sections: readonly ArrangeableSection[];
  /** The keys the user has chosen to leave out of this document. */
  hiddenSections: readonly string[];
  /** Mirrors the unsaved arrangement so a parent composer can preview it immediately. */
  onConfigurationChange?: (order: readonly string[], hiddenSections: readonly string[]) => void;
  editingKey?: string | null;
  onEdit?: (key: string) => void;
  onDelete?: (key: string) => void;
  renderEditor?: (key: string) => ReactNode;
};

export function SectionArrangement({
  sections,
  hiddenSections,
  onConfigurationChange,
  editingKey,
  onEdit,
  onDelete,
  renderEditor,
}: SectionArrangementProps) {
  const initialOrder = sections.map((s) => s.key);
  const initialOrderKey = initialOrder.join("|");
  const [order, setOrder] = useState<readonly string[]>(initialOrder);
  const orderRef = useRef<readonly string[]>(initialOrder);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(hiddenSections));
  const [dragged, setDragged] = useState<string | null>(null);

  // Parent-owned deletions and server-normalized arrangements must also update the
  // local drag state; otherwise a deleted Page Break can reappear on the next move.
  useEffect(() => {
    setOrder(initialOrder);
    orderRef.current = initialOrder;
  }, [initialOrderKey]);

  useEffect(() => {
    setHidden(new Set(hiddenSections));
  }, [hiddenSections]);
  /**
   * What changed, for a screen reader.
   *
   * A move is a purely visual event otherwise: the row is gone from where it was and the
   * user has no way to know where it went. Announced as a position out of a total, which
   * is the same thing the sighted user reads off the list.
   */
  const [announcement, setAnnouncement] = useState("");

  /*
   * The dragged key lives in a ref as well as in state. State drives the styling; the ref
   * is what the drag handlers read, because `dragover` fires many times a second and a
   * handler closing over a stale render would move the wrong row.
   */
  const draggedKey = useRef<string | null>(null);

  const headings = new Map(sections.map((section) => [section.key, section.heading]));
  const types = new Map(sections.map((section) => [section.key, section.type ?? "content"]));

  function headingFor(key: string) {
    return headings.get(key) ?? (isPageBreakId(key) ? "Page Break" : undefined);
  }

  function typeFor(key: string) {
    return types.get(key) ?? (isPageBreakId(key) ? "pageBreak" : "content");
  }

  function moveTo(key: string, destination: number) {
    const current = orderRef.current;
    if (destination < 0 || destination >= current.length) return;

    /*
     * Compute the next order before updating React state. Calling the parent callback from
     * inside a functional state updater is a render-phase update and produces a warning (and
     * can become an error in stricter React scheduling). The ref keeps dragover moves based on
     * the latest order without requiring a parent render between events.
     */
    const from = current.indexOf(key);
    if (from === -1 || from === destination) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(destination, 0, key);
    orderRef.current = next;
    setOrder(next);
    onConfigurationChange?.(next, [...hidden]);

    setAnnouncement(
      `${headingFor(key) ?? "Section"} moved to position ${destination + 1} of ${current.length}.`,
    );
  }

  function clone(key: string) {
    if (typeFor(key) !== "pageBreak") return;
    const source = orderRef.current;
    const copy = createClonedPageBreakId(source);
    const index = source.indexOf(key);
    if (index < 0) return;
    const next = [...source.slice(0, index + 1), copy, ...source.slice(index + 1)];
    orderRef.current = next;
    setOrder(next);
    onConfigurationChange?.(next, [...hidden]);
    setAnnouncement("Page Break cloned.");
  }

  function toggle(key: string) {
    const willHide = !hidden.has(key);
    const next = new Set(hidden);
    if (willHide) next.add(key);
    else next.delete(key);

    setHidden(next);
    onConfigurationChange?.([...orderRef.current], [...next]);
    setAnnouncement(
      willHide
        ? `${headingFor(key) ?? "Section"} will be left out of this document.`
        : `${headingFor(key) ?? "Section"} will be included.`,
    );
  }

  return (
    <div className={styles.arrangement}>
      <ul className={styles.list}>
        {order.map((key, index) => {
          const heading = headingFor(key);
          /* A key in the order that this document no longer offers: skip it rather than
           * render an empty row. It stays in the submitted order, so nothing is lost. */
          if (heading === undefined) {
            return (
              <li className={styles.carried} key={key}>
                <input type="hidden" name="offered" value={key} />
                <input type="hidden" name="order" value={key} />
              </li>
            );
          }

          const isHidden = hidden.has(key);

          return (
            <li
              className={[
                styles.row,
                isHidden ? styles.rowHidden : "",
                dragged === key ? styles.rowDragging : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable
              key={key}
              onDragEnd={() => {
                draggedKey.current = null;
                setDragged(null);
              }}
              onDragOver={(event) => {
                /* Without this the drop is refused and the browser shows a "no" cursor. */
                event.preventDefault();
                const moving = draggedKey.current;
                if (moving !== null && moving !== key) moveTo(moving, index);
              }}
              onDragStart={(event) => {
                draggedKey.current = key;
                setDragged(key);
                event.dataTransfer.effectAllowed = "move";
                /* Firefox will not start a drag without data on the transfer. */
                event.dataTransfer.setData("text/plain", key);
              }}
              onDrop={(event) => event.preventDefault()}
            >
              {/*
                `offered` carries the full list so the action can work out which sections
                were cleared — an unchecked box posts nothing at all. `order` carries the
                arrangement, in DOM order.
              */}
              <input type="hidden" name="offered" value={key} />
              <input type="hidden" name="order" value={key} />

              <span aria-hidden="true" className={styles.grip}>
                <GripIcon />
              </span>

              <label className={styles.visibility}>
                <input
                  checked={!isHidden}
                  name="visible"
                  onChange={() => toggle(key)}
                  type="checkbox"
                  value={key}
                />
                <span className={styles.heading} title={heading}>
                  {heading}
                </span>
              </label>

              <span className={styles.position}>{index + 1}</span>
              <details className={styles.actions}>
                <summary aria-label={`Actions for ${heading}`}>⋯</summary>
                <div className={styles.actionMenu}>
                  {typeFor(key) === "pageBreak" ? (
                    <>
                      <button onClick={() => clone(key)} type="button">Clone</button>
                      {!isPageBreakId(key) || key !== DEFAULT_PAGE_BREAK_ID ? <button onClick={() => onDelete?.(key)} type="button">Delete</button> : null}
                    </>
                  ) : (
                    <button onClick={() => onEdit?.(key)} type="button">{editingKey === key ? "Collapse" : "Edit"}</button>
                  )}
                  <button onClick={() => toggle(key)} type="button">{isHidden ? "Show" : "Hide"}</button>
                </div>
              </details>

              <span className={styles.moves}>
                <button
                  aria-label={`Move ${heading} earlier`}
                  className={styles.move}
                  disabled={index === 0}
                  onClick={() => moveTo(key, index - 1)}
                  type="button"
                >
                  <ChevronIcon direction="up" />
                </button>
                <button
                  aria-label={`Move ${heading} later`}
                  className={styles.move}
                  disabled={index === order.length - 1}
                  onClick={() => moveTo(key, index + 1)}
                  type="button"
                >
                  <ChevronIcon direction="down" />
                </button>
              </span>
              {editingKey === key && typeFor(key) === "content" && renderEditor ? (
                <div className={styles.inlineEditor}>{renderEditor(key)}</div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className={styles.status} role="status">
        {announcement}
      </p>
    </div>
  );
}

function GripIcon() {
  return (
    <svg fill="none" focusable="false" height="16" viewBox="0 0 16 16" width="16">
      <g fill="currentColor">
        <circle cx="6" cy="4" r="1.15" />
        <circle cx="10" cy="4" r="1.15" />
        <circle cx="6" cy="8" r="1.15" />
        <circle cx="10" cy="8" r="1.15" />
        <circle cx="6" cy="12" r="1.15" />
        <circle cx="10" cy="12" r="1.15" />
      </g>
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="14"
      viewBox="0 0 16 16"
      width="14"
    >
      <path
        d={direction === "up" ? "M3.5 10 8 5.5 12.5 10" : "M3.5 6 8 10.5 12.5 6"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
