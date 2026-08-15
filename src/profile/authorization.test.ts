import { describe, expect, it } from "vitest";
import { isOwnedByUser } from "./ownership";

describe("profile ownership", () => {
  it("allows the authenticated owner", () => {
    expect(isOwnedByUser("user-a", "user-a")).toBe(true);
  });

  it("blocks a different user", () => {
    expect(isOwnedByUser("user-a", "user-b")).toBe(false);
  });
});
