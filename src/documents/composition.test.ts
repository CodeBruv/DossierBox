import { describe, expect, it } from "vitest";
import {
  emptyDossierSnapshot,
  type DossierIdentity,
  type DossierSnapshot,
} from "@/profile/dossier";
import { profileSectionKeys } from "@/profile/types";
import { experienceTypeOptions } from "@/profile/vocabularies";
import type { DocumentType } from "./schema";
import {
  composableSections,
  composeDocument,
  composeStructuredDocument,
  formatMonthYear,
  formatPeriod,
  isComposedDocumentEmpty,
  type ComposedDocument,
  type ComposedSection,
} from "./composition";

const documentTypes: DocumentType[] = ["professional_cv", "professional_resume", "academic_cv"];

const blankIdentity: DossierIdentity = {
  displayName: null,
  headline: null,
  careerDirection: null,
  contactEmail: null,
  phone: null,
  city: null,
  region: null,
  country: null,
  website: null,
};

const noPeriod = {
  startMonth: null,
  startYear: null,
  endMonth: null,
  endYear: null,
  current: false,
};

/** An education row with nothing stated but the parts a test names. */
const bareEducation = {
  ...noPeriod,
  institution: "",
  qualification: null,
  field: null,
  level: null,
  gradingSystem: null,
  grade: null,
  location: null,
  description: null,
};

function snapshot(overrides: Partial<DossierSnapshot> = {}): DossierSnapshot {
  return {
    ...emptyDossierSnapshot(blankIdentity),
    ...overrides,
    identity: { ...blankIdentity, ...overrides.identity },
  };
}

function keysOf(sections: readonly ComposedSection[]) {
  return sections.map((section) => section.key);
}

function sectionNamed(document: ComposedDocument, key: string) {
  const section = document.sections.find((entry) => entry.key === key);
  if (!section) throw new Error(`Expected a "${key}" section`);
  return section;
}

function entriesOf(document: ComposedDocument, key: string) {
  const section = sectionNamed(document, key);
  if (section.layout !== "entries") throw new Error(`"${key}" is not an entry section`);
  return section.entries;
}

/** Every string this document would print, flattened, for fabrication checks. */
function allText(document: ComposedDocument): string[] {
  const out: string[] = [
    document.header.name ?? "",
    document.header.headline ?? "",
    ...document.header.contacts,
  ];

  for (const section of document.sections) {
    out.push(section.heading);
    if (section.layout === "prose") out.push(...section.body.lines);
    if (section.layout === "inline") out.push(...section.items);
    if (section.layout === "grouped") {
      for (const group of section.groups) out.push(group.label, ...group.items);
    }
    if (section.layout === "entries") {
      for (const entry of section.entries) {
        out.push(entry.title, entry.subtitle ?? "", entry.meta ?? "", entry.url ?? "");
        if (entry.detail) out.push(...entry.detail.lines);
      }
    }
  }

  return out.filter(Boolean);
}

/** One row in every section, so a full document can be composed cheaply. */
function fullSnapshot(): DossierSnapshot {
  return snapshot({
    identity: { ...blankIdentity, careerDirection: "Seeking research work" },
    experience: [{ ...noPeriod, type: "employment", organization: "Org", role: "Analyst", location: null, description: null }],
    education: [{ ...bareEducation, institution: "University", qualification: "BSc" }],
    projects: [{ ...noPeriod, name: "Atlas", role: null, context: null, url: null, description: null }],
    skills: [{ name: "SQL", type: "technical", notes: null }],
    credentials: [{ type: "certification", name: "PMP", issuer: null, identifier: null, url: null, issueMonth: null, issueYear: null, expiryMonth: null, expiryYear: null, description: null }],
    achievements: [{ type: "award", title: "Prize", issuer: null, month: null, year: null, description: null }],
    languages: [{ language: "French", proficiency: null, notes: null }],
    publications: [{ title: "A paper", publisher: null, month: null, year: null, url: null, description: null }],
    memberships: [{ ...noPeriod, organization: "Institute", role: null, description: null }],
    links: [{ type: "portfolio", label: "Portfolio", url: "https://example.com" }],
  });
}

