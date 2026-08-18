import { describe, expect, it } from "vitest";
import { absoluteUrl, localeAlternates, siteOrigin } from "@/src/lib/site";

describe("site URL helpers", () => {
  it("strips a trailing slash from the configured origin", () => {
    expect(siteOrigin()).not.toMatch(/\/$/);
  });

  it("builds a locale-prefixed absolute URL", () => {
    expect(absoluteUrl("ar")).toBe(`${siteOrigin()}/ar`);
    expect(absoluteUrl("fr", "/catalog")).toBe(`${siteOrigin()}/fr/catalog`);
  });

  it("builds an alternate-language map covering every routing locale", () => {
    const alternates = localeAlternates("/boxes/test-bundle");
    expect(alternates.ar).toBe(`${siteOrigin()}/ar/boxes/test-bundle`);
    expect(alternates.fr).toBe(`${siteOrigin()}/fr/boxes/test-bundle`);
  });
});
