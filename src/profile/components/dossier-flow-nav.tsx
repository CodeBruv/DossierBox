import Link from "next/link";
import {
  currentStep,
  nextStep,
  previousStep,
  resolveSkipDestination,
  type DossierFlow,
  type DossierStepKey,
} from "../flow";
import type { ProfileSectionKey } from "../types";
import styles from "@/styles/pages/profile.module.css";

/**
 * Navigation for the Dossier as a single continuous workspace.
 *
 * Both pieces exist so that no screen inside the Dossier is a dead end. The
 * rail shows where the user is in their own chosen sequence; the footer offers
 * exactly one forward action plus the quieter alternatives. Without these, every
 * section save sent the user back to a central list to pick the next thing,
 * which made a connected build feel like a folder of unrelated forms.
 */

type RailProps = {
  flow: DossierFlow;
  currentKey: DossierStepKey;
  /** Sections with at least one saved entry, so progress reads honestly. */
  completed?: ReadonlySet<string>;
};

export function DossierRail({ flow, currentKey, completed }: RailProps) {
  const active = currentStep(flow, currentKey);

  return (
    <nav aria-label="Dossier progress" className={styles.flowRail}>
      <p className={styles.flowMeta}>
        {active ? `Step ${active.position} of ${flow.total}` : "Dossier"}
        <span aria-hidden="true"> · </span>
        <Link className={styles.flowMetaLink} href="/profile">
          All sections
        </Link>
      </p>
      <ol className={styles.flowSteps}>
        {flow.steps.map((step) => {
          const isCurrent = step.key === currentKey;
          const isDone = !isCurrent && (step.isBasics || completed?.has(step.key) === true);
          const className = [
            styles.flowStep,
            isCurrent ? styles.flowStepCurrent : "",
            isDone ? styles.flowStepDone : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li className={className} key={step.key}>
              <Link
                aria-current={isCurrent ? "step" : undefined}
                className={styles.flowStepLink}
                href={step.href}
              >
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type FooterProps = {
  flow: DossierFlow;
  section: ProfileSectionKey;
  /** Lower-case noun for a single entry, e.g. "role". */
  singular: string;
  /** An empty section offers "add" as its only forward action. */
  hasEntries: boolean;
};

export function SectionFlowFooter({ flow, section, singular, hasEntries }: FooterProps) {
  const previous = previousStep(flow, section);
  const next = nextStep(flow, section);
  const onward = resolveSkipDestination(flow, section);
  const onwardLabel = next ? `Continue to ${next.label}` : "Review dossier";

  return (
    <div className={styles.flowFooter}>
      <div className={styles.flowFooterBack}>
        {previous ? (
          <Link className={styles.quietLink} href={previous.href}>
            <span aria-hidden="true">← </span>
            {previous.label}
          </Link>
        ) : null}
      </div>

      <div className={styles.flowFooterActions}>
        {hasEntries ? (
          <>
            <Link className={styles.secondaryButton} href={`/profile/${section}/new`}>
              Add another {singular}
            </Link>
            <Link className={styles.primaryButton} href={onward}>
              {onwardLabel}
              <span aria-hidden="true"> →</span>
            </Link>
          </>
        ) : (
          <Link className={styles.secondaryButton} href={onward}>
            Skip for now
          </Link>
        )}
      </div>
    </div>
  );
}
