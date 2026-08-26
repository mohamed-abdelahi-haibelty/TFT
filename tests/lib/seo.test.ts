import { describe, expect, it, vi } from "vitest";

// `buildPageMetadata` reads `common.appName`, which normally resolves through
// a next-intl request scope that does not exist outside a Next render. The
// name is the only thing it needs, so stub the lookup rather than boot a
// render just to assert tag shapes.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => (key === "appName" ? "TFT" : key),
}));

const { buildPageMetadata, NOINDEX } = await import("@/src/lib/seo");
const { siteOrigin } = await import("@/src/lib/site");

describe("buildPageMetadata", () => {
  it("canonicalizes to the locale-prefixed path and cross-links every locale", async () => {
    const meta = await buildPageMetadata({ locale: "fr", path: "/catalog", title: "Catalogue" });
    expect(meta.alternates?.canonical).toBe(`${siteOrigin()}/fr/catalog`);
    expect(meta.alternates?.languages).toEqual({
      ar: `${siteOrigin()}/ar/catalog`,
      fr: `${siteOrigin()}/fr/catalog`,
      "x-default": `${siteOrigin()}/ar/catalog`,
    });
  });

  it("defaults to the home path", async () => {
    const meta = await buildPageMetadata({ locale: "ar", title: "TFT" });
    expect(meta.alternates?.canonical).toBe(`${siteOrigin()}/ar`);
  });

  it("emits an OpenGraph locale in language_TERRITORY form, not a bare tag", async () => {
    const meta = await buildPageMetadata({ locale: "ar", title: "TFT" });
    expect(meta.openGraph).toMatchObject({ locale: "ar_MR", alternateLocale: ["fr_FR"], siteName: "TFT" });
  });

  it("always ships a Twitter card", async () => {
    const meta = await buildPageMetadata({ locale: "fr", title: "T", description: "D" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "T", description: "D" });
  });

  it("leaves images unset so the route's opengraph-image file fills in", async () => {
    const meta = await buildPageMetadata({ locale: "fr", title: "T" });
    expect(meta.openGraph && "images" in meta.openGraph).toBe(false);
    expect(meta.twitter && "images" in meta.twitter).toBe(false);
  });

  it("carries an explicit image through to both cards", async () => {
    const meta = await buildPageMetadata({ locale: "fr", title: "T", images: ["https://img/1.png"] });
    expect(meta.openGraph).toMatchObject({ images: ["https://img/1.png"] });
    expect(meta.twitter).toMatchObject({ images: ["https://img/1.png"] });
  });

  it("merges `extra` over the result, which is how a page adds robots or og product tags", async () => {
    const meta = await buildPageMetadata({ locale: "fr", title: "T", extra: NOINDEX });
    expect(meta.robots).toEqual({ index: false, follow: false });
    // …without losing the canonical it was built with.
    expect(meta.alternates?.canonical).toBe(`${siteOrigin()}/fr`);
  });
});
