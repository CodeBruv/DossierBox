import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  credentialSchema,
  educationSchema,
  experienceSchema,
  formStateFromError,
  isHttpUrl,
  profileBasicsSchema,
  profileLinkSchema,
} from "./validation";

describe("profile validation", () => {
  it("does not require a degree or qualification for education", () => {
    const result = educationSchema.safeParse({
      institution: "Community learning centre",
      qualification: "",
      field: "",
      location: "",
      description: "Practical evening classes.",
      startMonth: null,
      startYear: 2022,
      endMonth: null,
      endYear: 2023,
      current: false,
    });

    expect(result.success).toBe(true);
  });

  it("accepts trade and vocational credentials", () => {
    for (const type of ["trade", "vocational"] as const) {
      const result = credentialSchema.safeParse({
        type,
        name: "Workplace safety credential",
        issuer: "Industry training body",
        identifier: "",
        url: "",
        issueMonth: null,
        issueYear: 2024,
        expiryMonth: null,
        expiryYear: null,
        description: "",
      });

      expect(result.success).toBe(true);
    }
  });

  it("rejects reversed experience dates", () => {
    const result = experienceSchema.safeParse({
      type: "employment",
      organization: "Example organization",
      role: "Coordinator",
      location: "",
      description: "",
      startMonth: 6,
      startYear: 2024,
      endMonth: 5,
      endYear: 2024,
      current: false,
    });

    expect(result.success).toBe(false);
    expect(z.flattenError(result.error!).fieldErrors.endYear).toContain(
      "End date cannot be earlier than start date.",
    );
  });

  it("rejects end dates on current experience", () => {
    const result = experienceSchema.safeParse({
      type: "freelance",
      organization: "Independent clients",
      role: "Consultant",
      location: "",
      description: "",
      startMonth: null,
      startYear: 2023,
      endMonth: null,
      endYear: 2024,
      current: true,
    });

    expect(result.success).toBe(false);
  });

  /*
    The end-date-on-a-current-entry error used to be pinned to endYear whatever
    the user had typed, so entering only an end month put the message under an
    empty field.
  */
  it("reports a conflicting end date on the field the user filled in", () => {
    const base = {
      type: "employment" as const,
      organization: "Example organization",
      role: "Coordinator",
      location: "",
      description: "",
      startMonth: null,
      startYear: 2023,
      current: true,
    };

    const monthOnly = experienceSchema.safeParse({ ...base, endMonth: 4, endYear: null });
    expect(monthOnly.success).toBe(false);
    const monthErrors = z.flattenError(monthOnly.error!).fieldErrors;
    expect(monthErrors.endMonth?.[0]).toContain("marked as current");
    expect(monthErrors.endYear).toBeUndefined();

    const withYear = experienceSchema.safeParse({ ...base, endMonth: null, endYear: 2024 });
    expect(withYear.success).toBe(false);
    expect(z.flattenError(withYear.error!).fieldErrors.endYear?.[0]).toContain(
      "marked as current",
    );
  });

  it("requires a year when a month is supplied", () => {
    const result = experienceSchema.safeParse({
      type: "internship",
      organization: "Example organization",
      role: "Trainee",
      location: "",
      description: "",
      startMonth: 3,
      startYear: null,
      endMonth: null,
      endYear: null,
      current: false,
    });

    expect(result.success).toBe(false);
    expect(z.flattenError(result.error!).fieldErrors.startYear?.[0]).toContain(
      "Add a start year",
    );
  });

  it("accepts only HTTP and HTTPS profile links", () => {
    expect(isHttpUrl("https://example.com/profile")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
  });

  /*
    Nobody types a scheme. A bare host is completed rather than rejected — this
    reformats what was supplied and never guesses an address.
  */
  it("completes a bare host into an https address", () => {
    for (const [input, expected] of [
      ["www.example.com", "https://www.example.com"],
      ["example.com", "https://example.com"],
      ["linkedin.com/in/some-name", "https://linkedin.com/in/some-name"],
      ["https://example.com/page", "https://example.com/page"],
      ["HTTPS://Example.com/Page", "https://Example.com/Page"],
    ] as const) {
      const result = profileBasicsSchema.safeParse({
        displayName: "",
        contactEmail: "",
        phone: "",
        country: "",
        region: "",
        city: "",
        website: input,
        headline: "",
        careerDirection: "",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.website).toBe(expected);
      }
    }
  });

  it("rejects addresses that are not public web addresses", () => {
    for (const input of ["javascript:alert(1)", "mailto:someone@example.com", "not a web address", "localhost"]) {
      const result = profileLinkSchema.safeParse({ type: "portfolio", label: "Portfolio", url: input });
      expect(result.success).toBe(false);
      expect(z.flattenError(result.error!).fieldErrors.url?.[0]).toContain(
        "Enter a web address such as",
      );
    }
  });

  /* Messages are shown to a person, so none of them may name a runtime type. */
  it("never surfaces Zod's internal wording", () => {
    const result = experienceSchema.safeParse({
      type: "",
      organization: "x".repeat(200),
      role: "Coordinator",
      location: "",
      description: "",
      startMonth: Number("abc"),
      startYear: 1200,
      endMonth: 13,
      endYear: null,
      current: false,
    });

    expect(result.success).toBe(false);
    const messages = Object.values(z.flattenError(result.error!).fieldErrors).flat();
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/NaN|expected|Too big|Too small|Invalid input|Invalid option/);
    }
  });

  it("keeps career direction factual and optional", () => {
    const result = profileBasicsSchema.safeParse({
      displayName: "",
      contactEmail: "",
      phone: "",
      country: "",
      region: "",
      city: "",
      website: "",
      headline: "",
      careerDirection: "Interested in moving into public health operations.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.careerDirection).toBe(
        "Interested in moving into public health operations.",
      );
    }
  });

  /*
    A failed submission must give the user back everything they typed, including
    repeated fields — the section checkboxes previously appeared to forget the
    selection on error.
  */
  it("echoes submitted values, including repeated fields, back to the form", () => {
    const formData = new FormData();
    formData.append("organization", "Example organization");
    formData.append("sections", "experience");
    formData.append("sections", "education");

    const failure = experienceSchema.safeParse({
      type: "employment",
      organization: "Example organization",
      role: "",
      location: "",
      description: "",
      startMonth: null,
      startYear: null,
      endMonth: null,
      endYear: null,
      current: false,
    });

    expect(failure.success).toBe(false);
    const state = formStateFromError(failure.error!, formData);

    expect(state.status).toBe("error");
    expect(state.values?.organization).toBe("Example organization");
    expect(state.multipleValues?.sections).toEqual(["experience", "education"]);
    expect(state.fieldErrors?.role).toContain("Role or position is required.");
  });
});