describe("document families", () => {
  /**
   * The load-bearing invariant of this layer. A key missing from one family's
   * order would silently drop that section from every document of that type — the
   * user would have entered publications and simply never see them.
   */
  it("can present every section in every family, exactly once", () => {
    const expected = [...profileSectionKeys, "summary"].sort();

    for (const type of documentTypes) {
      const keys = keysOf(composeDocument(type, fullSnapshot()).sections);

      expect([...keys].sort(), `${type} must present every section`).toEqual(expected);
      expect(new Set(keys).size, `${type} must not repeat a section`).toBe(keys.length);
    }
  });

  it("orders each family around what its reader looks for first", () => {
    const rows = snapshot({
      experience: [{ ...noPeriod, type: "employment", organization: "Org", role: "Analyst", location: null, description: null }],
      education: [{ ...bareEducation, institution: "University", qualification: "BSc" }],
      skills: [{ name: "SQL", type: "technical", notes: null }],
      publications: [{ title: "A paper", publisher: null, month: null, year: null, url: null, description: null }],
    });

    expect(keysOf(composeDocument("professional_cv", rows).sections)).toEqual([
      "experience",
      "education",
      "skills",
      "publications",
    ]);
    expect(keysOf(composeDocument("professional_resume", rows).sections)).toEqual([
      "experience",
      "skills",
      "education",
      "publications",
    ]);
    expect(keysOf(composeDocument("academic_cv", rows).sections)).toEqual([
      "education",
      "publications",
      "experience",
      "skills",
    ]);
  });

  it("omits a section only because it is empty", () => {
    const document = composeDocument("professional_cv", snapshot({
      skills: [{ name: "SQL", type: "technical", notes: null }],
    }));

    expect(keysOf(document.sections)).toEqual(["skills"]);
  });

  it("composes the same document every time from the same dossier", () => {
    const first = composeDocument("professional_cv", fullSnapshot());
    const second = composeDocument("professional_cv", fullSnapshot());

    expect(second).toEqual(first);
  });
});

/**
 * Section visibility.
 *
 * The guarantee being tested is that hiding is a presentation decision and
 * nothing more: it removes a section from one document, it does not touch the
 * dossier, and it is reversible. If any of that stopped holding, a user would
 * clear a checkbox and lose career information they had entered.
 */
