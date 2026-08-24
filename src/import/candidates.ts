/**
 * Turning a career document into dossier entries the user can check.
 *
 * This is the interpretation layer, and its output is deliberately called a *candidate*
 * rather than an entry. Nothing here is saved. A candidate is a proposal: this is what we
 * think your document said, here are the lines we read it from, and here is what we were
 * unsure about. The user confirms, corrects or discards it, and only then does anything
 * reach their profile.
 *
 * Two rules shape every decision below.
 *
 * The first is that a value must come from the document. Where a field is required and the
 * document does not state it, the field is left empty and flagged, not filled with something
 * plausible. Somebody's employment type is a fact about their life; a parser has no business
 * deciding it. The two exceptions are classifications rather than facts — which of five
 * skill groups a skill belongs to, whether a listed credential is a certification or a course
 * — and both are read from the user's own section heading where it says, defaulted to the
 * neutral option where it does not, and noted either way.
 *
 * The second is that nothing disappears silently. Text we recognised but chose not to import,
 * and text we could not place, is returned in `skipped` so the review screen can say so. A
 * user who cannot see what was dropped has no way to know what to add by hand.
 *
 * Candidate values are keyed by the *form field names* the dossier already uses, so the
 * review screen renders the same controls as the dossier and the commit path runs the same
 * validation. There is no second schema and no second write path.
 */

import type { ProfileSectionKey } from "@/profile/types";

import { rejoinWrapped, splitBlocks, splitEntries, type Block, type Entry } from "./blocks";
import { findDate, findPeriod, removeSpan, type ParsedPeriod } from "./dates";
import {
  classifyLink,
  escapeRegExp,
  findEducationLevel,
  findEmail,
  findGrade,
  findLanguage,
  findLocation,
  findPhone,
  findUrls,
} from "./fields";
import type { ExtractedLine } from "./extract/line";

export type ImportCandidate = {
  /** Stable within one import, so the review form can address a row. */
  readonly id: string;
  readonly section: ProfileSectionKey;
  /** Keyed by dossier form field names. Absent means the document did not say. */
  readonly values: Readonly<Record<string, string>>;
  /** The lines this was read from, shown beside the fields for comparison. */
  readonly source: readonly string[];
  /** What needs a look, phrased for the person reading it. */
  readonly notes: readonly string[];
};

/** The person's own details, which are profile fields rather than section entries. */
export type ImportedBasics = {
  readonly values: Readonly<Record<string, string>>;
  readonly source: readonly string[];
  readonly notes: readonly string[];
};

export type ImportResult = {
  readonly basics: ImportedBasics;
  readonly candidates: readonly ImportCandidate[];
  /** Recognised but not imported, so nothing vanishes unseen. */
  readonly skipped: readonly string[];
};

/**
 * How many lines an entry's header can run to before a further line belongs to the next
 * entry. Experience and education write a role, an employer and a place; a list of
 * certifications writes one line each, and allowing three would fuse three into one.
 */
const HEAD_LIMITS: Readonly<Record<ProfileSectionKey, number>> = {
  experience: 3,
  education: 3,
  projects: 2,
  credentials: 1,
  achievements: 1,
  publications: 1,
  memberships: 1,
  /* Line-based sections; the entry splitter is not used for these. */
  skills: 1,
  languages: 1,
  links: 1,
};

type Draft = { values: Record<string, string>; notes: string[] };

type State = {
  candidates: ImportCandidate[];
  skipped: string[];
  counts: Map<string, number>;
  /** Every web address seen anywhere, so a link is imported once and only once. */
  claimedUrls: Set<string>;
};

export function readCandidates(rawLines: readonly ExtractedLine[]): ImportResult {
  const blocks = splitBlocks(rejoinWrapped(rawLines));
  const state: State = { candidates: [], skipped: [], counts: new Map(), claimedUrls: new Set() };

  const basics: Draft = { values: {}, notes: [] };
  const basicsSource: string[] = [];
  const identityLines: ExtractedLine[] = [];
  const summaryLines: ExtractedLine[] = [];

  for (const block of blocks) {
    switch (block.target) {
      case null:
      case "contact":
        identityLines.push(...block.lines);
        break;
      case "summary":
        summaryLines.push(...block.lines);
        break;
      case "ignore":
        noteSkippedBlock(state, block);
        break;
      default:
        readSection(state, block, block.target);
        break;
    }
  }

  readIdentity(state, identityLines, basics, basicsSource);
  readSummary(summaryLines, basics, basicsSource);

  return {
    basics: { values: basics.values, source: basicsSource, notes: basics.notes },
    candidates: state.candidates,
    skipped: state.skipped,
  };
}

