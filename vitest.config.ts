import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
  resolve: {
    alias: [
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
