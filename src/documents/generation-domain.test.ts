import { describe, expect, it } from "vitest";
import {
  assertAppendOnlyUpdate,
  assertAttemptTransition,
  canTransitionAttempt,
  fingerprintGenerationRequest,
  fingerprintJson,
} from "./generation-domain";

describe("Generation persistence invariants", () => {
  it("allows only forward transitions and never reopens terminal attempts", () => {
    expect(canTransitionAttempt("created", "reserved")).toBe(true);
    expect(canTransitionAttempt("reserved", "running")).toBe(true);
    expect(canTransitionAttempt("running", "succeeded")).toBe(true);
    expect(canTransitionAttempt("succeeded", "running")).toBe(false);
    expect(canTransitionAttempt("failed", "reserved")).toBe(false);
    expect(() => assertAttemptTransition("cancelled", "running")).toThrow();
  });

  it("hashes canonical generation identity and bounded JSON deterministically", () => {
    const input = {
      userId: "user_1",
      applicationId: "application_1",
      specificationId: "spec_1",
      specificationRevision: 3,
      specificationFingerprint: fingerprintJson({ revision: 3 }),
      evidenceFingerprint: fingerprintJson(["evidence_1"]),
      requestedWorkloads: ["resume_tailoring"] as const,
    };
    expect(fingerprintGenerationRequest(input)).toBe(fingerprintGenerationRequest({ ...input }));
    expect(fingerprintGenerationRequest(input)).not.toBe(fingerprintGenerationRequest({ ...input, specificationRevision: 4 }));
  });

  it("rejects mutation of immutable history fields", () => {
    const original = { attemptId: "attempt_1", units: 5, status: "passed" };
    expect(() => assertAppendOnlyUpdate(original, { ...original, status: "failed" }, ["attemptId", "units"])).not.toThrow();
    expect(() => assertAppendOnlyUpdate(original, { ...original, units: 4 }, ["attemptId", "units"])).toThrow();
  });
});
