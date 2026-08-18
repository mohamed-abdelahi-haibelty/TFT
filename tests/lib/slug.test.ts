import { describe, expect, it } from "vitest";
import { slugify } from "@/src/lib/slug";

describe("slugify", () => {
  it("strips accents and lowercases", () => {
    expect(slugify("Boîte de rentrée scolaire")).toBe("boite-de-rentree-scolaire");
  });

  it("collapses non-alphanumeric runs into single hyphens", () => {
    expect(slugify("Crayon à papier N°2  —  HB")).toBe("crayon-a-papier-n-2-hb");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Cahier--  ")).toBe("cahier");
  });
});