describe("document configuration", () => {
  const rows = () =>
    snapshot({
      experience: [{ ...noPeriod, type: "employment", organization: "Org", role: "Analyst", location: null, description: null }],
      education: [{ ...bareEducation, institution: "University", qualification: "BSc" }],
      skills: [{ name: "SQL", type: "technical", notes: null }],
    });

  it("leaves a hidden section out of the document", () => {
    const document = composeDocument("professional_cv", rows(), {
      hiddenSections: ["education"],
    });

    expect(keysOf(document.sections)).toEqual(["experience", "skills"]);
  });

  it("keeps the order of what remains", () => {
    const document = composeDocument("professional_resume", rows(), {
      hiddenSections: ["skills"],
    });

    expect(keysOf(document.sections)).toEqual(["experience", "education"]);
  });

  it("can hide every section without breaking the document", () => {
    const document = composeDocument("professional_cv", rows(), {
      hiddenSections: ["experience", "education", "skills"],
    });

    expect(document.sections).toEqual([]);
    /* The header is identity, not a section, so it survives. */
    expect(document.header).toEqual(composeDocument("professional_cv", rows()).header);
  });

  /**
   * `hiddenSections` comes out of a database column, so it can name a section
   * this build no longer has. That must be ignored rather than throw — the
   * alternative is a user who cannot open their own document after a deploy.
   */
  it("ignores a section key it does not recognise", () => {
    const document = composeDocument("professional_cv", rows(), {
      hiddenSections: ["not-a-section", "education"],
    });

    expect(keysOf(document.sections)).toEqual(["experience", "skills"]);
  });

  it("treats no configuration and empty configuration identically", () => {
    const withNothing = composeDocument("professional_cv", rows());
    const withEmpty = composeDocument("professional_cv", rows(), { hiddenSections: [] });

    expect(withEmpty).toEqual(withNothing);
  });

  it("restores a section exactly when it is un-hidden", () => {
    const before = composeDocument("professional_cv", rows());
    composeDocument("professional_cv", rows(), { hiddenSections: ["education"] });
    const after = composeDocument("professional_cv", rows());

    expect(after).toEqual(before);
  });

  /**
   * The control list has to keep offering a hidden section, or clearing a
   * checkbox would remove the only means of restoring it.
   */
  it("still offers a hidden section so it can be brought back", () => {
    const offered = composableSections("professional_cv", rows());

    expect(offered.map((section) => section.key)).toEqual([
      "experience",
      "education",
      "skills",
    ]);
    expect(offered.every((section) => section.heading.length > 0)).toBe(true);
  });

  it("does not offer a section the dossier has no content for", () => {
    const offered = composableSections("professional_cv", snapshot({
      skills: [{ name: "SQL", type: "technical", notes: null }],
    }));

    expect(offered.map((section) => section.key)).toEqual(["skills"]);
  });

  /*
   * Order is per document, and these are the properties that make it safe to store: it
   * only rearranges, it composes with hiding rather than fighting it, and a value from a
   * column written by an older build cannot break the page.
   */
  it("renders the sections in the order the user arranged", () => {
    const document = composeDocument("professional_cv", rows(), {
      sectionOrder: ["skills", "education", "experience"],
    });

    expect(keysOf(document.sections)).toEqual(["skills", "education", "experience"]);
  });

  it("changes nothing but the order", () => {
    const inCatalogueOrder = composeDocument("professional_cv", rows());
    const rearranged = composeDocument("professional_cv", rows(), {
      sectionOrder: ["skills", "education", "experience"],
    });

    expect([...rearranged.sections].sort(byKey)).toEqual(
      [...inCatalogueOrder.sections].sort(byKey),
    );
    expect(rearranged.header).toEqual(inCatalogueOrder.header);
  });

  it("keeps a hidden section's place in the order, so un-hiding restores it there", () => {
    const arrangement = ["skills", "education", "experience"];
    const withHidden = composeDocument("professional_cv", rows(), {
      hiddenSections: ["education"],
      sectionOrder: arrangement,
    });
    const restored = composeDocument("professional_cv", rows(), { sectionOrder: arrangement });

    expect(keysOf(withHidden.sections)).toEqual(["skills", "experience"]);
    expect(keysOf(restored.sections)).toEqual(arrangement);
  });

  it("ignores an unrecognised key in a stored order", () => {
    const document = composeDocument("professional_cv", rows(), {
      sectionOrder: ["not-a-section", "skills", "education", "experience"],
    });

    expect(keysOf(document.sections)).toEqual(["skills", "education", "experience"]);
  });

  it("treats an empty order as the type's own order", () => {
    const withNothing = composeDocument("professional_resume", rows());
    const withEmpty = composeDocument("professional_resume", rows(), { sectionOrder: [] });

    expect(withEmpty).toEqual(withNothing);
  });

  it("lists the arrangement control's sections in the document's order", () => {
    const offered = composableSections("professional_cv", rows(), [
      "skills",
      "experience",
      "education",
    ]);

    expect(offered.map((section) => section.key)).toEqual([
      "skills",
      "experience",
      "education",
    ]);
  });
});

function byKey(a: { key: string }, b: { key: string }) {
  return a.key.localeCompare(b.key);
}

describe("an empty dossier", () => {
  it("composes to nothing rather than to a blank page of headings", () => {
    const document = composeDocument("professional_cv", snapshot());

    expect(document.sections).toEqual([]);
    expect(document.header).toEqual({ name: null, headline: null, contacts: [] });
    expect(isComposedDocumentEmpty(document)).toBe(true);
  });

  it("is no longer empty once the person has a name", () => {
    const document = composeDocument("professional_cv", snapshot({
      identity: { ...blankIdentity, displayName: "Ada Lovelace" },
    }));

    expect(isComposedDocumentEmpty(document)).toBe(false);
  });

  it("treats whitespace as absence, not as content", () => {
    const document = composeDocument("professional_cv", snapshot({
      identity: { ...blankIdentity, displayName: "   ", careerDirection: "\n  \n" },
    }));

    expect(isComposedDocumentEmpty(document)).toBe(true);
  });
});

describe("the header", () => {
  it("assembles only what the person supplied", () => {
    const { header } = composeDocument("professional_cv", snapshot({
      identity: {
        ...blankIdentity,
        displayName: "Ada Lovelace",
        headline: "Analyst",
        contactEmail: "ada@example.com",
        city: "London",
        country: "United Kingdom",
      },
    }));

    expect(header.name).toBe("Ada Lovelace");
    expect(header.headline).toBe("Analyst");
    // No phone and no website, so neither leaves a gap in the contact line.
    expect(header.contacts).toEqual(["ada@example.com", "London, United Kingdom"]);
  });
});

