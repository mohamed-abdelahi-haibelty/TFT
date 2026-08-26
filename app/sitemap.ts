import type { MetadataRoute } from "next";
import { routing } from "@/src/i18n/routing";
import { absoluteUrl, localeAlternates } from "@/src/lib/site";
import { getSitemapCatalog, type SitemapEntry } from "@/src/services/storefront";

/**
 * Every entry is one locale × path pair with `alternates.languages` cross-
 * referencing its sibling locale and `x-default`, so each localized URL is
 * independently indexable (next-intl always prefixes both `ar` and `fr` —
 * neither is a bare, unprefixed default).
 *
 * `lastModified` is the only optional field emitted. `changefreq` and
 * `priority` are deliberately absent: Google has said it ignores both, and
 * shipping fields nobody reads makes the file look maintained when it is not.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getSitemapCatalog();

  const productsChangedAt = latest(catalog.products);
  const bundlesChangedAt = latest(catalog.bundles);

  const paths: { path: string; lastModified?: Date }[] = [
    // The home page surfaces featured products and boxes, so anything moving
    // in either changes it.
    { path: "/", lastModified: latest([...catalog.products, ...catalog.bundles]) },
    { path: "/catalog", lastModified: productsChangedAt },
    { path: "/boxes", lastModified: bundlesChangedAt },
    ...catalog.categories.map((category) => ({
      path: `/catalog/${category.slug}`,
      // A category page is a list of its products: the category row itself is
      // near-immutable, so dating the page by it would tell a crawler nothing
      // ever changes there. Falls back to the row when the category is empty.
      lastModified: latest(
        catalog.products.filter((product) => product.categorySlug === category.slug),
        category.updatedAt,
      ),
    })),
    ...catalog.products.map((product) => ({
      path: `/product/${product.slug}`,
      lastModified: product.updatedAt,
    })),
    ...catalog.bundles.map((bundle) => ({
      path: `/boxes/${bundle.slug}`,
      lastModified: bundle.updatedAt,
    })),
  ];

  return routing.locales.flatMap((locale) =>
    paths.map(({ path, lastModified }) => ({
      url: absoluteUrl(locale, path),
      // Spread, not `lastModified: undefined` — an empty catalog should emit no
      // `<lastmod>` at all rather than a placeholder date, which would be a
      // lie a crawler acts on.
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages: localeAlternates(path) },
    })),
  );
}

/** Newest `updatedAt` in a set, falling back to `fallback` — and to nothing at all when the set is empty and no fallback is given. */
function latest(entries: SitemapEntry[], fallback?: Date): Date | undefined {
  return entries.reduce<Date | undefined>(
    (newest, entry) => (!newest || entry.updatedAt > newest ? entry.updatedAt : newest),
    fallback,
  );
}
