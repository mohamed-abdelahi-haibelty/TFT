import { describe, expect, it } from "vitest";
import { localized } from "@/src/lib/locale-text";

describe("localized", () => {
  it("picks Arabic copy for the ar locale", () => {
    expect(localized("ar", "مرحبا", "Bonjour")).toBe("مرحبا");
  });

  it("falls back to French for any other locale", () => {
    expect(localized("fr", "مرحبا", "Bonjour")).toBe("Bonjour");
    expect(localized("en", "مرحبا", "Bonjour")).toBe("Bonjour");
  });
});
