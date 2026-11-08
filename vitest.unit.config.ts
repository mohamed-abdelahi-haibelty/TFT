import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/lib/**/*.test.ts"],
    setupFiles: ["./tests/setup-unit.ts"],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
