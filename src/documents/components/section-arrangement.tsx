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

import { useRef, useState } from "react";
import styles from "@/styles/ui/section-arrangement.module.css";

export type ArrangeableSection = {
  key: string;
  heading: string;
};

export type SectionArrangementProps = {
  /** Every section this document can show, in its current saved order. */
  sections: readonly ArrangeableSection[];
  /** The keys the user has chosen to leave out of this document. */
  hiddenSections: readonly string[];
  /** Mirrors the unsaved arrangement so a parent composer can preview it immediately. */
  onConfigurationChange?: (order: readonly string[], hiddenSections: readonly string[]) => void;
};

export function SectionArrangement({
  sections,
  hiddenSections,
  onConfigurationChange,
}: SectionArrangementProps) {
  const [order, setOrder] = useState<readonly string[]>(() => sections.map((s) => s.key));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(hiddenSections));
  const [dragged, setDragged] = useState<string | null>(null);
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

  function moveTo(key: string, destination: number) {
    if (destination < 0 || destination >= order.length) return;

    /*
     * A functional update, and the position is recomputed from whatever the current order
     * is rather than from the index the row rendered with. `dragover` fires many times a
     * second, so a handler can run against an order one move behind; recomputing here means
     * the worst case is a redundant move rather than a row landing somewhere nobody asked.
     */
    setOrder((current) => {
      const from = current.indexOf(key);
      if (from === -1 || from === destination) return current;

      const next = [...current];
      next.splice(from, 1);
      next.splice(destination, 0, key);
      onConfigurationChange?.(next, [...hidden]);

      return next;
    });

    setAnnouncement(
      `${headings.get(key) ?? "Section"} moved to position ${destination + 1} of ${order.length}.`,
    );
  }

  function toggle(key: string) {
    const willHide = !hidden.has(key);
    const next = new Set(hidden);
    if (willHide) next.add(key);
    else next.delete(key);

    setHidden(next);
    onConfigurationChange?.([...order], [...next]);
    setAnnouncement(
      willHide
        ? `${headings.get(key) ?? "Section"} will be left out of this document.`
        : `${headings.get(key) ?? "Section"} will be included.`,
    );
  }

  return (
    <div className={styles.arrangement}>
      <ul className={styles.list}>
        {order.map((key, index) => {
          const heading = headings.get(key);
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