describe("fabrication safeguards", () => {
  /**
   * Every optional field is null and every required field holds a marker, so
   * anything in the output that is neither a marker nor one of this application's
   * own labels is text the composition layer invented.
   */
  it("prints nothing beyond the user's values and the product's own labels", () => {
    const document = composeDocument("professional_cv", snapshot({
      experience: [{ ...noPeriod, type: "freelance", organization: "ORG", role: "ROLE", location: null, description: null }],
      education: [{ ...bareEducation, institution: "INSTITUTION" }],
      credentials: [{ type: "license", name: "NAME", issuer: null, identifier: null, url: null, issueMonth: null, issueYear: null, expiryMonth: null, expiryYear: null, description: null }],
    }));

    const permitted = new Set([
      "ORG",
      "ROLE",
      "INSTITUTION",
      "NAME",
      "Experience",
      "Education",
      "Certifications and credentials",
      "Licence",
      /*
        The arrangement qualifier is one of the product's own words, so it is permitted —
        but only the exact words the vocabulary offers. Listing them from the vocabulary
        rather than spelling them again keeps this test measuring what it claims to
        measure: text that came from neither the user nor a curated list is invented.
      */
      ...experienceTypeOptions.map((option) => option.label),
    ]);

    for (const text of allText(document)) {
      expect(permitted, `unexpected text in document: ${text}`).toContain(text);
    }
  });

  it("skips a row whose identifying field is blank instead of printing a stub", () => {
    const document = composeDocument("professional_cv", snapshot({
      experience: [
        { ...noPeriod, type: "employment", organization: "Org", role: "   ", location: null, description: null },
        { ...noPeriod, type: "employment", organization: "Org", role: "Analyst", location: null, description: null },
      ],
      links: [{ type: "portfolio", label: "Portfolio", url: "  " }],
    }));

    expect(entriesOf(document, "experience").map((entry) => entry.title)).toEqual(["Analyst"]);
    expect(keysOf(document.sections)).not.toContain("links");
  });
});

describe("entries", () => {
  it("names the qualification, and does not repeat the institution when it does", () => {
    const document = composeDocument("professional_cv", snapshot({
      education: [
        { ...bareEducation, institution: "LSE", qualification: "BSc", field: "Economics" },
        { ...bareEducation, institution: "Open University" },
      ],
    }));

    const [withQualification, withoutQualification] = entriesOf(document, "education");

    expect(withQualification?.title).toBe("BSc, Economics");
    expect(withQualification?.subtitle).toBe("LSE");
    // Nothing but the institution was supplied, so it becomes the title once.
    expect(withoutQualification?.title).toBe("Open University");
    expect(withoutQualification?.subtitle).toBeNull();
  });

  it("qualifies unusual experience types and says nothing about ordinary employment", () => {
    const document = composeDocument("professional_cv", snapshot({
      experience: [
        { ...noPeriod, startYear: 2020, endYear: 2022, type: "employment", organization: "Org", role: "Analyst", location: "Leeds", description: null },
        { ...noPeriod, startYear: 2019, endYear: 2020, type: "volunteering", organization: "Charity", role: "Coordinator", location: null, description: null },
      ],
    }));

    const [employment, volunteering] = entriesOf(document, "experience");

    expect(employment?.meta).toBe("2020 – 2022 · Leeds");
    // The qualifier is the word the picker offered, so the document says back what the
    // user chose rather than a synonym of it.
    expect(volunteering?.meta).toBe("2019 – 2020 · Volunteer");
  });

  it("labels credential dates so a bare year is never ambiguous", () => {
    const document = composeDocument("professional_cv", snapshot({
      credentials: [{
        type: "certification",
        name: "PMP",
        issuer: "PMI",
        identifier: "1234",
        url: "https://example.com/verify",
        issueMonth: 3,
        issueYear: 2021,
        expiryMonth: null,
        expiryYear: 2027,
        description: null,
      }],
    }));

    const [credential] = entriesOf(document, "credentials");

    expect(credential?.subtitle).toBe("PMI");
    expect(credential?.meta).toBe("Certification · Issued Mar 2021 · Expires 2027 · ID 1234");
    expect(credential?.url).toBe("https://example.com/verify");
  });

  it("does not label a link the user did not categorise", () => {
    const document = composeDocument("professional_cv", snapshot({
      links: [
        { type: "portfolio", label: "Portfolio", url: "https://example.com/work" },
        { type: "other", label: "Personal site", url: "https://example.com" },
      ],
    }));

    const [portfolio, other] = entriesOf(document, "links");

    expect(portfolio?.meta).toBe("Portfolio");
    expect(other?.meta).toBeNull();
  });
});

