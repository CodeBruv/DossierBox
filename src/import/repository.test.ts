import { describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({
  transaction: vi.fn(async (callback: (executor: object) => Promise<unknown>) =>
    callback({}),
  ),
}));

vi.mock("@/auth/database", () => ({
  db: { transaction },
}));

const { commitOwnedDocumentImport } = await import("./repository");

/*
 * The database-backed reconciliation tests live with the profile repository. This focused test
 * protects the transaction coordinator's all-or-nothing contract without requiring credentials
 * for the integration database: the coordinator must not return after a dossier callback fails.
 */
describe("confirmed document import transaction boundary", () => {
  it("does not treat a failed dossier commit as a successful import", async () => {
    const dossierFailure = new Error("simulated dossier write failure");
    const commitDossier = vi.fn(async () => {
      throw dossierFailure;
    });

    await expect(
      commitOwnedDocumentImport("user-1", "import-1", commitDossier),
    ).rejects.toBe(dossierFailure);
    expect(commitDossier).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
  });
});
