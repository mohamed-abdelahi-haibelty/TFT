import { describe, expect, it } from "vitest";
import { assertSafeSeedTarget } from "@/src/lib/seed-safety";

describe("destructive seed protection", () => {
  it.each(["NODE_ENV", "VERCEL_ENV", "APP_ENV"])("rejects production through %s even with opt-in", (key) => {
    expect(() => assertSafeSeedTarget({ [key]: "production", ALLOW_DESTRUCTIVE_SEED: "true" })).toThrow(/production/);
  });
  it("requires explicit opt-in for a disposable target", () => {
    expect(() => assertSafeSeedTarget({})).toThrow(/ALLOW_DESTRUCTIVE_SEED/);
    expect(() => assertSafeSeedTarget({ ALLOW_DESTRUCTIVE_SEED: "true" })).not.toThrow();
  });
});
