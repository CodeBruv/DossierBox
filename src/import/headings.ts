/**
 * Recognising the headings a career document organises itself with.
 *
 * A CV is already structured — every one of them names its own sections — and reading those
 * names is by far the most reliable signal available. "EXPERIENCE" on its own line tells us
 * more about the twelve lines beneath it than any amount of analysis of those lines would.
 *
 * The vocabulary is deliberately global rather than a translation of one market's habits.
 * "Qualifications" is education in Britain, "Employment History" is experience everywhere,
 * "Bio Data" is a contact block in West Africa, and a document that says "Areas of Expertise"
 * means skills. Where a heading names something the dossier has no home for — interests,
 * referees — it is still recognised, because knowing a block is referees is what stops twelve
 * lines of referee details being filed as somebody's work history.
 *
 * Two things this does not do. It does not translate: a heading in another language is not
 * recognised, and the block beneath it is reported as unplaced rather than guessed at. And it
 * does not decide what the lines mean — that is the parser's job, and the user's after that.
 */

import type { ProfileSectionKey } from "@/profile/types";

/**
 * Where a block of lines belongs.
 *
 * The three non-section targets carry real meaning. `summary` is a profile paragraph, which
 * belongs to the dossier's career direction rather than to any section. `contact` is where
 * the details that identify a person live. `ignore` is a block we recognise and deliberately
 * do not import, which is different from a block we failed to understand.
 */
export type SectionTarget = ProfileSectionKey | "summary" | "contact" | "ignore";

/**
 * Heading phrases, longest match winning.
 *
 * Order within a target does not matter; order between targets does, marginally, and only
 * for a heading that names two things at once. "Education and Training" is education rather
 * than credentials because the phrase itself is listed under education.
 */
const HEADING_PHRASES: readonly (readonly [SectionTarget, readonly string[]])[] = [
  [
    "experience",
    [
      "experience",
      "work experience",
      "working experience",
      "professional experience",
      "employment",
      "employment history",
      "employment experience",
      "work history",
      "career history",
      "career experience",
      "professional background",
      "professional history",
      "relevant experience",
      "industry experience",
      "practical experience",
      "positions held",
      "roles held",
      "internships",
      "internship experience",
      "volunteer experience",
      "volunteering",
      "freelance experience",
      "consulting experience",
      "teaching experience",
      "clinical experience",
      "research experience",
    ],
  ],
  [
    "education",
    [
      "education",
      "education and training",
      "education and qualifications",
      "educational background",
      "educational qualifications",
      "academic background",
      "academic qualifications",
      "academic history",
      "academic record",
      "qualifications",
      "schools attended",
      "institutions attended",
      "study",
      "studies",
    ],
  ],
  [
    "projects",
    [
      "projects",
      "project experience",
      "selected projects",
      "key projects",
      "notable projects",
      "personal projects",
      "technical projects",
      "academic projects",
      "project portfolio",
    ],
  ],
  [
    "skills",
    [
      "skills",
      "skill set",
      "core skills",
      "key skills",
      "main skills",
      "relevant skills",
      "technical skills",
      "professional skills",
      "soft skills",
      "interpersonal skills",
      "transferable skills",
      "skills and competencies",
      "skills summary",
      "competencies",
      "core competencies",
      "key competencies",
      "areas of expertise",
      "expertise",
      "technical expertise",
      "technical proficiencies",
      "proficiencies",
      "tools and technologies",
      "technologies",
      "technical stack",
      "tech stack",
    ],
  ],
  [
    "credentials",
    [
      "certifications",
      "certification",
      "certificates",
      "licences",
      "licenses",
      "licences and certifications",
      "licenses and certifications",
      "certifications and licences",
      "certifications and licenses",
      "certifications and training",
      "professional certifications",
      "professional development",
      "professional qualifications",
      "credentials",
      "accreditations",
      "training",
      "training and certifications",
      "courses",
      "relevant courses",
      "courses and training",
      "workshops",
      "continuing education",
    ],
  ],
  [
    "achievements",
    [
      "achievements",
      "key achievements",
      "notable achievements",
      "accomplishments",
      "awards",
      "awards and honours",
      "awards and honors",
      "awards and recognition",
      "honours",
      "honors",
      "honours and awards",
      "honors and awards",
      "recognition",
      "prizes",
      "scholarships",
      "distinctions",
    ],
  ],
  [
    "languages",
    ["languages", "language skills", "language proficiency", "languages spoken", "spoken languages"],
  ],
  [
    "publications",
    [
      "publications",
      "selected publications",
      "published work",
      "papers",
      "research papers",
      "conference papers",
      "journal articles",
      "articles",
      "research and publications",
    ],
  ],
  [
    "memberships",
    [
      "memberships",
      "membership",
      "professional memberships",
      "affiliations",
      "professional affiliations",
      "associations",
      "professional associations",
      "professional bodies",
      "societies",
    ],
  ],
  [
    "links",
    ["links", "profiles", "online profiles", "online presence", "web presence", "social profiles"],
  ],
  [
    "summary",
    [
      "profile",
      "personal profile",
      "professional profile",
      "career profile",
      "summary",
      "summary of qualifications",
      "professional summary",
      "career summary",
      "executive summary",
      "personal statement",
      "about me",
      "about",
      "objective",
      "career objective",
      "professional objective",
      "career goal",
      "overview",
      "introduction",
    ],
  ],
  [
    "contact",
    [
      "contact",
      "contact details",
      "contact information",
      "personal details",
      "personal information",
      "personal data",
      "bio data",
      "biodata",
    ],
  ],
  [
    "ignore",
    [
      "references",
      "referees",
      "reference",
      "referees available on request",
      "interests",
      "hobbies",
      "interests and hobbies",
      "hobbies and interests",
      "additional information",
      "other information",
      "declaration",
      "signature",
      "extracurricular activities",
      "activities",
      "table of contents",
    ],
  ],
];

