import { describe, expect, it } from "vitest";
import { absoluteUrl, localeAlternates, resolveSiteOrigin, siteOrigin } from "@/src/lib/site";

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

  it("points x-default at the default locale", () => {
    expect(localeAlternates("/catalog")["x-default"]).toBe(`${siteOrigin()}/ar/catalog`);
  });
});

describe("resolveSiteOrigin", () => {
  it("prefers an explicitly configured site URL", () => {
    expect(resolveSiteOrigin("https://tft.mr", "papeterie.vercel.app")).toBe("https://tft.mr");
  });

  it("falls back to the Vercel production alias when no site URL is set", () => {
    expect(resolveSiteOrigin(undefined, "papeterie.vercel.app")).toBe("https://papeterie.vercel.app");
  });

  it("falls back to localhost when neither is set", () => {
    expect(resolveSiteOrigin(undefined, undefined)).toBe("http://localhost:3000");
  });

  it("strips a trailing slash whichever source wins", () => {
    expect(resolveSiteOrigin("https://tft.mr/")).toBe("https://tft.mr");
  });

  // An empty string reaching here means the var was present but blank, which
  // is "unset" as far as a canonical URL is concerned — not an origin of "".
  it("treats a blank site URL as unset", () => {
    expect(resolveSiteOrigin("", "papeterie.vercel.app")).toBe("https://papeterie.vercel.app");
  });
});
