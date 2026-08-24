/**
 * Author-time generator for src/profile/vocabularies/places.ts.
 * Run once with a full-ICU Node; the committed output is what ships.
 */
const fs = require("node:fs");
const path = require("node:path");

const region = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
const language = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });

function sweep(lowercase, keep) {
  const base = lowercase ? 97 : 65;
  const codes = [];
  for (let a = base; a < base + 26; a += 1) {
    for (let b = base; b < base + 26; b += 1) {
      codes.push(String.fromCharCode(a, b));
    }
  }
  return codes.filter(keep);
}

/**
 * Deprecated subtags resolve to the same display name as their replacement — AN and CW are
 * both "Curaçao", iw and he are both "Hebrew" — which would show the user the same option
 * twice. ICU canonicalizes a deprecated subtag to its replacement, so a code that does not
 * survive canonicalization is the superseded spelling and gets dropped.
 */
function isCanonical(subtag, position) {
  const tag = position === "region" ? `und-${subtag}` : subtag;
  const [canonical] = Intl.getCanonicalLocales(tag);
  return canonical === tag || canonical === `${tag}-${tag}`;
}

// Supranational groupings and reserved/exceptional codes: valid ISO, but not somewhere
// a person is from or works in.
const notAPlace = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ", "AC", "CP", "DG", "EA", "IC", "TA"]);
const regionCodes = sweep(false, (code) => {
  const name = region.of(code);
  return (
    Boolean(name) &&
    name !== code &&
    !notAPlace.has(code) &&
    !/^\d/.test(name) &&
    isCanonical(code, "region")
  );
});

// Extinct, liturgical and constructed languages. Real ISO 639-1 codes, but noise in a
// list someone is scanning for the languages they actually work in.
const notAWorkingLanguage = new Set([
  "ae", "ch", "cr", "cu", "ho", "hz", "ie", "io", "kj", "kr", "lg", "mh",
  "na", "ng", "nr", "nv", "oj", "pi", "sc", "ss", "ty", "vo", "za",
  // Canonical codes that ICU labels with another entry's name: tw (Twi) displays as
  // "Akan", which ak already provides. Dropping the duplicate label costs the user
  // nothing; showing "Akan" twice would cost them confidence.
  "tw",
]);
const languageCodes = sweep(true, (code) => {
  const name = language.of(code);
  return (
    Boolean(name) && name !== code && !notAWorkingLanguage.has(code) && isCanonical(code, "language")
  );
});

/** Last line of defence: if two codes still share a display name, only the first survives. */
function assertDistinct(codes, names, label) {
  const seen = new Map();
  for (const code of codes) {
    const name = names.of(code);
    if (seen.has(name)) throw new Error(`${label}: "${name}" is both ${seen.get(name)} and ${code}`);
    seen.set(name, code);
  }
}

assertDistinct(regionCodes, region, "countries");
assertDistinct(languageCodes, language, "languages");

function pack(codes, names) {
  const entries = codes.map((code) => `${code}:${names.of(code)}`);
  const lines = [];
  let line = "";
  for (const entry of entries) {
    if (line && line.length + entry.length > 90) {
      lines.push(line);
      line = "";
    }
    line += (line ? "|" : "") + entry;
  }
  if (line) lines.push(line);
  return lines.map((value, index) => `    "${index === 0 ? "" : "|"}${value}"`).join(" +\n");
}

const output = `/**
 * Places and languages, as suggestion vocabularies.
 *
 * Generated once from ICU ('Intl.DisplayNames') rather than read from it at render time,
 * deliberately: a runtime built with trimmed ICU returns the raw code, which would
 * silently turn the country selector into a list of two-letter codes on some deployments.
 * Committed data renders identically everywhere. Regenerate with
 * scripts/generate-places.cjs.
 *
 * The **name** is stored, not the code. Those columns already hold names typed by hand,
 * so this puts a searchable control over the existing shape instead of forcing a
 * migration to codes plus a backfill. Codes travel alongside so a later move to
 * locale-aware display has a stable key to migrate to.
 *
 * Neither list asserts anything about sovereignty. It is ICU's region list, including
 * territories and dependencies, because people live, study and work in them and a career
 * document has to be able to say so. Custom entry stays open for anyone the lists fail.
 */

export type VocabularyEntry = { readonly code: string; readonly name: string };

function parse(packed: string): readonly VocabularyEntry[] {
  return packed.split("|").map((entry) => {
    const separator = entry.indexOf(":");
    return { code: entry.slice(0, separator), name: entry.slice(separator + 1) };
  });
}

/** ISO 3166-1 alpha-2 — ${regionCodes.length} countries and territories. */
export const countries: readonly VocabularyEntry[] = parse(
${pack(regionCodes, region)},
);

/** ISO 639-1 — ${languageCodes.length} living languages. */
export const languages: readonly VocabularyEntry[] = parse(
${pack(languageCodes, language)},
);

export const countryNames: readonly string[] = countries.map((entry) => entry.name);
export const languageNames: readonly string[] = languages.map((entry) => entry.name);
`;

const target = path.join(process.argv[2], "src/profile/vocabularies/places.ts");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, output);
process.stdout.write(`countries=${regionCodes.length} languages=${languageCodes.length}\n`);