/** Phrase → target, longest phrase first so a compound heading resolves to its longer name. */
const orderedPhrases: readonly (readonly [string, SectionTarget])[] = HEADING_PHRASES.flatMap(
  ([target, phrases]) => phrases.map((phrase) => [phrase, target] as const),
).sort((a, b) => b[0].length - a[0].length);

const exactPhrases = new Map<string, SectionTarget>(
  /* Reversed so that when two targets claim the same phrase, the earlier target wins. */
  [...orderedPhrases].reverse().map(([phrase, target]) => [phrase, target] as const),
);

/**
 * A heading's text, reduced to the words it is made of.
 *
 * Case, punctuation, decorative rules and a trailing colon are all presentation. "&" becomes
 * "and" because half the world writes one and half the other, and both mean the same section.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The longest heading phrase this line contains as whole words, if any. */
function containedPhrase(normalized: string): SectionTarget | null {
  for (const [phrase, target] of orderedPhrases) {
    /* Whole words only: "expertise" must not match inside "expertise-driven". */
    if (normalized === phrase) return target;
    if (normalized.startsWith(`${phrase} `)) return target;
    if (normalized.endsWith(` ${phrase}`)) return target;
    if (normalized.includes(` ${phrase} `)) return target;
  }
  return null;
}

/**
 * Whether a line is a section heading, and which section it names.
 *
 * Two tiers, because heading formatting is not reliable. A line whose entire text is a known
 * heading phrase is a heading whatever the document did or did not mark it as — "Education"
 * alone on a line is never a sentence. A line that merely *contains* a heading phrase has to
 * look like a heading as well: short, no sentence punctuation, and either emphasised by the
 * source or written in the capitals that documents use instead of emphasis. That second tier
 * is what accepts "PROFESSIONAL EXPERIENCE & ACHIEVEMENTS" while rejecting "I have five
 * years of experience in retail management".
 */
export function classifyHeading(line: {
  text: string;
  emphasis: boolean;
  bullet: boolean;
}): SectionTarget | null {
  if (line.bullet) return null;

  const trimmed = line.text.trim();
  if (!trimmed || trimmed.length > 60) return null;

  const normalized = normalize(trimmed);
  if (!normalized) return null;

  const exact = exactPhrases.get(normalized);
  if (exact) return exact;

  const words = normalized.split(" ");
  if (words.length > 6) return null;
  if (/[.!?]$/.test(trimmed)) return null;

  const shouty = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  if (!line.emphasis && !shouty) return null;

  return containedPhrase(normalized);
}
