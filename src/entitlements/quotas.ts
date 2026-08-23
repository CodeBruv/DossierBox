/**
 * Quotas — how much of something a plan allows, and the arithmetic for asking.
 *
 * Separate from capabilities because the question has a different shape. A capability is
 * answered yes or no; a quota is answered against what the user has already used, which
 * means it needs metering (`usage.ts`) and it needs to survive a plan changing underneath
 * an account that has already spent some of it.
 *
 * ## Two kinds of ceiling, and why the distinction is not pedantry
 *
 * A **stock** is a standing total: how many documents may exist at once. Deleting one frees
 * it. Nothing resets it.
 *
 * A **flow** is a rate: how much writing work may be done per billing period. Deleting a
 * document does not refund it — the work was done — and it refills when the period turns.
 *
 * Collapsing the two produces one of two bugs, both of which cost money or trust: a
 * document count that resets monthly and lets a Basic account accumulate documents forever,
 * or a writing allowance that a user can refund by deleting their work.
 *
 * ## Why writing is measured in units rather than requests
 *
 * Because the requests are not the same size. Rewriting one achievement line and aligning
 * every document in an application set are both "one generation" and are not remotely the
 * same amount of work. Counting requests therefore prices the cheap operation like the
 * expensive one, which either wastes the allowance of a careful user or gives away the
 * expensive operation. Units are abstract and integral, so the arithmetic here is exact and
 * a provider's real token cost can move without a plan's number changing meaning. The weight
 * of each kind of work is declared in `usage.ts`.
 */

export const quotaKeys = ["stored_documents", "writing_units"] as const;

export type QuotaKey = (typeof quotaKeys)[number];

/** A standing total, or a rate per billing period. */
export type QuotaMeasure = "stock" | "flow";

export type QuotaDescriptor = {
  key: QuotaKey;
  label: string;
  description: string;
  measure: QuotaMeasure;
};

export const quotas: Readonly<Record<QuotaKey, QuotaDescriptor>> = {
  stored_documents: {
    key: "stored_documents",
    label: "Saved documents",
    description: "How many documents you can keep at once. Deleting one frees the slot.",
    measure: "stock",
  },
  writing_units: {
    key: "writing_units",
    label: "Writing assistance",
    description: "How much writing help is included each billing period.",
    measure: "flow",
  },
};

export const quotaList: readonly QuotaDescriptor[] = quotaKeys.map((key) => quotas[key]);

/** `in` walks the prototype chain; a quota name can arrive from stored data. */
const quotaKeySet: ReadonlySet<string> = new Set(quotaKeys);

export function isQuotaKey(value: unknown): value is QuotaKey {
  return typeof value === "string" && quotaKeySet.has(value);
}

/**
 * What a plan allows for one quota.
 *
 * A union rather than a number with a magic value: `Infinity` survives arithmetic but not
 * JSON, `0` means "none allowed" and must stay meaning that, and `-1` means nothing to
 * anyone reading a gate. The union forces every caller to have decided what unlimited does.
 */
export type Allowance = { readonly kind: "unlimited" } | { readonly kind: "limited"; readonly units: number };

export const unlimited: Allowance = { kind: "unlimited" };

/**
 * A bounded allowance.
 *
 * Rejects anything that is not a whole non-negative count, because a fractional or negative
 * ceiling would quietly make every comparison below meaningless rather than fail. This is
 * the one throw in the module: it can only fire on a malformed *declaration*, at the moment
 * the plan catalogue is built, never on a user's request.
 */
export function limited(units: number): Allowance {
  if (!Number.isInteger(units) || units < 0) {
    throw new Error(`An allowance must be a whole non-negative count, received ${units}`);
  }

  return { kind: "limited", units };
}

/** The ceiling as a number, or `null` when there isn't one. For display, not for gating. */
export function allowanceLimit(allowance: Allowance): number | null {
  return allowance.kind === "unlimited" ? null : allowance.units;
}

/**
 * How much is left, floored at zero.
 *
 * Floored because `consumed` can legitimately exceed the ceiling: a Professional account
 * with forty documents that lapses to Basic has used forty of one. The spec forbids deleting
 * a user's work over a subscription, so that state is normal and this must describe it
 * rather than report a negative remainder that a progress bar would render backwards.
 */
export function allowanceRemaining(allowance: Allowance, consumed: number): number | null {
  if (allowance.kind === "unlimited") return null;

  return Math.max(0, allowance.units - consumed);
}

/**
 * Whether `requested` more is within the allowance.
 *
 * The single comparison every quota gate should use. `requested` defaults to one because the
 * common question is "may they create one more?", but it is a parameter because a document
 * set is several documents at once and a user should be stopped before the third of four is
 * produced rather than after it.
 */
export function allowancePermits(
  allowance: Allowance,
  consumed: number,
  requested = 1,
): boolean {
  if (allowance.kind === "unlimited") return true;
  if (requested <= 0) return true;

  return consumed + requested <= allowance.units;
}

/** Whether the user is already at or past the ceiling. */
export function allowanceExhausted(allowance: Allowance, consumed: number): boolean {
  return !allowancePermits(allowance, consumed, 1);
}

/**
 * Whether `allowance` is strictly more generous than `other`.
 *
 * The ordering an upgrade prompt needs: told "you can save one document", a user has to be
 * told which plan saves more, and the only alternative to comparing allowances is naming a
 * plan in the message — which is the hard-coded plan name the requirements forbid.
 */
export function allowanceExceeds(allowance: Allowance, other: Allowance): boolean {
  if (allowance.kind === "unlimited") return other.kind === "limited";
  if (other.kind === "unlimited") return false;

  return allowance.units > other.units;
}

