import { describe, expect, it } from "vitest";
import { composeStructuredDocument } from "./composition";
import { acceptanceConfigurationFingerprint } from "./acceptance";

 describe("Generated Content acceptance", () => {
  it("fingerprints configuration deterministically", () => {
    expect(acceptanceConfigurationFingerprint({ sectionOrder: ["summary", "experience"] }))
      .toBe(acceptanceConfigurationFingerprint({ sectionOrder: ["summary", "experience"] }));
    expect(acceptanceConfigurationFingerprint({ sectionOrder: ["experience", "summary"] }))
      .not.toBe(acceptanceConfigurationFingerprint({ sectionOrder: ["summary", "experience"] }));
  });

  it("keeps accepted structured content composition-ready without provider work", () => {
    const content = {
      header: { name: "Ada Lovelace", headline: "Engineer", contacts: [] as string[] },
      sections: {},
    };
    expect(composeStructuredDocument({
      documentType: "professional_resume",
      specification: { documentType: "professional_resume", purpose: "An engineering role" },
      selectedEvidence: [],
      content,
    })).toMatchObject({ type: "professional_resume", header: content.header, sections: [] });
  });
});
