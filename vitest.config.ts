import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
  resolve: {
    alias: [
      /**
       * `server-only` is not installed as a top-level package — it ships inside
       * Next, where its `exports` map deliberately resolves to a throwing module
       * outside a `react-server` environment. Vitest therefore cannot resolve the
       * bare specifier, and every test touching one of the ten modules that
       * import it failed on that import instead of on the code under test.
       *
       * Anchored so it matches the specifier exactly and cannot swallow a package
       * that merely starts with the same characters. See the stub for why this
       * does not weaken the production boundary.
       */
      {
        find: /^server-only$/,
        replacement: resolve(__dirname, "test/stubs/server-only.ts"),
      },
      {
        find: "@/auth",
        replacement: resolve(__dirname, "src/auth"),
      },
      {
        find: "@/profile",
        replacement: resolve(__dirname, "src/profile"),
      },
      {
        find: "@/documents",
        replacement: resolve(__dirname, "src/documents"),
      },
      {
        find: "@/entitlements",
        replacement: resolve(__dirname, "src/entitlements"),
      },
      {
        find: "@/applications",
        replacement: resolve(__dirname, "src/applications"),
      },
      {
        find: "@/writing",
        replacement: resolve(__dirname, "src/writing"),
      },
      {
        find: "@/import",
        replacement: resolve(__dirname, "src/import"),
      },
      {
        find: "@/ui",
        replacement: resolve(__dirname, "src/ui"),
      },
      {
        find: "@/lib",
        replacement: resolve(__dirname, "src/lib"),
      },
      {
        find: "@/config",
        replacement: resolve(__dirname, "src/config"),
      },
      {
        find: "@",
        replacement: resolve(__dirname, "."),
      },
    ],
  },
});