/* Identity ------------------------------------------------------------------- */

/**
 * Reads the person's own details from the top of the document.
 *
 * This block is the one part of a CV that is not announced. It is identified by what its
 * lines look like: an address with an `@` in it, a run of digits long enough to be a phone
 * number, a web address, a place, and — usually first, usually the largest text on the page
 * — a name. Each line is stripped of the parts that are recognisable, and what is left over
 * is what the name and the headline are read from.
 */
function readIdentity(
  state: State,
  lines: readonly ExtractedLine[],
  basics: Draft,
  source: string[],
): void {
  const residues: string[] = [];
  const urls: string[] = [];

  for (const line of lines) {
    if (!line.text && line.links.length === 0) continue;
    source.push(line.text);

    let residue = line.text;

    const email = findEmail(residue);
    if (email) {
      if (!basics.values.contactEmail) basics.values.contactEmail = email;
      residue = removeSpan(residue, email);
    }

    for (const url of [...line.links, ...findUrls(residue)]) {
      urls.push(url);
      residue = removeSpan(residue, url);
    }

    const phone = findPhone(residue);
    if (phone) {
      if (!basics.values.phone) basics.values.phone = phone;
      residue = removeSpan(residue, phone);
    }

    const cleaned = residue.replace(/\s{2,}/g, " ").trim();
    if (cleaned) residues.push(cleaned);
  }

  claimIdentityUrls(state, urls, basics);

  for (const residue of residues) {
    /* A paragraph at the top of a CV is a profile statement, whatever it sits under. */
    if (!basics.values.careerDirection && wordCount(residue) >= 25) {
      basics.values.careerDirection = residue;
      basics.notes.push(
        "We read this from the summary at the top of your document. Edit it to describe the direction you are pursuing.",
      );
      continue;
    }

    if (!basics.values.displayName && looksLikeName(residue)) {
      basics.values.displayName = residue;
      if (residue === residue.toUpperCase()) {
        basics.notes.push(
          "Your document wrote your name in capitals. Change it here if you would rather it appeared differently.",
        );
      }
      continue;
    }

    if (!basics.values.city && !basics.values.country) {
      const place = findLocation(residue);
      if (place && isOnlyLocation(residue, place)) {
        if (place.city) basics.values.city = place.city;
        if (place.country) basics.values.country = place.country;
        if (place.city && !place.country) {
          basics.notes.push(
            `Your document gave "${place.city}" without a country. Add one if you want it shown.`,
          );
        }
        continue;
      }
    }

    if (!basics.values.headline && residue.length <= 160 && wordCount(residue) >= 2) {
      basics.values.headline = residue;
      continue;
    }

    state.skipped.push(`We left "${truncate(residue)}" out of your details.`);
  }
}

/**
 * Files the addresses from the identity block.
 *
 * A personal site goes to the profile's own website field and a profile on somebody else's
 * platform becomes a link entry, because that is how each is used: one is where the person
 * lives online, the others are things a reader clicks. The first personal site wins the
 * website field and any further ones still become link entries, so nothing is lost and
 * nothing appears twice in a rendered document.
 */
function claimIdentityUrls(state: State, urls: readonly string[], basics: Draft): void {
  for (const url of urls) {
    const link = classifyLink(url);
    if (link.personalSite && !basics.values.website) {
      basics.values.website = url;
      state.claimedUrls.add(normalizeForComparison(url));
      continue;
    }
    addLinkCandidate(state, link, [url]);
  }
}

function readSummary(lines: readonly ExtractedLine[], basics: Draft, source: string[]): void {
  const text = lines
    .map((line) => stripBullet(line.text))
    .filter(Boolean)
    .join("\n");
  if (!text) return;

  source.push(...lines.map((line) => line.text).filter(Boolean));

  if (basics.values.careerDirection) {
    basics.values.careerDirection = `${basics.values.careerDirection}\n${text}`.slice(0, 2000);
    return;
  }

  basics.values.careerDirection = text.slice(0, 2000);
  basics.notes.push(
    "We read this from the summary in your document. Edit it to describe the direction you are pursuing.",
  );
}

/* Sections ------------------------------------------------------------------- */

function readSection(state: State, block: Block, section: ProfileSectionKey): void {
  switch (section) {
    case "skills":
      readSkills(state, block);
      return;
    case "languages":
      readLanguages(state, block);
      return;
    case "links":
      readLinks(state, block);
      return;
    default:
      break;
  }

  const entries = splitEntries(block.lines, HEAD_LIMITS[section]);
  for (const entry of entries) {
    const draft = parseEntry(section, entry, block.heading);
    if (!draft) {
      state.skipped.push(
        `We could not read an entry under "${block.heading ?? "your document"}": ${truncate(
          sourceOf(entry).join(" "),
        )}`,
      );
      continue;
    }
    add(state, section, draft, sourceOf(entry));
  }
}

