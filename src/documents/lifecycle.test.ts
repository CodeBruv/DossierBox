import { describe, expect, it } from "vitest";
import { compileStructuredDocumentContent } from "./content-compiler";
import { composeAcceptedVersionThumbnail } from "./read-composition";

const specification = { documentType: "professional_resume" as const, purpose: "A focused engineering application" };
const artifact = {
  header: { name: "Ada Lovelace", headline: "Engineer", contacts: [] },
  sections: {
    summary: { key: "summary", heading: "Summary", layout: "prose", body: { kind: "paragraphs", lines: ["Generated result"] } },
    experience: { key: "experience", heading: "Experience", layout: "entries", entries: [{ title: "Engineer", subtitle: "DossierBox", meta: null, detail: { kind: "paragraphs", lines: ["Generated result"] }, url: null }] },
    skills: { key: "skills", heading: "Skills", layout: "grouped", groups: [{ label: "Technical", items: ["TypeScript"] }] },
    education: { key: "education", heading: "Education", layout: "entries", entries: [{ title: "BSc", subtitle: "University", meta: null, detail: null, url: null }] },
  },
};

describe("generated document lifecycle", () => {
  it("rejects an incomplete generated artifact rather than presenting a fabricated result", () => {
    const compiled = compileStructuredDocumentContent({ documentType: "professional_resume", specification, selectedEvidence: [], content: { ...artifact, sections: { summary: artifact.sections.summary } } });
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.issues.some((issue) => issue.kind === "missing_content")).toBe(true);
  });

  it("does not make a generated result exportable without an immutable version", () => {
    const generated = { artifact, accepted: false };
    expect(generated.accepted).toBe(false);
    expect("documentVersionId" in generated).toBe(false);
  });
});

describe("accepted document listing thumbnails", () => {
  const version = {
    specification,
    selectedEvidence: [],
    content: artifact,
    provenance: {},
    configuration: {
      presentationStyle: "compact",
      hiddenSections: [],
      sectionOrder: [],
      presentationContractVersion: "presentation-v1",
    },
  };

  it("renders the persisted accepted content instead of an empty card shell", () => {
    const thumbnail = composeAcceptedVersionThumbnail("professional_resume", version);

    expect(thumbnail).not.toBeNull();
    expect(thumbnail?.composed.header.name).toBe("Ada Lovelace");
    expect(thumbnail?.composed.sections.length).toBeGreaterThan(0);
    expect(thumbnail?.presentationStyle.id).toBe("compact");
  });

  it("fails closed when an accepted snapshot has no renderable content", () => {
    const thumbnail = composeAcceptedVersionThumbnail("professional_resume", {
      ...version,
      content: { header: version.content.header, sections: {} },
    });

    expect(thumbnail).toBeNull();
  });
});
