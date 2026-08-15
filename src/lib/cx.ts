/**
 * cx — a 140-byte replacement for `clsx`/`classnames`.
 *
 * Concatenates class strings, filtering out null/undefined/false.
 * This avoids an extra dependency for the one thing every UI
 * component needs: conditional className composition.
 */
type ClassValue =
  | string
  | undefined
  | null
  | false
  | { [key: string]: boolean | undefined | null }
  | ClassValue[];

export function cx(...args: ClassValue[]): string {
  const result: string[] = [];

  function walk(arg: ClassValue | undefined): void {
    if (typeof arg === "string" || typeof arg === "number") {
      if (arg) result.push(String(arg));
    } else if (Array.isArray(arg)) {
      for (const item of arg) walk(item);
    } else if (arg && typeof arg === "object") {
      for (const key of Object.keys(arg)) {
        if ((arg as Record<string, unknown>)[key]) result.push(key);
      }
    }
  }

  for (const arg of args) walk(arg);

  // Deduplicate while preserving order
  return Array.from(new Set(result)).join(" ");
}