function parseEntry(
  section: ProfileSectionKey,
  entry: Entry,
  heading: string | null,
): Draft | null {
  switch (section) {
    case "experience":
      return parseExperience(entry, heading);
    case "education":
      return parseEducation(entry);
    case "projects":
      return parseProject(entry);
    case "credentials":
      return parseCredential(entry, heading);
    case "achievements":
      return parseAchievement(entry, heading);
    case "publications":
      return parsePublication(entry);
    case "memberships":
      return parseMembership(entry);
    default:
      return null;
  }
}

/* Experience ----------------------------------------------------------------- */

function parseExperience(entry: Entry, heading: string | null): Draft | null {
  const draft: Draft = { values: {}, notes: [] };
  const head = headStrings(entry);

  const period = takePeriod(head);
  if (period) applyPeriod(draft.values, period);
  else draft.notes.push("We could not find dates for this role. Add them if you want them shown.");

  const parts = fragmentsOf(head);
  const location = takeLocation(parts);
  if (location) draft.values.location = location;

  const assignment = assignRoleAndOrganization(parts);
  if (!assignment.role && !assignment.organization) return null;

  if (assignment.role) draft.values.role = assignment.role;
  if (assignment.organization) draft.values.organization = assignment.organization;

  if (!assignment.role) draft.notes.push("Add the role or position you held.");
  if (!assignment.organization) draft.notes.push("Add the organization or client.");
  else if (assignment.uncertain) {
    draft.notes.push("Check the role and organization — we were not sure which was which.");
  }
  noteLeftovers(draft, assignment.leftover);

  /*
   * The arrangement is read from the user's own words — their section heading, or the role
   * itself — and otherwise left for them to choose. Guessing "full-time" would put a claim
   * about somebody's employment into their profile on no evidence at all.
   */
  const arrangement =
    experienceTypeFrom(draft.values.role ?? "") ?? experienceTypeFrom(heading ?? "");
  if (arrangement) draft.values.type = arrangement;
  else draft.notes.push("Choose how this role was arranged.");

  const description = describe(entry.body);
  if (description) draft.values.description = description;

  return draft;
}

function experienceTypeFrom(text: string): string | null {
  if (/\bintern(?:ship)?s?\b/i.test(text)) return "internship";
  if (/\bvolunteer(?:ing)?\b/i.test(text)) return "volunteering";
  if (/\bfreelanc/i.test(text)) return "freelance";
  if (/\bapprentice/i.test(text)) return "apprenticeship";
  if (/\bcontract\b/i.test(text)) return "contract";
  if (/\bpart[-\s]?time\b/i.test(text)) return "part-time";
  if (/\bfull[-\s]?time\b/i.test(text)) return "full-time";
  return null;
}

/* Education ------------------------------------------------------------------ */

const INSTITUTION_WORDS =
  /\b(?:university|universit[éeàa]\w*|universidad|universiteit|hochschule|college|school|institute|institution|polytechnic|academy|seminary|conservatoire|conservatory|faculty|campus)\b/i;

function parseEducation(entry: Entry): Draft | null {
  const draft: Draft = { values: {}, notes: [] };
  const head = headStrings(entry);

  const period = takePeriod(head);
  if (period) applyPeriod(draft.values, period);

  const grade = findGrade([...head, ...entry.body.map((line) => line.text)].join(" "));
  if (grade) {
    draft.values.gradingSystem = grade.gradingSystem;
    draft.values.grade = grade.grade;
    if (grade.assumedScale) {
      draft.notes.push(
        `Your document gave a grade of ${grade.grade} without saying what it was out of. Change the grading system if that is wrong.`,
      );
    }
    for (const [index, line] of head.entries()) {
      if (line.includes(grade.matched)) head[index] = removeSpan(line, grade.matched);
    }
  }

  const parts = fragmentsOf(head);
  const location = takeLocation(parts);
  if (location) draft.values.location = location;

  const institutionIndex = parts.findIndex((part) => INSTITUTION_WORDS.test(part));
  if (institutionIndex >= 0) {
    draft.values.institution = parts.splice(institutionIndex, 1)[0]!;
  }

  const qualificationIndex = parts.findIndex((part) => findEducationLevel(part) !== null);
  if (qualificationIndex >= 0) {
    const qualification = parts.splice(qualificationIndex, 1)[0]!;
    const level = findEducationLevel(qualification);
    if (level) draft.values.level = level.level;
    applyQualification(draft.values, qualification);
  }

  if (!draft.values.institution) {
    /* Whatever is left is the likeliest institution: it is the part naming a proper noun. */
    const fallback = parts.shift();
    if (fallback) draft.values.institution = fallback;
    else draft.notes.push("Add the institution or learning provider.");
  }

  if (!draft.values.qualification && parts.length > 0) {
    const qualification = parts.shift()!;
    const level = findEducationLevel(qualification);
    if (level && !draft.values.level) draft.values.level = level.level;
    applyQualification(draft.values, qualification);
  }

  if (!draft.values.institution && !draft.values.qualification) return null;

  noteLeftovers(draft, parts);

  const description = describe(entry.body);
  if (description) draft.values.description = description;

  return draft;
}

