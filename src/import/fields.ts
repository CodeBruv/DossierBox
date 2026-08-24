/**
 * Reading individual dossier values out of a line of text.
 *
 * Everything in here answers one small question — is there an email address in this line,
 * does this name a country, is "2:1" a grade — and answers it by recognising vocabulary
 * rather than by reasoning. That is a deliberate limit. Recognition is explainable: when a
 * user sees "Second Class Upper" appear in their grade field they can tell exactly which
 * two characters of their document produced it, and when it is wrong they can see that too.
 *
 * Each reader returns the text it matched as well as the value it read, so the caller can
 * take the matched part out of the line before interpreting what remains. A line is read
 * once, and every piece of it is either claimed by one reader or left for the next.
 *
 * Nothing here completes a value the document did not state. A line that says "Lagos"
 * yields a city and no country, because a career document naming a city is not asserting
 * which country it is in — and there are eight Londons.
 */

import {
  countryNames,
  educationLevelOptions,
  languageNames,
  languageProficiencyOptions,
  workArrangementOptions,
} from "@/profile/vocabularies";

/* Contact details ----------------------------------------------------------- */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}/;

export function findEmail(text: string): string | null {
  return EMAIL.exec(text)?.[0] ?? null;
}

/**
 * Web addresses, including the bare hosts people actually write.
 *
 * "linkedin.com/in/ada-okoye" has no scheme, and rejecting it would drop the single most
 * common link on a CV. The bare form is therefore accepted, but only for a closed list of
 * suffixes: without that, "Node.js", "3.5" and "e.g" all read as hosts. Emails are removed
 * before the search, since every address contains something that looks like a host.
 */
const TOP_LEVEL = [
  "com", "org", "net", "edu", "gov", "int", "io", "co", "me", "dev", "app", "ai", "xyz",
  "info", "biz", "pro", "tech", "site", "online", "blog", "design", "studio", "art", "cloud",
  "uk", "ng", "ca", "au", "de", "fr", "nl", "es", "it", "se", "no", "dk", "fi", "ie", "ch",
  "at", "be", "pt", "pl", "cz", "gr", "za", "ke", "gh", "eg", "ma", "in", "pk", "bd", "sg",
  "my", "ph", "id", "jp", "kr", "cn", "hk", "tw", "nz", "br", "mx", "ar", "cl", "us", "eu",
];

const URL_PATTERN = new RegExp(
  `(?:https?://|www\\.)[^\\s,;<>()\\[\\]"']+` +
    `|\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TOP_LEVEL.join("|")})\\b(?:/[^\\s,;<>()\\[\\]"']*)?`,
  "gi",
);

export function findUrls(text: string): string[] {
  const withoutEmails = text.replace(new RegExp(EMAIL.source, "g"), " ");
  const found = withoutEmails.match(URL_PATTERN) ?? [];
  return [...new Set(found.map((url) => url.replace(/[.,;:)\]]+$/, "")))];
}

/**
 * Telephone numbers.
 *
 * The shape is the only thing that generalises: international numbers have between seven
 * and fifteen digits and no agreed punctuation. A run of digits therefore has to earn being
 * read as a phone number — by carrying a country prefix, a trunk zero, or simply being
 * longer than any year, date or credential id would be.
 */
const PHONE_CANDIDATE = /[+(]?\d[\d\s()./+-]{5,}\d/g;

export function findPhone(text: string): string | null {
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    const qualified = raw.startsWith("+") || digits.startsWith("0") || digits.length >= 10;
    if (!qualified) continue;
    return raw.replace(/\s{2,}/g, " ");
  }
  return null;
}

/* Places -------------------------------------------------------------------- */

/** Longest first, so "United States Virgin Islands" is not read as "United States". */
const orderedCountries = [...countryNames].sort((a, b) => b.length - a.length);

export type FoundLocation = {
  readonly city: string;
  readonly country: string;
  /** How the work was arranged, where the document said that instead of a place. */
  readonly arrangement: string;
  readonly matched: string;
};

/**
 * The place, or the arrangement, a line states.
 *
 * A CV writes location in the same slot whether it is a place or not — "Remote" sits
 * exactly where "Lagos, Nigeria" would — so both are read here and the caller decides
 * which field each belongs in.
 */
