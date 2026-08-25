import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CatalogFilters, type CatalogFilterValues } from "@/components/store/catalog-filters";
import { CategoryChip } from "@/components/store/category-chip";
import { ProductCard } from "@/components/store/product-card";
import { Link } from "@/src/i18n/navigation";
import { localized } from "@/src/lib/locale-text";
import { getStorefrontCategories, listCatalogProducts, type CatalogSort } from "@/src/services/storefront";

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

/**
 * Shared render for `/catalog` and `/catalog/[categorySlug]` (task 09) — the
 * two routes differ only in whether a category is pinned, so one view keeps
 * the heading/filters/grid logic in one place. `notFound()` on an unknown
 * category slug (mirrors the product page's own 404 rule).
 */
export async function CatalogView({
  locale,
  categorySlug,
  searchParams,
}: {
  locale: string;
  categorySlug?: string;
  searchParams: CatalogFilterValues;
}) {
  const [t, categories] = await Promise.all([
    getTranslations({ locale, namespace: "catalog" }),
    getStorefrontCategories(),
  ]);

  const activeCategory = categorySlug ? categories.find((category) => category.slug === categorySlug) : undefined;
  if (categorySlug && !activeCategory) notFound();

  const filters = {
    categorySlug,
    search: searchParams.q,
    minPrice: parsePositiveInt(searchParams.min),
    maxPrice: parsePositiveInt(searchParams.max),
    inStockOnly: searchParams.stock === "1",
    sort: parseSort(searchParams.sort),
  };

  const productList = await listCatalogProducts(filters);
  const action = categorySlug ? `/${locale}/catalog/${categorySlug}` : `/${locale}/catalog`;
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
        <p className="shrink-0 text-xs text-ink-soft">{t("resultCount", { count: productList.length })}</p>
      </div>

      <div className="mb-10">
        <CatalogFilters locale={locale} action={action} values={searchParams} />
      </div>

      {productList.length > 0 ? (
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
      ) : (
        <p className="text-sm text-ink-soft">{t("empty")}</p>
      )}
    </div>
  );
}
