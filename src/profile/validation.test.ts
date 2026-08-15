import { describe, expect, it } from "vitest";
import {
  credentialSchema,
  educationSchema,
  experienceSchema,
  isHttpUrl,
  profileBasicsSchema,
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
    expect(result.error?.flatten().fieldErrors.endYear).toContain(
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
    expect(result.error?.flatten().fieldErrors.startYear).toContain(
      "Add a year when you provide a month.",
    );
  });

  it("accepts only HTTP and HTTPS profile links", () => {
    expect(isHttpUrl("https://example.com/profile")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
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
});