export function findLocation(text: string): FoundLocation | null {
  for (const arrangement of workArrangementOptions) {
    const pattern = new RegExp(`\\b${arrangement.value.replace("-", "[- ]?")}\\b`, "i");
    const match = pattern.exec(text);
    if (match) {
      return { city: "", country: "", arrangement: arrangement.value, matched: match[0] };
    }
  }

  for (const country of orderedCountries) {
    const pattern = new RegExp(`(?:^|[\\s,(])(${escapeRegExp(country)})(?=$|[\\s,).])`, "i");
    const match = pattern.exec(text);
    if (!match?.[1]) continue;

    /* Whatever sits immediately before the country, after the comma that separates them. */
    const before = text.slice(0, match.index + (match[0].length - match[1].length));
    const city = /(?:^|[,(])\s*([^,(]{2,40})\s*[,(]?\s*$/.exec(before)?.[1]?.trim() ?? "";
    return {
      city: looksLikePlaceName(city) ? city : "",
      country,
      arrangement: "",
      matched: match[1],
    };
  }

  return null;
}

function looksLikePlaceName(value: string): boolean {
  if (!value || value.length > 40) return false;
  if (/\d/.test(value)) return false;
  return value.split(/\s+/).length <= 4;
}

/* Education ----------------------------------------------------------------- */

/**
 * Abbreviations for levels of study, mapped to the vocabulary the dossier offers.
 *
 * Ordered most specific first, because "Higher National Diploma" contains "Diploma" and
 * "Postgraduate Certificate" contains "Certificate". The abbreviations are the ones printed
 * on real documents in the markets this product serves; the list will never be complete,
 * which is why the level field keeps a custom branch and why failing to match is a normal
 * outcome here rather than an error.
 */
const LEVEL_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bpost[-\s]?doc(?:toral)?\b/i, "Postdoctoral"],
  [/\b(?:ph\.?\s?d|d\.?\s?phil|doctor\s+of\s+philosophy|doctorate)\b/i, "Doctorate (PhD)"],
  [/\b(?:ed\.?\s?d|d\.?\s?b\.?a|psy\.?\s?d|professional\s+doctorate)\b/i, "Professional doctorate"],
  [/\bhigher\s+national\s+diploma\b|\bhnd\b/i, "Higher National Diploma"],
  [/\bpost[-\s]?grad(?:uate)?\s+dip(?:loma)?\b|\bpgd\b|\bpg\s?dip\b/i, "Postgraduate diploma"],
  [
    /\bpost[-\s]?grad(?:uate)?\s+cert(?:ificate)?\b|\bpg\s?cert\b|\bpgce\b/i,
    "Postgraduate certificate",
  ],
  [
    /\b(?:m\.?\s?sc|m\.?\s?a|m\.?\s?eng|m\.?\s?tech|m\.?\s?ed|m\.?\s?phil|ll\.?\s?m|m\.?\s?b\.?a|m\.?\s?p\.?h|m\.?\s?s|master(?:'s)?)\b/i,
    "Master's degree",
  ],
  [
    /\b(?:b\.?\s?sc|b\.?\s?a|b\.?\s?eng|b\.?\s?tech|b\.?\s?ed|b\.?\s?s|ll\.?\s?b|mbbs|b\.?\s?arch|bachelor(?:'s)?)\b/i,
    "Bachelor's degree",
  ],
  [/\bfoundation\s+(?:degree|year|programme|program)\b/i, "Foundation degree"],
  [/\bassociate(?:'s)?\s+degree\b|\ba\.?\s?a\b|\ba\.?\s?s\b/i, "Associate degree"],
  [/\bond\b|\bnational\s+diploma\b|\bdiploma\b/i, "Diploma"],
  [/\bapprentice(?:ship)?\b/i, "Apprenticeship"],
  [/\bnvq\b|\bvocational\b|\bcity\s?(?:&|and)\s?guilds\b/i, "Vocational qualification"],
  [
    /\b(?:wassce|waec|ssce|neco|gcse|a[-\s]?levels?|o[-\s]?levels?|igcse|baccalaur[eé]ate|abitur|matric(?:ulation)?|high\s+school\s+diploma)\b/i,
    "School leaving certificate",
  ],
  [/\b(?:secondary\s+school|high\s+school|grammar\s+school)\b/i, "Secondary school"],
  [/\bprimary\s+(?:school|education)\b/i, "Primary education"],
  [/\bcertificate\b/i, "Certificate"],
];

const knownLevels = new Set(educationLevelOptions.map((option) => option.value));

export type FoundLevel = { readonly level: string; readonly matched: string };

/** The level of study a line names, if it names one the vocabulary knows. */
export function findEducationLevel(text: string): FoundLevel | null {
  for (const [pattern, level] of LEVEL_PATTERNS) {
    const match = pattern.exec(text);
    /* A pattern that resolved to a level the picker no longer offers is a bug, not a value. */
    if (match && knownLevels.has(level)) return { level, matched: match[0] };
  }
  return null;
}

export type FoundGrade = {
  readonly gradingSystem: string;
  readonly grade: string;
  readonly matched: string;
  /** Set when the document stated a figure without saying what it was out of. */
  readonly assumedScale: boolean;
};

const CLASSIFICATIONS: readonly (readonly [RegExp, string])[] = [
  [/\bfirst\s+class\b|\b1st\s+class\b/i, "First Class"],
  [/\bsecond\s+class\s+upper\b|\bupper\s+second\b|\b2[:.]1\b/i, "Second Class Upper"],
  [/\bsecond\s+class\s+lower\b|\blower\s+second\b|\b2[:.]2\b/i, "Second Class Lower"],
  [/\bthird\s+class\b|\b3rd\s+class\b/i, "Third Class"],
];

const CREDITS: readonly (readonly [RegExp, string])[] = [
  [/\bdistinction\b/i, "Distinction"],
  [/\bupper\s+credit\b/i, "Upper Credit"],
  [/\blower\s+credit\b/i, "Lower Credit"],
  [/\bmerit\b/i, "Merit"],
  [/\bcredit\b/i, "Credit"],
];

/**
 * The grade a line states, and which system states it that way.
 *
 * The system has to be read alongside the grade because the dossier asks for it first — a
 * grade with no system has no control to render in and so cannot be shown to the user at
 * all. Where a document gives a bare figure ("CGPA: 4.55") the scale is genuinely absent
 * from the document, so the smallest scale that could contain the figure is used and the
 * caller is told the scale was assumed, which is what puts a correctable note on the review
 * screen instead of a silent claim in the record.
 */
export function findGrade(text: string): FoundGrade | null {
  const scaled = /\b(?:c?gpa|grade\s+point\s+average)\b[:\s]*([0-9](?:\.[0-9]{1,2})?)\s*(?:\/|out\s+of)\s*(4|5|10)(?:\.0+)?/i.exec(
    text,
  );
  if (scaled?.[1] && scaled[2]) {
    return {
      gradingSystem: `gpa-${scaled[2]}`,
      grade: scaled[1],
      matched: scaled[0],
      assumedScale: false,
    };
  }

  const bareScale = /\b([0-9](?:\.[0-9]{1,2})?)\s*(?:\/|out\s+of)\s*(4|5|10)(?:\.0+)?\b/.exec(text);
  if (bareScale?.[1] && bareScale[2]) {
    return {
      gradingSystem: `gpa-${bareScale[2]}`,
      grade: bareScale[1],
      matched: bareScale[0],
      assumedScale: false,
    };
  }

  const bare = /\b(?:c?gpa|grade\s+point\s+average)\b[:\s]*([0-9](?:\.[0-9]{1,2})?)/i.exec(text);
  if (bare?.[1]) {
    const value = Number(bare[1]);
    const scale = value > 5 ? 10 : value > 4 ? 5 : 4;
    return {
      gradingSystem: `gpa-${scale}`,
      grade: bare[1],
      matched: bare[0],
      assumedScale: true,
    };
  }

  for (const [pattern, grade] of CLASSIFICATIONS) {
    const match = pattern.exec(text);
    if (match) {
      return { gradingSystem: "classification", grade, matched: match[0], assumedScale: false };
    }
  }

  for (const [pattern, grade] of CREDITS) {
    const match = pattern.exec(text);
    if (match) {
      return { gradingSystem: "credit", grade, matched: match[0], assumedScale: false };
    }
  }

  const percentage = /\b(\d{2,3}(?:\.\d{1,2})?)\s*%/.exec(text);
  if (percentage?.[1] && Number(percentage[1]) <= 100) {
    return {
      gradingSystem: "percentage",
      grade: percentage[1],
      matched: percentage[0],
      assumedScale: false,
    };
  }

  return null;
}

/* Languages ----------------------------------------------------------------- */

const orderedLanguages = [...languageNames].sort((a, b) => b.length - a.length);

/**
 * Proficiency wordings a document uses that the picker does not offer verbatim.
 *
 * The field accepts custom values, so an unmatched wording is kept exactly as written. These
 * exist only to land the common phrasings on the curated option, so that two users who wrote
 * "Mother tongue" and "Native" are not filed differently.
 */
const PROFICIENCY_SYNONYMS: readonly (readonly [RegExp, string])[] = [
  [/\bmother\s+tongue\b|\bfirst\s+language\b|\bnative\s+speaker\b/i, "Native"],
  [/\bfull\s+professional\b|\bprofessional\s+working\b/i, "Professional working proficiency"],
  [/\blimited\s+working\b|\bworking\s+knowledge\b/i, "Limited working proficiency"],
  [/\bintermediate\b/i, "Conversational"],
  [/\belementary\b|\bbeginner\b|\bbasic\b/i, "Basic"],
  [/\badvanced\b/i, "Fluent"],
];

export type FoundLanguage = {
  readonly language: string;
  readonly proficiency: string;
  readonly matchedProficiency: boolean;
};

/**
 * Reads "English — Fluent", "French (Intermediate)", "Yoruba: native speaker".
 *
 * The language has to be recognised for the line to be a language entry at all; the
 * proficiency does not, because plenty of CVs list languages with no proficiency and
 * inventing one would be asserting a competence.
 */
export function findLanguage(text: string): FoundLanguage | null {
  const language = orderedLanguages.find((name) =>
    new RegExp(`(?:^|[^a-z])${escapeRegExp(name)}(?:[^a-z]|$)`, "i").test(text),
  );
  if (!language) return null;

  const remainder = text
    .replace(new RegExp(escapeRegExp(language), "i"), " ")
    .replace(/[()\[\]]/g, " ")
    .replace(/^[\s:,;|–—-]+|[\s:,;|–—-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const exact = languageProficiencyOptions.find(
    (option) => option.value.toLowerCase() === remainder.toLowerCase(),
  );
  if (exact) return { language, proficiency: exact.value, matchedProficiency: true };

  const cefr = /\b([abc][12])\b/i.exec(remainder);
  if (cefr?.[1]) {
    return {
      language,
      proficiency: `${cefr[1].toUpperCase()} (CEFR)`,
      matchedProficiency: true,
    };
  }

  for (const [pattern, proficiency] of PROFICIENCY_SYNONYMS) {
    if (pattern.test(remainder)) return { language, proficiency, matchedProficiency: true };
  }

  /* Kept verbatim: the field allows custom values, and the user's words are the record. */
  return {
    language,
    proficiency: remainder.length <= 120 ? remainder : "",
    matchedProficiency: false,
  };
}

/* Links --------------------------------------------------------------------- */

/**
 * Hosts whose purpose is unambiguous, so a link to one arrives already classified.
 *
 * The label matters as much as the type: "LinkedIn" is what a reader recognises, whereas
 * "https://www.linkedin.com/in/ada-okoye-8b41" is what the document contained.
 */
const KNOWN_HOSTS: readonly (readonly [RegExp, string, string])[] = [
  [/(?:^|\.)linkedin\.com$/i, "professional", "LinkedIn"],
  [/(?:^|\.)xing\.com$/i, "professional", "Xing"],
  [/(?:^|\.)github\.com$/i, "professional", "GitHub"],
  [/(?:^|\.)gitlab\.com$/i, "professional", "GitLab"],
  [/(?:^|\.)bitbucket\.org$/i, "professional", "Bitbucket"],
  [/(?:^|\.)stackoverflow\.com$/i, "professional", "Stack Overflow"],
  [/(?:^|\.)behance\.net$/i, "portfolio", "Behance"],
  [/(?:^|\.)dribbble\.com$/i, "portfolio", "Dribbble"],
  [/(?:^|\.)artstation\.com$/i, "portfolio", "ArtStation"],
  [/(?:^|\.)figma\.com$/i, "portfolio", "Figma"],
  [/(?:^|\.)medium\.com$/i, "publication", "Medium"],
  [/(?:^|\.)substack\.com$/i, "publication", "Substack"],
  [/(?:^|\.)dev\.to$/i, "publication", "DEV"],
  [/(?:^|\.)hashnode\.(?:com|dev)$/i, "publication", "Hashnode"],
  [/(?:^|\.)orcid\.org$/i, "publication", "ORCID"],
  [/(?:^|\.)researchgate\.net$/i, "publication", "ResearchGate"],
  [/(?:^|\.)scholar\.google\.com$/i, "publication", "Google Scholar"],
  [/(?:^|\.)kaggle\.com$/i, "project", "Kaggle"],
  [/(?:^|\.)npmjs\.com$/i, "project", "npm"],
  [/(?:^|\.)youtube\.com$/i, "other", "YouTube"],
];

export type ClassifiedLink = {
  readonly type: string;
  readonly label: string;
  readonly url: string;
  /** A personal site rather than a profile on someone else's platform. */
  readonly personalSite: boolean;
};

export function classifyLink(url: string): ClassifiedLink {
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;

  let host = "";
  try {
    host = new URL(normalized).hostname.replace(/^www\./i, "");
  } catch {
    return { type: "other", label: url.slice(0, 120), url, personalSite: false };
  }

  for (const [pattern, type, label] of KNOWN_HOSTS) {
    if (pattern.test(host)) return { type, label, url, personalSite: false };
  }

  /*
   * Anything else is treated as the user's own site and labelled with its host, which is
   * both what they would call it and the only description the document actually supports.
   */
  return { type: "portfolio", label: host, url, personalSite: true };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
