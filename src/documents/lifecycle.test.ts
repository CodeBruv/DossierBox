import { describe, expect, it } from "vitest";
import { compileStructuredDocumentContent } from "./content-compiler";

const specification = { documentType: "professional_resume" as const, purpose: "A focused engineering application" };
const artifact = {
  header: { name: "Ada Lovelace", headline: "Engineer", contacts: [] },
  sections: {
    summary: { key: "summary", heading: "Summary", layout: "prose", body: { kind: "paragraphs", lines: ["Generated result"] } },
    experience: { key: "experience", heading: "Experience", layout: "entries", entries: [{ title: "Engineer", subtitle: "DossierBox", meta: null, detail: { kind: "paragraphs", lines: ["Generated result"] }, url: null }] },
    education: { key: "education", heading: "Education", layout: "entries", entries: [{ title: "BSc", subtitle: "University", meta: null, detail: null, url: null }] },
  },
};

describe("generated document lifecycle", () => {
  it("rejects an incomplete generated artifact rather than presenting a fabricated result", () => {
    const compiled = compileStructuredDocumentContent({ documentType: "professional_resume", specification, selectedEvidence: [], content: artifact });
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