/**
 * Splits "B.Sc in Computer Science" into a qualification and a field of study.
 *
 * Only " in " does this, and only its last occurrence. "Bachelor of Science" is kept whole
 * because splitting on "of" would leave the qualification as "Bachelor" and call "Science"
 * the field of study, which is a worse record than not splitting at all.
 */
function applyQualification(values: Record<string, string>, text: string): void {
  const separator = text.toLowerCase().lastIndexOf(" in ");
  if (separator > 0 && text.length - separator - 4 <= 120) {
    const field = text.slice(separator + 4).trim();
    const qualification = text.slice(0, separator).trim();
    if (field && qualification) {
      values.qualification = qualification;
      values.field = field;
      return;
    }
  }
  values.qualification = text;
}

/* Projects ------------------------------------------------------------------- */

function parseProject(entry: Entry): Draft | null {
  const draft: Draft = { values: {}, notes: [] };
  const head = headStrings(entry);

  const period = takePeriod(head);
  if (period) applyPeriod(draft.values, period);

  const url = takeUrl(head, entry);
  if (url) draft.values.url = url;

  const parts = fragmentsOf(head);
  const name = parts.shift();
  if (!name) return null;
  draft.values.name = name;

  const roleIndex = parts.findIndex((part) => countMatches(part, ROLE_WORDS) > 0);
  if (roleIndex >= 0) draft.values.role = parts.splice(roleIndex, 1)[0]!;

  const context = parts.shift();
  if (context) draft.values.context = context;
  noteLeftovers(draft, parts);

  const description = describe(entry.body);
  if (description) draft.values.description = description;

  return draft;
}

/* Credentials ---------------------------------------------------------------- */