describe("the user's own description text", () => {
  function detailFor(description: string) {
    const document = composeDocument("professional_cv", snapshot({
      projects: [{ ...noPeriod, name: "Atlas", role: null, context: null, url: null, description }],
    }));
    return entriesOf(document, "projects")[0]?.detail ?? null;
  }

  it("keeps prose as paragraphs, one per line written", () => {
    expect(detailFor("First thought.\nSecond thought.")).toEqual({
      kind: "paragraphs",
      lines: ["First thought.", "Second thought."],
    });
  });

  it("draws bullets when the user typed bullets, and removes the markers", () => {
    expect(detailFor("- Shipped the thing\n* Measured the thing")).toEqual({
      kind: "bullets",
      lines: ["Shipped the thing", "Measured the thing"],
    });
  });

  it("does not guess at mixed content", () => {
    expect(detailFor("Context for the work\n- One outcome")).toEqual({
      kind: "paragraphs",
      lines: ["Context for the work", "- One outcome"],
    });
  });

  it("never mistakes a hyphen inside a word for a bullet", () => {
    expect(detailFor("e-commerce platform work")).toEqual({
      kind: "paragraphs",
      lines: ["e-commerce platform work"],
    });
  });

  it("has nothing to show for blank text", () => {
    expect(detailFor("   \n\n  ")).toBeNull();
  });
});

describe("skills", () => {
  it("groups by type in the order the product defines, keeping the user's notes", () => {
    const section = sectionNamed(
      composeDocument("professional_cv", snapshot({
        skills: [
          { name: "Mentoring", type: "soft", notes: null },
          { name: "SQL", type: "technical", notes: "five years" },
          { name: "Welding", type: "trade", notes: null },
        ],
      })),
      "skills",
    );

    if (section.layout !== "grouped") throw new Error("skills should be grouped");
    expect(section.groups).toEqual([
      { label: "Technical", items: ["SQL (five years)"] },
      { label: "Interpersonal", items: ["Mentoring"] },
      { label: "Trade or practical", items: ["Welding"] },
    ]);
  });

  it("shows a skill whose type it does not recognise rather than dropping it", () => {
    const section = sectionNamed(
      composeDocument("professional_cv", snapshot({
        // A stored value from a future migration, or one this build predates.
        skills: [{ name: "Surveying", type: "geospatial" as never, notes: null }],
      })),
      "skills",
    );

    if (section.layout !== "grouped") throw new Error("skills should be grouped");
    expect(section.groups).toEqual([{ label: "geospatial", items: ["Surveying"] }]);
  });
});

describe("languages", () => {
  it("keeps proficiency alongside the language", () => {
    const section = sectionNamed(
      composeDocument("professional_cv", snapshot({
        languages: [
          { language: "French", proficiency: "Professional", notes: null },
          { language: "Yoruba", proficiency: null, notes: null },
        ],
      })),
      "languages",
    );

    if (section.layout !== "inline") throw new Error("languages should be inline");
    expect(section.items).toEqual(["French (Professional)", "Yoruba"]);
  });
});

describe("formatPeriod", () => {
  it("states a range", () => {
    expect(formatPeriod({ startMonth: 1, startYear: 2020, endMonth: 6, endYear: 2022, current: false }))
      .toBe("Jan 2020 – Jun 2022");
  });

  it("collapses a range that begins and ends in the same month", () => {
    expect(formatPeriod({ startMonth: 4, startYear: 2021, endMonth: 4, endYear: 2021, current: false }))
      .toBe("Apr 2021");
  });

  it("says Present for ongoing work", () => {
    expect(formatPeriod({ ...noPeriod, startYear: 2023, current: true })).toBe("2023 – Present");
  });

  /**
   * "Present" alone reads as a broken date rather than as information, and a start
   * date cannot be invented to complete it.
   */
  it("says nothing when ongoing work has no start date", () => {
    expect(formatPeriod({ ...noPeriod, current: true })).toBeNull();
  });

  it("states whichever single end of the range exists", () => {
    expect(formatPeriod({ ...noPeriod, startYear: 2020 })).toBe("2020");
    expect(formatPeriod({ ...noPeriod, endYear: 2020 })).toBe("2020");
    expect(formatPeriod(noPeriod)).toBeNull();
  });
});

