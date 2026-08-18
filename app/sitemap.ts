import type { MetadataRoute } from "next";
import { routing } from "@/src/i18n/routing";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { getSitemapCatalog } from "@/src/services/storefront";

/**
 * Every entry is one locale × path pair with `alternates.languages` cross-
 * referencing its sibling locale, so each localized URL is independently
 * indexable (next-intl always prefixes both `ar` and `fr` — neither is a
 * bare, unprefixed default). Product/bundle/category paths anticipate the
 * routes tasks 09/10 add (`/catalog`, `/product/[slug]`, `/boxes/[slug]`) —
 * expected per task 08's own scope, not a bug if they 404 until those ship.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getSitemapCatalog();

  const paths = [
    "/",
    "/catalog",
    "/boxes",
    ...catalog.categories.map((category) => `/catalog/${category.slug}`),
    ...catalog.products.map((product) => `/product/${product.slug}`),
    ...catalog.bundles.map((bundle) => `/boxes/${bundle.slug}`),
  ];

  return routing.locales.flatMap((locale) =>
    paths.map((path) => ({
      url: absoluteUrl(locale, path),
      alternates: { languages: localeAlternates(path) },
    })),
  );
}
