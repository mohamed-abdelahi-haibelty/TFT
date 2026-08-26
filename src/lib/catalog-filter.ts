/**
 * The storefront's browse rules — category, search, price range, stock, sort —
 * as pure functions over an already-loaded list of product cards.
 *
 * These used to be SQL predicates, one cached query per combination of them,
 * and (for free text and price ranges) no cache at all, because caching on a
 * raw `?q=` mints one permanent entry per query string a visitor can invent.
 * That left every crafted URL as a direct database hit, and on Neon's Free
 * plan a single query holds the compute awake for a five-minute minimum — so
 * anything crawling `/catalog?q=…` overnight could spend the month's budget on
 * results nobody read.
 *
 * A shop-scale catalog fits in one cached array, so the whole browse surface —
 * home, catalog, every category, every search, every sort, both locales — is
 * served by filtering that one array in memory. No query string reaches the
 * database at all.
 *
 * Nothing here imports the database or the service layer: the functions are
 * generic over any row carrying the fields below, which is what keeps them
 * unit-testable without a Neon branch.
 *
 * Worth revisiting somewhere around 1–2k active products, where shipping the
 * whole catalog into one cache entry stops being obviously cheaper than
 * letting Postgres do the filtering. See `CATALOG_SNAPSHOT_MAX_ROWS`.
 */

export type CatalogSort = "newest" | "price-asc" | "price-desc";

export type CatalogFilters = {
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: CatalogSort;
};

/** The shape the browse rules actually read — a structural subset of `StorefrontProductCard`. */
export type FilterableCard = {
  nameAr: string;
  nameFr: string;
  categorySlug: string;
  basePrice: number;
  effectivePrice: number;
  stockQty: number;
  allowBackorder: boolean;
};

/**
 * Case-insensitive substring, matching what `ilike('%term%')` did before.
 *
 * Postgres folds case but not accents, and `toLowerCase` behaves the same way,
 * so "seyes" still does not match "Seyès" — unchanged, not a regression. The
 * LIKE-wildcard escaping `containsTerm` performs is gone because it has
 * nothing left to defend against: a literal `%` a customer types is now just a
 * character in a substring test, which is exactly what that escaping existed
 * to make it mean. Arabic is caseless, so this is a no-op on `nameAr`.
 */
export function matchesSearchTerm(card: Pick<FilterableCard, "nameAr" | "nameFr">, term: string): boolean {
  const needle = term.toLowerCase();
  return card.nameFr.toLowerCase().includes(needle) || card.nameAr.toLowerCase().includes(needle);
}

/** In stock, or explicitly sellable while out of stock — the same rule the SQL predicate encoded. */
export function isPurchasable(card: Pick<FilterableCard, "stockQty" | "allowBackorder">): boolean {
  return card.stockQty > 0 || card.allowBackorder;
}

/**
 * Filters, then sorts, then caps — in that order.
 *
 * The SQL version limited to `maxResults` *before* the price sort ran in JS,
 * so "cheapest first" only ever ranked the newest `maxResults` products among
 * themselves. Sorting the full filtered set and capping afterwards is what the
 * control was always meant to do; below the cap the two are identical.
 *
 * Price *filters* read `basePrice` (the list price, which is what the filter
 * form's own bounds describe) while price *sorts* read `effectivePrice` (what
 * the customer would actually pay today) — both carried over verbatim from the
 * query this replaces.
 */
export function selectCatalogProducts<T extends FilterableCard>(
  cards: readonly T[],
  filters: CatalogFilters,
  maxResults: number,
): T[] {
  const term = filters.search?.trim();

  const matched = cards.filter((card) => {
    if (filters.categorySlug && card.categorySlug !== filters.categorySlug) return false;
    if (term && !matchesSearchTerm(card, term)) return false;
    if (filters.minPrice != null && card.basePrice < filters.minPrice) return false;
    if (filters.maxPrice != null && card.basePrice > filters.maxPrice) return false;
    if (filters.inStockOnly && !isPurchasable(card)) return false;
    return true;
  });

  // `newest` needs no work: the snapshot arrives ordered `created_at desc`,
  // which is the order every listing used to ask SQL for.
  if (filters.sort === "price-asc") matched.sort((a, b) => a.effectivePrice - b.effectivePrice);
  else if (filters.sort === "price-desc") matched.sort((a, b) => b.effectivePrice - a.effectivePrice);

  return matched.slice(0, maxResults);
}
