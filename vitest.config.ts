import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Integration tests share one real Neon dev-branch database (per
    // code-standards.md) rather than an isolated per-file instance, so
    // running test files in parallel makes cross-file row counts (e.g.
    // sequential SKU numbering) race against each other. Sequential is the
    // correct default for this suite's size, not a workaround.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
