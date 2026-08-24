import { profileSectionMap } from "./sections";
import { profileSectionKeys, type ProfileSectionKey } from "./types";

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
 *
 * ## A section that holds information is always part of the dossier
 *
 * This is the rule the rest of this module exists to enforce, and it was learned
 * the hard way. `profileSections` records which sections the user *chose* on the
 * structure screen. For a while that registry was the only thing the Dossier
 * screens read, which made it a second, hand-maintained answer to "what is in
 * this dossier?" — and the entry tables were the first. The two could disagree,
 * because nothing that writes an entry registers its section and the section
 * screens are reachable whether or not a section was ever chosen. When they
 * disagreed the registry won, so a user could save an experience, see it listed
 * on the section screen, be told it already existed when they tried to add it
 * again, and still find their dossier reporting that section as "Not started".
 *
 * So the registry is no longer authoritative about existence. It orders the
 * sections the user chose; anything holding saved information is part of the
 * dossier regardless, and appears after the chosen ones in the product's own
 * declared order. A registry row can now be missing, stale, or dropped by the
 * structure screen without a single saved entry becoming unreachable.
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
  /**
   * Whether the user picked this section on the structure screen.
   *
   * `false` means the step is here only because it holds saved information. The
   * distinction is for wording — "you also have entries here" — never for
   * deciding whether to show the step. Identity is always chosen.
   */
  chosen: boolean;
};

export type DossierFlow = {
  steps: readonly DossierStep[];
  /** Total step count, including identity. */
  total: number;
};

/** How many entries each section holds. Missing or zero means empty. */
export type SectionEntryCounts = Readonly<Partial<Record<ProfileSectionKey, number>>>;

/**
 * Builds the ordered flow.
 *
 * `registered` is expected in the user's chosen order (the repository sorts by
 * `position`). Unknown keys are dropped rather than throwing, because a section
 * could be removed from the product while a stale row still references it.
 * Duplicates are collapsed so a corrupt row cannot produce a step twice.
 *
 * `counts` is optional, and omitting it means "I do not know what is saved" — not
 * "nothing is saved". The two callers that omit it are resolving where to send the
 * user after a save, which only needs the step *after* a known one. Every screen
 * that renders the dossier passes it, because a screen that did not would be back
 * to reporting a populated section as absent.
 */
export function buildDossierFlow(
  registered: readonly string[],
  counts: SectionEntryCounts = {},
): DossierFlow {
  const seen = new Set<ProfileSectionKey>();
  const steps: DossierStep[] = [
    {
      key: BASICS_STEP,
      label: "Identity and direction",
      href: "/profile/basics",
      position: 1,
      isBasics: true,
      chosen: true,
    },
  ];

  const append = (key: ProfileSectionKey, chosen: boolean) => {
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({
      key,
      label: profileSectionMap[key].label,
      href: `/profile/${key}`,
      position: steps.length + 1,
      isBasics: false,
      chosen,
    });
  };

  for (const candidate of registered) {
    /*
     * `Object.hasOwn`, not `in`: `in` walks the prototype chain, so a stale or
     * hostile registry row reading `constructor` would answer `true` and then
     * index `profileSectionMap` into `Object`'s constructor, whose `.label` is
     * undefined. The dossier would render a step with no name that leads nowhere.
     */
    if (!Object.hasOwn(profileSectionMap, candidate)) continue;
    append(candidate as ProfileSectionKey, true);
  }

  /*
   * Anything holding information that the user did not pick. Walked in the
   * product's declared order rather than the counts object's key order, so the
   * result cannot depend on how the caller built its record.
   */
  for (const key of profileSectionKeys) {
    if ((counts[key] ?? 0) > 0) append(key, false);
  }

  return { steps, total: steps.length };
}

/**
 * The sections of a dossier, in flow order, excluding identity.
 *
 * Every screen that lists sections wants exactly this, and each one was deriving
 * it with its own `filter`/`map` over `flow.steps` — three copies of one rule, and
 * the reason the fix above had to be applied in three places rather than one.
 */
export function dossierSections(flow: DossierFlow): readonly ProfileSectionKey[] {
  return flow.steps
    .filter((step) => !step.isBasics)
    .map((step) => step.key as ProfileSectionKey);
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
