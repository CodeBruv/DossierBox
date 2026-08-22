import { profileSectionMap } from "./sections";
import type { ProfileSectionKey } from "./types";

/**
 * DossierBox — Dossier building flow.
 *
 * The Dossier is one continuous workspace, not a set of disconnected CRUD
 * pages. That continuity is expressed here as an ordered list of steps, so
 * every screen can answer "where am I, and what comes next?" without the user
 * having to return to a central selection page between sections.
 *
 * These are pure functions over data the caller already loaded. They perform no
 * I/O, which keeps the ordering rules unit-testable and keeps the page
 * components free of navigation arithmetic.
 */

/** Identity is always the first step; the remaining steps are user-selected. */
export const BASICS_STEP = "basics" as const;

export type DossierStepKey = typeof BASICS_STEP | ProfileSectionKey;

export type DossierStep = {
  key: DossierStepKey;
  /** Display label. */
  label: string;
  /** Route for this step's own screen. */
  href: string;
  /** 1-based position, for "Step 3 of 7". */
  position: number;
  /** Identity behaves differently: it is a single record, not a list. */
  isBasics: boolean;
};

export type DossierFlow = {
  steps: readonly DossierStep[];
  /** Total step count, including identity. */
  total: number;
};

/**
 * Builds the ordered flow.
 *
 * `enabled` is expected in the user's chosen order (the repository sorts by
 * `position`). Unknown keys are dropped rather than throwing, because a section
 * could be removed from the product while a stale row still references it.
 * Duplicates are collapsed so a corrupt row cannot produce a step twice.
 */
export function buildDossierFlow(enabled: readonly string[]): DossierFlow {
  const seen = new Set<ProfileSectionKey>();
  const steps: DossierStep[] = [
    {
      key: BASICS_STEP,
      label: "Identity and direction",
      href: "/profile/basics",
      position: 1,
      isBasics: true,
    },
  ];

  for (const candidate of enabled) {
    if (!(candidate in profileSectionMap)) {
      continue;
    }

    const key = candidate as ProfileSectionKey;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    steps.push({
      key,
      label: profileSectionMap[key].label,
      href: `/profile/${key}`,
      position: steps.length + 1,
      isBasics: false,
    });
  }

  return { steps, total: steps.length };
}

/** Index of a step, or -1 when the key is not part of the flow. */
export function findStepIndex(flow: DossierFlow, key: DossierStepKey): number {
  return flow.steps.findIndex((step) => step.key === key);
}

export function currentStep(flow: DossierFlow, key: DossierStepKey): DossierStep | undefined {
  const index = findStepIndex(flow, key);
  return index === -1 ? undefined : flow.steps[index];
}

/** The step after `key`, or undefined when `key` is last or absent. */
export function nextStep(flow: DossierFlow, key: DossierStepKey): DossierStep | undefined {
  const index = findStepIndex(flow, key);
  return index === -1 ? undefined : flow.steps[index + 1];
}

/** The step before `key`, or undefined when `key` is first or absent. */
export function previousStep(flow: DossierFlow, key: DossierStepKey): DossierStep | undefined {
  const index = findStepIndex(flow, key);
  return index <= 0 ? undefined : flow.steps[index - 1];
}

/**
 * What the user asked to happen after a successful save.
 *
 * These come from the submit button that was pressed, so the flow is driven by
 * intent rather than by the form guessing. Anything unrecognised degrades to
 * `stay`, which is the safe option: the user lands on the section they just
 * edited and can see their saved work.
 */
export type SaveIntent = "stay" | "another" | "continue";

export function parseSaveIntent(value: FormDataEntryValue | null): SaveIntent {
  return value === "another" || value === "continue" ? value : "stay";
}

/** Outcome reported to the destination screen so it can confirm what happened. */
export type SaveOutcome = "created" | "updated";

/**
 * Resolves where to send the user after saving an entry.
 *
 * `continue` advances to the next step in the flow, or to the review screen
 * when the current section is the last one — which is what makes the Dossier
 * feel continuous instead of dumping the user back to a hub every time.
 *
 * The flow is optional because the other two intents do not depend on it, which
 * lets callers avoid a database read they do not need.
 */
export function resolveEntryDestination(
  flow: DossierFlow | undefined,
  section: ProfileSectionKey,
  intent: SaveIntent,
  outcome: SaveOutcome = "created",
): string {
  if (intent === "another") {
    return `/profile/${section}/new?status=${outcome}`;
  }

  if (intent === "continue") {
    const next = flow ? nextStep(flow, section) : undefined;
    return next ? `${next.href}?status=${outcome}` : `/profile/review?status=${outcome}`;
  }

  return `/profile/${section}?status=${outcome}`;
}

/** Where "skip this section" should lead. Mirrors `continue`, without saving. */
export function resolveSkipDestination(
  flow: DossierFlow,
  section: ProfileSectionKey,
): string {
  const next = nextStep(flow, section);
  return next ? next.href : "/profile/review";
}
