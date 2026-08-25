import { describe, expect, it } from "vitest";
import { containsTerm, escapeLikeTerm } from "@/src/lib/search";

describe("escapeLikeTerm", () => {
  it("neutralises the LIKE wildcards so a search means what was typed", () => {
    expect(escapeLikeTerm("50%")).toBe("50\\%");
    expect(escapeLikeTerm("a_b")).toBe("a\\_b");
  });

  it("escapes the escape character first, so a literal backslash survives", () => {
    expect(escapeLikeTerm("a\\b")).toBe("a\\\\b");
    expect(escapeLikeTerm("\\%")).toBe("\\\\\\%");
  });

  it("leaves ordinary text alone, in either script", () => {
    expect(escapeLikeTerm("Cahier Seyès")).toBe("Cahier Seyès");
    expect(escapeLikeTerm("كراس")).toBe("كراس");
  });
});

describe("containsTerm", () => {
  it("wraps a trimmed, escaped term for ilike", () => {
    expect(containsTerm("  seyès ")).toBe("%seyès%");
    expect(containsTerm("100%")).toBe("%100\\%%");
  });

  it("treats blank input as no filter at all", () => {
    expect(containsTerm(undefined)).toBeNull();
    expect(containsTerm(null)).toBeNull();
    expect(containsTerm("")).toBeNull();
    expect(containsTerm("   ")).toBeNull();
  });
});