const IDENTIFIER =
  /\b(?:credential|licen[cs]e|certificate|registration|membership|id|no)\.?\s*(?:id|number|no\.?|#)?\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9/-]{3,})\b/i;

function parseCredential(entry: Entry, heading: string | null): Draft | null {
  const draft: Draft = { values: {}, notes: [] };
  const head = headStrings(entry);

  const identifier = IDENTIFIER.exec(head.join(" "));
  if (identifier?.[1]) {
    draft.values.identifier = identifier[1];
    for (const [index, line] of head.entries()) {
      if (line.includes(identifier[0])) head[index] = removeSpan(line, identifier[0]);
    }
  }

  const expiry = takeExpiry(head);
  if (expiry) {
    if (expiry.month) draft.values.expiryMonth = String(expiry.month);
    if (expiry.year) draft.values.expiryYear = String(expiry.year);
  }

  const issued = takeDate(head);
  if (issued) {
    if (issued.month) draft.values.issueMonth = String(issued.month);
    if (issued.year) draft.values.issueYear = String(issued.year);
  }

  const url = takeUrl(head, entry);
  if (url) draft.values.url = url;

  const parts = fragmentsOf(head);
  takeLocation(parts);

  const name = parts.shift();
  if (!name) return null;
  draft.values.name = name;

  const issuerIndex = parts.findIndex((part) => countMatches(part, ORGANIZATION_WORDS) > 0);
  const issuer = issuerIndex >= 0 ? parts.splice(issuerIndex, 1)[0] : parts.shift();
  if (issuer) draft.values.issuer = issuer;
  noteLeftovers(draft, parts);

  const type = credentialTypeFrom(heading ?? "") ?? credentialTypeFrom(name);
  draft.values.type = type ?? "other";
  if (!type) {
    draft.notes.push("Set the credential type — your document did not say which kind this is.");
  }

  const description = describe(entry.body);
  if (description) draft.values.description = description;

  return draft;
}

function credentialTypeFrom(text: string): string | null {
  if (/\blicen[cs]e/i.test(text)) return "license";
  if (/\bworkshop/i.test(text)) return "workshop";
  if (/\bcourse/i.test(text)) return "course";
  if (/\btraining\b/i.test(text)) return "training";
  if (/\bvocational\b/i.test(text)) return "vocational";
  if (/\btrade\b/i.test(text)) return "trade";
  if (/\bcertificat|\bcertification/i.test(text)) return "certification";
  return null;
}

/**
 * The expiry date, where the line says it has one.
 *
 * Read before the issue date and removed from the line, because otherwise "Issued 2023,
 * expires 2026" is read as a range from 2023 to 2026 and the credential acquires a period
 * it does not have.
 */
function takeExpiry(head: string[]): { month: number | null; year: number | null } | null {
  const keyword = /\b(?:expir\w*|valid\s+(?:un)?til|renews?\s+\w*|renewal)\b/i;
  for (const [index, line] of head.entries()) {
    const match = keyword.exec(line);
    if (!match) continue;
    const after = line.slice(match.index + match[0].length);
    const date = findDate(after);
    if (!date) continue;
    head[index] = removeSpan(removeSpan(line, date.matched), match[0]);
    return { month: date.month, year: date.year };
  }
  return null;
}

/* Achievements --------------------------------------------------------------- */

function parseAchievement(entry: Entry, heading: string | null): Draft | null {
  const draft: Draft = { values: {}, notes: [] };
  const head = headStrings(entry);

  const date = takeDate(head);
  if (date) {
    if (date.month) draft.values.month = String(date.month);
    if (date.year) draft.values.year = String(date.year);
  }

  const parts = fragmentsOf(head);
  const title = parts.shift();
  if (!title) return null;
  draft.values.title = title;

  const issuer = parts.shift();
  if (issuer) draft.values.issuer = issuer;
  noteLeftovers(draft, parts);

  draft.values.type = /\b(?:award|honou?r|prize|scholarship|distinction|medal|recognition|fellowship)/i.test(
    `${heading ?? ""} ${title}`,
  )
    ? "award"
    : "achievement";

  const description = describe(entry.body);
  if (description) draft.values.description = description;

  return draft;
}

/* Publications --------------------------------------------------------------- */

function parsePublication(entry: Entry): Draft | null {
  const draft: Draft = { values: {}, notes: [] };
  const head = headStrings(entry);

  const date = takeDate(head);
  if (date) {
    if (date.month) draft.values.month = String(date.month);
    if (date.year) draft.values.year = String(date.year);
  }

  const url = takeUrl(head, entry);
  if (url) draft.values.url = url;

  /*
   * A citation is not fragmented the way a job header is: commas separate authors, titles
   * and venues in an order that varies by style guide. So the line is kept whole as the
   * title unless a strong separator marks off a venue, and the user is told to check it.
   */
  const text = head.join(" ").trim();
  if (!text) return null;

  const parts = splitOnStrongSeparator(text);
  draft.values.title = (parts[0] ?? text).slice(0, 300);
  if (parts.length > 1) draft.values.publisher = parts.slice(1).join(" — ").slice(0, 200);
  else draft.notes.push("Check the title, and add the publisher or venue if you want it shown.");

  const description = describe(entry.body);
  if (description) draft.values.description = description;

  return draft;
}

/* Memberships ---------------------------------------------------------------- */

function parseMembership(entry: Entry): Draft | null {
  const draft: Draft = { values: {}, notes: [] };
  const head = headStrings(entry);

  const period = takePeriod(head);
  if (period) applyPeriod(draft.values, period);

  const parts = fragmentsOf(head);
  takeLocation(parts);

  const organizationIndex = parts.findIndex((part) => countMatches(part, ORGANIZATION_WORDS) > 0);
  const organization = organizationIndex >= 0 ? parts.splice(organizationIndex, 1)[0] : parts.shift();
  if (!organization) return null;
  draft.values.organization = organization;

  const role = parts.shift();
  if (role) draft.values.role = role;
  noteLeftovers(draft, parts);

  const description = describe(entry.body);
  if (description) draft.values.description = description;

  return draft;
}

/* Skills --------------------------------------------------------------------- */

/** Longer than this and it is a sentence about a skill, not the name of one. */
const MAX_SKILL_LENGTH = 60;

function readSkills(state: State, block: Block): void {
  const headingType = skillTypeFrom(block.heading ?? "");
  const seen = new Set<string>();
  let defaulted = false;

  for (const line of block.lines) {
    if (!line.text) continue;

    let text = stripBullet(line.text);
    let type = headingType;

    /*
     * "Technical: React, Node.js" states the group and then its members. The label is the
     * user's own classification, so it is preferred over the section heading's.
     */
    const labelled = /^([A-Za-z][A-Za-z /&-]{2,40}):\s*(.+)$/.exec(text);
    if (labelled?.[1] && labelled[2]) {
      const labelType = skillTypeFrom(labelled[1]);
      if (labelType) {
        type = labelType;
        text = labelled[2];
      }
    }

    const names = text
      .split(/\s*[,;|·•]\s*|\s{3,}/)
      .map((name) => name.replace(/^[\s\-–—]+|[\s.]+$/g, "").trim())
      .filter(Boolean);

    for (const name of names) {
      if (name.length > MAX_SKILL_LENGTH || wordCount(name) > 6) {
        state.skipped.push(`We left "${truncate(name)}" out of your skills — it reads as prose.`);
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      if (!type) defaulted = true;
      add(
        state,
        "skills",
        { values: { name, type: type ?? "other" }, notes: [] },
        [line.text],
      );
    }
  }

  if (defaulted) {
    state.skipped.push(
      "Your document did not group your skills, so they are all filed as Other. Set the type on any that belong elsewhere.",
    );
  }
}

function skillTypeFrom(text: string): string | null {
  if (/\bsoft\b|\binterpersonal\b|\bpeople\b|\bcommunication\b/i.test(text)) return "soft";
  if (/\btechnical\b|\bprogramming\b|\bsoftware\b|\btools?\b|\btechnolog|\bdigital\b|\bcomputer\b|\bstack\b|\bplatforms?\b|\blanguages\b/i.test(text)) {
    return "technical";
  }
  if (/\btrade\b|\bpractical\b|\bmanual\b|\bcraft\b|\bvocational\b|\btechnical\s+trade\b/i.test(text)) {
    return "trade";
  }
  if (/\bprofessional\b|\bbusiness\b|\bmanagement\b|\bcompetenc|\bexpertise\b/i.test(text)) {
    return "professional";
  }
  return null;
}

/* Languages ------------------------------------------------------------------ */

function readLanguages(state: State, block: Block): void {
  for (const line of block.lines) {
    if (!line.text) continue;

    const text = stripBullet(line.text);
    /* One line can list several: "English (Native), French (B2), Yoruba". */
    const items = text.split(/\s*[,;|·•]\s*(?![A-C][12]\))/).filter(Boolean);

    let read = 0;
    for (const item of items) {
      const found = findLanguage(item);
      if (!found) continue;
      read += 1;

      const values: Record<string, string> = { language: found.language };
      if (found.proficiency) values.proficiency = found.proficiency;

      const notes = found.proficiency && !found.matchedProficiency
        ? [`We kept "${found.proficiency}" exactly as your document wrote it.`]
        : [];
      add(state, "languages", { values, notes }, [line.text]);
    }

    if (read === 0) {
      state.skipped.push(`We did not recognise a language in "${truncate(text)}".`);
    }
  }
}

/* Links ---------------------------------------------------------------------- */

function readLinks(state: State, block: Block): void {
  for (const line of block.lines) {
    const urls = [...new Set([...line.links, ...findUrls(line.text)])];
    if (urls.length === 0) {
      if (line.text) {
        state.skipped.push(`We found no web address in "${truncate(line.text)}".`);
      }
      continue;
    }

    /* What the line said other than the address — the user's own label for it. */
    const label = urls
      .reduce((text, url) => removeSpan(text, url), stripBullet(line.text))
      .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
      .trim();

    for (const url of urls) {
      const link = classifyLink(url);
      addLinkCandidate(state, label && urls.length === 1 ? { ...link, label } : link, [line.text || url]);
    }
  }
}

function addLinkCandidate(state: State, link: ReturnType<typeof classifyLink>, source: string[]): void {
  const key = normalizeForComparison(link.url);
  if (state.claimedUrls.has(key)) return;
  state.claimedUrls.add(key);

  add(
    state,
    "links",
    {
      values: { type: link.type, label: link.label.slice(0, 120), url: link.url },
      notes: [],
    },
    source,
  );
}

/* Shared reading ------------------------------------------------------------- */

const ROLE_WORDS =
  /\b(?:engineer|developer|programmer|designer|architect|analyst|scientist|researcher|manager|director|officer|executive|president|chief|head|lead|supervisor|coordinator|administrator|assistant|associate|specialist|consultant|advisor|adviser|intern|trainee|apprentice|volunteer|fellow|teacher|lecturer|professor|tutor|instructor|trainer|coach|nurse|doctor|physician|surgeon|pharmacist|dentist|midwife|therapist|counsell?or|paramedic|technician|technologist|accountant|auditor|bookkeeper|controller|treasurer|lawyer|attorney|solicitor|barrister|paralegal|clerk|secretary|receptionist|writer|editor|journalist|copywriter|producer|marketer|strategist|planner|buyer|recruiter|representative|agent|broker|cashier|teller|steward|attendant|driver|operator|chef|cook|baker|barista|waiter|waitress|bartender|electrician|plumber|carpenter|mechanic|welder|fitter|mason|tailor|stylist|barber|farmer|surveyor|estimator|foreman|guard|inspector|registrar|curator|librarian|archivist|dean|principal|founder|owner|partner|ambassador|liaison|facilitator|moderator)\b/i;

const ORGANIZATION_WORDS =
  /\b(?:ltd|limited|llc|inc|incorporated|corp|corporation|plc|gmbh|pty|co|company|group|holdings|enterprises|ventures|industries|technologies|technology|solutions|systems|services|consulting|consultancy|labs|laboratory|studio|studios|agency|partners|associates|foundation|institute|institution|university|college|school|academy|polytechnic|hospital|clinic|centre|center|bank|insurance|ministry|department|commission|authority|council|bureau|board|trust|society|association|federation|union|church|mosque|initiative|network|media|press|publishing|logistics|construction|engineering|energy|petroleum|telecoms?|telecommunications|airlines|hotels|resorts|stores|supermarket|pharmacy)\b/i;

/** The header lines as plain strings, which the readers below consume and shorten. */
function headStrings(entry: Entry): string[] {
  return entry.head.map((line) => stripBullet(line.text)).filter(Boolean);
}

function sourceOf(entry: Entry): string[] {
  return [...entry.head, ...entry.body].map((line) => line.text).filter(Boolean);
}

/** Reads the first period in the header and takes it out of the line it was in. */
function takePeriod(head: string[]): ParsedPeriod | null {
  for (const [index, line] of head.entries()) {
    const period = findPeriod(line);
    if (!period) continue;
    head[index] = removeSpan(line, period.matched);
    return period;
  }
  return null;
}

function takeDate(head: string[]): { month: number | null; year: number | null } | null {
  for (const [index, line] of head.entries()) {
    const date = findDate(line);
    if (!date) continue;
    head[index] = removeSpan(line, date.matched);
    return { month: date.month, year: date.year };
  }
  return null;
}

function takeUrl(head: string[], entry: Entry): string | null {
  for (const [index, line] of head.entries()) {
    const [url] = findUrls(line);
    if (!url) continue;
    head[index] = removeSpan(line, url);
    return url;
  }
  const attached = [...entry.head, ...entry.body].flatMap((line) => line.links);
  return attached[0] ?? null;
}

function applyPeriod(values: Record<string, string>, period: ParsedPeriod): void {
  if (period.startMonth) values.startMonth = String(period.startMonth);
  if (period.startYear) values.startYear = String(period.startYear);
  if (period.current) {
    values.current = "on";
    return;
  }
  if (period.endMonth) values.endMonth = String(period.endMonth);
  if (period.endYear) values.endYear = String(period.endYear);
}

/**
 * Splits header lines into the separate things they name.
 *
 * Separators are tried strongest first, and only one tier is used. A line written
 * "Frontend Developer · Code Bruv" is split on the bullet and never on the comma inside
 * "Code Bruv, Lagos"; a line written "Senior Analyst, Financial Crime" only reaches the
 * comma tier because it contains nothing stronger. That ordering is what keeps a role
 * containing a comma intact whenever the document gave us a better place to cut.
 */
const SEPARATOR_TIERS: readonly RegExp[] = [
  /\s*[·•|]\s*/,
  /\s+[–—]\s+|\s+-{1,2}\s+/,
  /\s+at\s+/i,
  /\s*,\s*/,
];

function fragmentsOf(head: readonly string[]): string[] {
  return head.flatMap((line) => splitFragments(line));
}

function splitFragments(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  for (const tier of SEPARATOR_TIERS) {
    if (!tier.test(trimmed)) continue;
    return trimmed
      .split(new RegExp(tier.source, tier.flags.includes("i") ? "gi" : "g"))
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

function splitOnStrongSeparator(text: string): string[] {
  for (const tier of SEPARATOR_TIERS.slice(0, 2)) {
    if (!tier.test(text)) continue;
    return text
      .split(new RegExp(tier.source, "g"))
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [text.trim()];
}

/**
 * Takes the location out of the fragment list, if one of them is *only* a location.
 *
 * The whole-fragment test is what stops "American University of Nigeria" being read as a
 * country and left as "American University of". A fragment qualifies only when removing the
 * place name leaves nothing behind, which is true of "Lagos, Nigeria" and "Remote" and
 * false of any name that happens to contain a country.
 */
function takeLocation(parts: string[]): string | null {
  for (const [index, part] of parts.entries()) {
    const place = findLocation(part);
    if (!place || !isOnlyLocation(part, place)) continue;
    parts.splice(index, 1);
    if (place.arrangement) return place.arrangement;
    return [place.city, place.country].filter(Boolean).join(", ");
  }
  return null;
}

function isOnlyLocation(text: string, place: { city: string; country: string; arrangement: string }): boolean {
  let remainder = text;
  for (const value of [place.arrangement, place.country, place.city]) {
    if (value) remainder = remainder.replace(new RegExp(escapeRegExp(value), "i"), " ");
  }
  return remainder.replace(/[\s,;:()|·•\-–—]/g, "") === "";
}

type Assignment = {
  role: string;
  organization: string;
  leftover: string[];
  /** Neither fragment named itself, so the order of the document was all we had. */
  uncertain: boolean;
};

/**
 * Decides which fragment is the role and which is the organization.
 *
 * Vocabulary first: "Developer" names a role and "Ltd" names a company, and those two
 * signals resolve most lines regardless of the order the document wrote them in. Where
 * neither fragment says anything, the convention holds — a CV writes the role before the
 * employer — and the caller is told the assignment was positional so the review screen can
 * ask.
 */
function assignRoleAndOrganization(parts: string[]): Assignment {
  if (parts.length === 0) return { role: "", organization: "", leftover: [], uncertain: false };

  if (parts.length === 1) {
    const only = parts[0]!;
    const asOrganization = countMatches(only, ORGANIZATION_WORDS) > countMatches(only, ROLE_WORDS);
    return {
      role: asOrganization ? "" : only,
      organization: asOrganization ? only : "",
      leftover: [],
      uncertain: false,
    };
  }

  const scored = parts.map((text) => ({
    text,
    role: countMatches(text, ROLE_WORDS),
    organization: countMatches(text, ORGANIZATION_WORDS),
  }));

  const roleAt = bestIndex(scored.map((part) => part.role - part.organization));
  const rest = scored.filter((_, index) => index !== roleAt);
  const organizationAt = bestIndex(rest.map((part) => part.organization - part.role));

  const role = scored[roleAt]!;
  const organization = rest[organizationAt];

  return {
    role: role.text,
    organization: organization?.text ?? "",
    leftover: rest.filter((_, index) => index !== organizationAt).map((part) => part.text),
    uncertain: scored.every((part) => part.role === 0 && part.organization === 0),
  };
}

/** The first index holding the maximum, so an all-equal list keeps the document's order. */
function bestIndex(scores: readonly number[]): number {
  let best = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if ((scores[index] ?? 0) > (scores[best] ?? 0)) best = index;
  }
  return best;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, "gi")) ?? []).length;
}

