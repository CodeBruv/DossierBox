import type { DocumentSectionKey } from "./catalogue";

export const PAGE_BREAK_PREFIX = "page-break:";
export const DEFAULT_PAGE_BREAK_ID = "page-break:default";

export type DocumentArrangementItem =
  | { id: DocumentSectionKey; type: "content"; heading: string }
  | { id: string; type: "pageBreak"; heading: "Page Break" };

export function isPageBreakId(value: string): boolean {
  return value.startsWith(PAGE_BREAK_PREFIX) && value.length > PAGE_BREAK_PREFIX.length;
}

export function pageBreakId(seed = "default"): string {
  const normalized = seed.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${PAGE_BREAK_PREFIX}${normalized || "copy"}`;
}

export function createClonedPageBreakId(items: readonly string[]): string {
  const used = new Set(items);
  let index = 1;
  while (used.has(pageBreakId(`copy-${index}`))) index += 1;
  return pageBreakId(`copy-${index}`);
}

/** Normalizes legacy content-only orders into one heterogeneous arrangement. */
export function normalizeArrangement(
  requested: readonly string[],
  knownContent: readonly string[],
  legacyPageBreaks: readonly string[] = [],
): readonly string[] {
  const known = new Set(knownContent);
  const requestedItems = [...new Set(requested.filter((key) => known.has(key) || isPageBreakId(key)))];
  const content = requestedItems.filter((key) => known.has(key));
  for (const key of knownContent) if (!content.includes(key)) content.push(key);

  // A new-format order is authoritative. Do not re-interpret its Page Break items.
  if (requestedItems.some(isPageBreakId)) {
    return [...requestedItems, ...content.filter((key) => !requestedItems.includes(key))];
  }

  // Legacy values meant "break immediately before this content section". Convert them
  // at that exact position so migration preserves the rendered document, not just the IDs.
  const breaksBefore = new Map<string, string>();
  const trailingBreaks: string[] = [];
  for (const legacyKey of legacyPageBreaks) {
    const id = isPageBreakId(legacyKey) ? legacyKey : pageBreakId(legacyKey);
    const target = isPageBreakId(legacyKey) ? undefined : legacyKey;
    if (target && known.has(target) && !breaksBefore.has(target)) breaksBefore.set(target, id);
    else if (!trailingBreaks.includes(id)) trailingBreaks.push(id);
  }

  const result: string[] = [];
  for (const key of content) {
    const breakId = breaksBefore.get(key);
    if (breakId) result.push(breakId);
    result.push(key);
  }
  result.push(...trailingBreaks);
  if (!result.some(isPageBreakId)) result.push(DEFAULT_PAGE_BREAK_ID);
  return result;
}

export function contentOrderFromArrangement(arrangement: readonly string[]): readonly string[] {
  return arrangement.filter((key) => !isPageBreakId(key));
}

export function pageBreaksFromArrangement(arrangement: readonly string[]): readonly string[] {
  return arrangement.filter(isPageBreakId);
}
