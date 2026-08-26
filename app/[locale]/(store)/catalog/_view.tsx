import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CatalogFilters, type CatalogFilterValues } from "@/components/store/catalog-filters";
import { CategoryChip } from "@/components/store/category-chip";
import { CatalogResultsSkeleton, ProductGridSkeleton } from "@/components/store/skeletons";
import { ProductCard } from "@/components/store/product-card";
import { JsonLd } from "@/components/seo/json-ld";
import { Link } from "@/src/i18n/navigation";
import { localized } from "@/src/lib/locale-text";
import { itemListJsonLd } from "@/src/lib/structured-data";
import { absoluteUrl } from "@/src/lib/site";
import {
  getStorefrontCategories,
  listCatalogProducts,
  type CatalogFilters as CatalogQueryFilters,
  type CatalogSort,
  type StorefrontProductCard,
} from "@/src/services/storefront";

const SORTS: CatalogSort[] = ["newest", "price-asc", "price-desc"];

function parseSort(value: string | undefined): CatalogSort {
  return SORTS.includes(value as CatalogSort) ? (value as CatalogSort) : "newest";
}

/**
 * `Number.parseInt` stops at the first non-digit, so `?min=12abc` silently
 * filtered at 12 instead of being treated as the nonsense it is. The upper
 * bound keeps a crafted value from turning into an unbounded number, and the
 * whole thing is a cache key besides (see `listCatalogProducts`).
 */
const MAX_PRICE_FILTER = 10_000_000;

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return Math.min(parsed, MAX_PRICE_FILTER);
}

/** Standing in for the whole view while `params` / `searchParams` resolve. */
export function CatalogShellSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <CatalogResultsSkeleton />
    </div>
  );
}

/**
 * Shared render for `/catalog` and `/catalog/[categorySlug]` (task 09) — the
 * two routes differ only in whether a category is pinned, so one view keeps
 * the heading/filters/grid logic in one place. `notFound()` on an unknown
 * category slug (mirrors the product page's own 404 rule).
 *
 * Both `params` and `searchParams` arrive as promises and are awaited *here*,
 * inside the page's Suspense boundary, rather than in the page component —
 * awaiting either at the top would block the route's static shell. The
 * category rail is rendered from cached data before either resolves, so the
 * part of the page a visitor navigates with is present immediately.
 */
export async function CatalogView({
  locale,
  params,
  searchParams,
}: {
  locale: string;
  params?: Promise<{ categorySlug: string }>;
  searchParams: Promise<CatalogFilterValues>;
}) {
  const [t, categories, resolvedParams, resolvedSearchParams] = await Promise.all([
    getTranslations({ locale, namespace: "catalog" }),
    getStorefrontCategories(),
    params,
    searchParams,
  ]);

  const categorySlug = resolvedParams?.categorySlug;
  const activeCategory = categorySlug ? categories.find((category) => category.slug === categorySlug) : undefined;
  if (categorySlug && !activeCategory) notFound();

  const filters: CatalogQueryFilters = {
    categorySlug,
    search: resolvedSearchParams.q,
    minPrice: parsePositiveInt(resolvedSearchParams.min),
    maxPrice: parsePositiveInt(resolvedSearchParams.max),
    inStockOnly: resolvedSearchParams.stock === "1",
    sort: parseSort(resolvedSearchParams.sort),
  };

  // Started once here and awaited by both consumers below. Calling
  // `listCatalogProducts` in each of them would be a cache hit twice over for
  // the bounded filters, but a second real query on any `?q=` / price search —
  // exactly the case that is uncached by design.
  const productsPromise = listCatalogProducts(filters);

  const action = categorySlug ? `/${locale}/catalog/${categorySlug}` : `/${locale}/catalog`;
  // The unfiltered path, which is also what `generateMetadata` sets as this
  // page's canonical — a `?q=`/`?sort=` variant points back here, so the list
  // is described against the URL that actually gets indexed.
  const listUrl = absoluteUrl(locale, categorySlug ? `/catalog/${categorySlug}` : "/catalog");
  const heading = activeCategory ? localized(locale, activeCategory.nameAr, activeCategory.nameFr) : t("heading.all");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {categories.length > 0 && (
        <div className="mb-8 flex snap-x snap-proximity gap-8 overflow-x-auto touch-pan-x mask-[linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]">
          <Link
            href="/catalog"
            aria-current={!categorySlug ? "page" : undefined}
            className={`shrink-0 snap-start border-b-2 pb-2 text-xs font-semibold tracking-[0.04em] uppercase transition-colors hover:border-plum hover:text-ink ${
              !categorySlug ? "border-plum text-ink" : "border-transparent text-ink-soft"
            }`}
          >
            {t("filters.allCategories")}
          </Link>
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              slug={category.slug}
              name={localized(locale, category.nameAr, category.nameFr)}
              active={category.slug === categorySlug}
            />
          ))}
        </div>
      )}

      <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">{heading}</h1>
        <Suspense fallback={<span className="h-4 w-20 shrink-0" />}>
          <ResultCount locale={locale} products={productsPromise} />
        </Suspense>
      </div>

      <div className="mb-10">
        <CatalogFilters locale={locale} action={action} values={resolvedSearchParams} />
      </div>

      {/* The filter form and category rail above are usable the moment they
          paint; only the grid waits on the query. */}
      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <CatalogGrid locale={locale} products={productsPromise} listUrl={listUrl} />
      </Suspense>
    </div>
  );
}

type ProductsPromise = Promise<StorefrontProductCard[]>;

async function ResultCount({ locale, products }: { locale: string; products: ProductsPromise }) {
  const [t, productList] = await Promise.all([
    getTranslations({ locale, namespace: "catalog" }),
    products,
  ]);
  return <p className="shrink-0 text-xs text-ink-soft">{t("resultCount", { count: productList.length })}</p>;
}

async function CatalogGrid({
  locale,
  products,
  listUrl,
}: {
  locale: string;
  products: ProductsPromise;
  listUrl: string;
}) {
  const [t, productList] = await Promise.all([
    getTranslations({ locale, namespace: "catalog" }),
    products,
  ]);

  if (productList.length === 0) return <p className="text-sm text-ink-soft">{t("empty")}</p>;

  return (
    <>
      {/* Names the set of URLs this page is *about*. The grid is rendered here
          rather than in the page shell because this is where the query has
          actually resolved. */}
      <JsonLd
        data={itemListJsonLd({
          url: listUrl,
          items: productList.map((product) => ({
            name: localized(locale, product.nameAr, product.nameFr),
            url: absoluteUrl(locale, `/product/${product.slug}`),
          })),
        })}
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
        {productList.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            name={localized(locale, product.nameAr, product.nameFr)}
            locale={locale}
          />
        ))}
      </div>
    </>
  );
}