describe("formatMonthYear", () => {
  it("prints a year alone, as career documents do", () => {
    expect(formatMonthYear(null, 2024)).toBe("2024");
  });

  /** A month without a year is not a date this can assert. */
  it("drops a month with no year", () => {
    expect(formatMonthYear(7, null)).toBeNull();
  });

  it("ignores an out-of-range month rather than printing a wrong one", () => {
    expect(formatMonthYear(0, 2024)).toBe("2024");
    expect(formatMonthYear(13, 2024)).toBe("2024");
  });
});

describe("structured composition boundary", () => {
  const content = () => ({
    header: {
      name: "Ada Lovelace",
      headline: "Analyst",
      contacts: ["ada@example.com"],
    },
    sections: {
      summary: {
        key: "summary" as const,
        heading: "Summary",
        layout: "prose" as const,
        body: { kind: "paragraphs" as const, lines: ["Resolved summary"] },
      },
      experience: {
        key: "experience" as const,
        heading: "Experience",
        layout: "entries" as const,
        entries: [{
          title: "Analyst",
          subtitle: "Company",
          meta: "2024",
          detail: null,
          url: null,
        }],
      },
    },
  });

  const input = () => ({
    documentType: "professional_cv" as const,
    specification: {
      documentType: "professional_cv" as const,
      purpose: "A targeted professional document",
      constraints: { pageBudget: 2 },
    },
    selectedEvidence: [{
      evidenceId: "evidence-1",
      sourceType: "experience",
      sourceRecordId: "experience-1",
    }],
    content: content(),
  });

  it("composes supplied structured content without interpreting Evidence", () => {
    const result = composeStructuredDocument(input());

    expect(result.type).toBe("professional_cv");
    expect(result.header.name).toBe("Ada Lovelace");
    expect(result.sections.map((section) => section.key)).toEqual(["summary", "experience"]);
    expect(result.sections).toContainEqual(content().sections.summary);
  });

  it("applies ordering and visibility as document configuration", () => {
    const result = composeStructuredDocument({
      ...input(),
      configuration: {
        sectionOrder: ["experience", "summary"],
        hiddenSections: ["summary"],
      },
    });

    expect(result.sections.map((section) => section.key)).toEqual(["experience"]);
  });

  it("rejects a specification for a different document type", () => {
    expect(() => composeStructuredDocument({
      ...input(),
      specification: { ...input().specification, documentType: "academic_cv" },
    })).toThrow("Document Specification type must match");
  });

  it("rejects blank specification purposes and unstable Evidence identifiers", () => {
    expect(() => composeStructuredDocument({
      ...input(),
      specification: { ...input().specification, purpose: "  " },
    })).toThrow("purpose must not be blank");

    expect(() => composeStructuredDocument({
      ...input(),
      selectedEvidence: [{ ...input().selectedEvidence[0], sourceRecordId: " " }],
    })).toThrow("Selected Evidence must have stable identifiers");
  });

  it("does not mutate supplied content, specification, or Evidence", () => {
    const value = input();
    const before = structuredClone(value);

    composeStructuredDocument(value);

    expect(value).toEqual(before);
  });

  it("keeps the legacy Dossier adapter equivalent to its structured result", () => {
    const dossier = fullSnapshot();
    const legacy = composeDocument("professional_cv", dossier, { hiddenSections: ["links"] });
    const direct = composeStructuredDocument({
      documentType: "professional_cv",
      specification: { documentType: "professional_cv", purpose: "Legacy Dossier document" },
      selectedEvidence: [],
      content: {
        header: legacy.header,
        sections: Object.fromEntries(legacy.sections.map((section) => [section.key, section])),
      },
      configuration: { hiddenSections: ["links"] },
    });

    expect(direct).toEqual(legacy);
  });
});