/**
 * The entry's body as the user's own lines.
 *
 * Kept as separate lines rather than a paragraph, because that is what the dossier's
 * description field stores and what the document renderer turns back into bullets. Bullet
 * glyphs are stripped: they were the document's punctuation, and re-rendering them would
 * produce two markers on every line.
 */
function describe(body: readonly ExtractedLine[]): string {
  return body
    .map((line) => stripBullet(line.text))
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);
}

function stripBullet(text: string): string {
  return text.replace(/^[\s•‣▪●·⁃∙*›»—–-]+/, "").trim();
}

function noteLeftovers(draft: Draft, leftover: readonly string[]): void {
  const kept = leftover.filter(Boolean);
  if (kept.length === 0) return;
  draft.notes.push(`We did not place ${kept.map((part) => `"${truncate(part)}"`).join(", ")}.`);
}

function add(
  state: State,
  section: ProfileSectionKey,
  draft: Draft,
  source: readonly string[],
): void {
  const index = (state.counts.get(section) ?? 0) + 1;
  state.counts.set(section, index);

  state.candidates.push({
    id: `${section}.${index}`,
    section,
    values: draft.values,
    source: source.filter(Boolean),
    notes: draft.notes,
  });
}

function noteSkippedBlock(state: State, block: Block): void {
  if (!block.heading) return;
  state.skipped.push(`We left out the "${block.heading}" section — the dossier has no home for it.`);
}

function looksLikeName(text: string): boolean {
  if (text.length > 60 || /[@\d]/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word) => /^[A-Z]/.test(word) || word === word.toUpperCase());
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function truncate(text: string, limit = 60): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** Same address written two ways — with or without a scheme, with or without `www.`. */
function normalizeForComparison(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}
