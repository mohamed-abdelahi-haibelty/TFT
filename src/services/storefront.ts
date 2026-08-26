import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { db } from "@/src/db/client";
import {
  bundleImages,
  bundleItems,
  bundles,
  categories,
  productImages,
  products,
  productVariants,
  variantImages,
} from "@/src/db/schema";
import { deriveMaxSellable, type AvailabilityComponent } from "@/src/lib/bundle-availability";
import {
  selectCatalogProducts,
  type CatalogFilters,
  type CatalogSort,
} from "@/src/lib/catalog-filter";
import { getEffectivePrices, type EffectivePrice, type PricingItem } from "@/src/services/pricing";

/**
 * Public, unauthenticated reads for the storefront (customer-facing, no
 * permission gate — unlike every other `src/services/*` module). Each
 * exported read is a thin `use cache` wrapper, tagged `"products"` /
 * `"bundles"` / `"categories"` — the exact tags every admin mutation already
 * calls `revalidateTag(..., "max")` with (see product-actions.ts /
 * bundle-actions.ts / category-actions.ts / promotion-actions.ts), so a save
 * in admin invalidates the storefront home on the next request with no extra
 * wiring. A `use cache` scope can't run outside a real Next.js render, the
 * same way `requirePermission`'s `next/headers()` call can't run under Vitest
 * — so like every other `src/services/*` module, the real query logic lives
 * in an exported `*Core` function tests call directly, uncached.
 *
 * The browse surface is served from two cached snapshots — `getCatalogSnapshot`
 * and `listCatalogBundles` — rather than one cached query per filter
 * combination. Category, search, price range and sort are applied in memory by
 * `src/lib/catalog-filter.ts`; that module's own header explains why, and what
 * catalog size would make it the wrong trade. Product and bundle *detail*
 * pages keep their own cached reads, since they need descriptions, variants
 * and the full image list the cards do not carry.
 *
 * Every promo-sensitive entry carries the `"storefront"` cache profile
 * (defined in next.config.ts). Tag invalidation alone covers *mutations*, but
 * a promotion starting or ending is a clock event that no mutation
 * accompanies — without a bounded lifetime a cached page kept quoting a
 * discount after `ends_at` (and never picked one up at `starts_at`), while
 * `createOrderCore` re-priced against the real clock and charged something
 * else. That profile's `revalidate` is now the *only* thing bounding promo
 * lag on these reads, since `getEffectivePrices` dates the window in SQL
 * rather than reading a JS clock these scopes aren't allowed to touch.
 *
 * Nothing here may call `getTranslations`: next-intl resolves the locale
 * through React `cache()`, which `use cache` isolates, so it would fall
 * through to `headers()` and fail with `next-request-in-use-cache`. Cache
 * data here; translate in the component.
 */

/**
 * Upper bound on how long a storefront read may lag the database.
 *
 * This number is a Neon Free-plan budget, not a freshness preference. That
 * plan bills wall-clock time the compute is *awake*, and scale-to-zero is
 * fixed at five minutes of inactivity — so any single query costs a five
 * minute minimum, and the whole monthly allowance is roughly 400 awake-hours.
 * At the old 60s one visitor per minute was enough to hold the compute awake
 * around the clock; at 900s the entire storefront costs one fill per quarter
 * hour no matter how much traffic arrives.
 *
 * Nothing correctness-critical rides on it:
 *   - Admin edits are not subject to it at all — every mutation calls
 *     `revalidateTag(..., "max")` and lands immediately.
 *   - A promotion *ending* is handled client-side (`promo-countdown.tsx` ticks
 *     the clock and falls back to `postPromoPrice`), so a stale entry cannot
 *     keep quoting a dead discount.
 *   - A promotion *starting* is the one genuinely clock-driven lag left: a
 *     scheduled promo becomes visible up to 15 minutes late.
 *   - Stock shown here is advisory; `createOrderCore` re-checks availability
 *     and re-prices against the real clock before anything is charged.
 *
 * Kept as the single source of truth for the `"storefront"` cacheLife profile
 * in next.config.ts.
 */
export const STOREFRONT_REVALIDATE_SECONDS = 900;

export type StorefrontCategory = {
  id: string;
  nameAr: string;
  nameFr: string;
  slug: string;
};

const CATEGORY_SELECT = {
  id: categories.id,
  nameAr: categories.nameAr,
  nameFr: categories.nameFr,
  slug: categories.slug,
};

export async function getStorefrontCategoriesCore(): Promise<StorefrontCategory[]> {
  return db.select(CATEGORY_SELECT).from(categories).orderBy(asc(categories.sort), asc(categories.createdAt));
}

export async function getStorefrontCategories(): Promise<StorefrontCategory[]> {
  "use cache";
  cacheLife("max");
  cacheTag("categories");
  return getStorefrontCategoriesCore();
}

export type StorefrontPromo = { nameAr: string; nameFr: string; endsAt: Date };

export type StorefrontProductCard = {
  id: string;
  nameAr: string;
  nameFr: string;
  slug: string;
  categorySlug: string;
  image: string | null;
  basePrice: number;
  effectivePrice: number;
  /**
   * What this item costs once `promo` has run out — its standing
   * `discount_price` when it has one, otherwise `basePrice`. The client ticks
   * the promo clock itself, and without this it fell back to `basePrice` and
   * quoted the *undiscounted* price for every permanently-discounted product.
   */
  postPromoPrice: number;
  promo: StorefrontPromo | null;
  stockQty: number;
  allowBackorder: boolean;
};

async function firstImagesByProduct(productIds: string[]): Promise<Map<string, string>> {
  if (!productIds.length) return new Map();

  const rows = await db
    .select({ productId: productImages.productId, publicId: productImages.publicId, sort: productImages.sort })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sort));

  const byProduct = new Map<string, string>();
  for (const row of rows) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, row.publicId);
  }
  return byProduct;
}

type ProductCardRow = {
  id: string;
  nameAr: string;
  nameFr: string;
  slug: string;
  price: number;
  discountPrice: number | null;
  stockQty: number;
  allowBackorder: boolean;
  categorySlug: string;
};

const PRODUCT_CARD_SELECT = {
  id: products.id,
  nameAr: products.nameAr,
  nameFr: products.nameFr,
  slug: products.slug,
  price: products.price,
  discountPrice: products.discountPrice,
  stockQty: products.stockQty,
  allowBackorder: products.allowBackorder,
  categorySlug: categories.slug,
};

function toPromo(effective: EffectivePrice): StorefrontPromo | null {
  return effective.promo ?? null;
}

/** The price a promo-expiring client should fall back to — never the bare list price when a `discount_price` stands. */
function postPromoPrice(price: number, discountPrice: number | null): number {
  return discountPrice ?? price;
}

/**
 * Shared row → card hydration (images + the one authoritative pricing call)
 * for every product-card listing. Prices resolve through `getEffectivePrices`,
 * the batched sibling: one promotion query for the whole page instead of one
 * per row, which at `CATALOG_MAX_RESULTS` was up to 200 round trips against a
 * serverless database per cache fill.
 */
async function hydrateProductCards(rows: ProductCardRow[]): Promise<StorefrontProductCard[]> {
  const [images, prices] = await Promise.all([
    firstImagesByProduct(rows.map((row) => row.id)),
    getEffectivePrices(
      rows.map((row): PricingItem => ({
        kind: "product",
        id: row.id,
        price: row.price,
        discountPrice: row.discountPrice,
      })),
      "web",
    ),
  ]);

  return rows.map((row) => {
    const effective = prices.get(row.id) ?? { price: row.price, base: row.price };
    return {
      id: row.id,
      nameAr: row.nameAr,
      nameFr: row.nameFr,
      slug: row.slug,
      categorySlug: row.categorySlug,
      image: images.get(row.id) ?? null,
      basePrice: row.price,
      effectivePrice: effective.price,
      postPromoPrice: postPromoPrice(row.price, row.discountPrice),
      promo: toPromo(effective),
      stockQty: row.stockQty,
      allowBackorder: row.allowBackorder,
    };
  });
}

/**
 * A sanity bound on the snapshot itself, not a control anyone browses with —
 * it exists only so a future data glitch cannot pull an unbounded result set
 * into memory. `CATALOG_MAX_RESULTS` below is the one that shapes what a
 * visitor sees. If the shop ever approaches this, the in-memory filtering in
 * `catalog-filter.ts` is the thing to reconsider, not this number.
 */
const CATALOG_SNAPSHOT_MAX_ROWS = 2000;

/** How many results one catalog listing shows, applied after filtering and sorting. */
const CATALOG_MAX_RESULTS = 200;

/**
 * Every active product, newest first, hydrated into cards — the single read
 * behind the entire storefront browse experience.
 *
 * Home, `/catalog`, every `/catalog/[categorySlug]`, every search, every price
 * range and every sort are now derived from this one array by
 * `selectCatalogProducts`. Previously each of those was its own cached query:
 * roughly six entries per category once sort and stock were multiplied out,
 * each expiring on its own schedule and each waking the database to refill —
 * and free-text search was excluded from caching entirely, so any URL a
 * crawler invented went straight to Postgres. One entry replaces all of it, at
 * one fill per `STOREFRONT_REVALIDATE_SECONDS` for the whole storefront.
 */
export async function getCatalogSnapshotCore(): Promise<StorefrontProductCard[]> {
  const rows = await db
    .select(PRODUCT_CARD_SELECT)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .orderBy(desc(products.createdAt))
    .limit(CATALOG_SNAPSHOT_MAX_ROWS);

  return hydrateProductCards(rows);
}

async function getCatalogSnapshotCached(): Promise<StorefrontProductCard[]> {
  "use cache";
  cacheLife("storefront");
  cacheTag("products");
  return getCatalogSnapshotCore();
}

// `cache()` on top of `use cache` for the same reason
// `getStorefrontProductBySlug` uses it: the home page alone reads this twice
// (the hero photo and the featured grid), and `use cache` dedupes across
// requests, not within one.
export const getCatalogSnapshot = cache(getCatalogSnapshotCached);

export async function getFeaturedProductsCore(limit = 8): Promise<StorefrontProductCard[]> {
  return (await getCatalogSnapshotCore()).slice(0, limit);
}

/** The newest `limit` products — the snapshot is already in that order. */
export async function getFeaturedProducts(limit = 8): Promise<StorefrontProductCard[]> {
  return (await getCatalogSnapshot()).slice(0, limit);
}

export type { CatalogFilters, CatalogSort };

export async function listCatalogProductsCore(filters: CatalogFilters): Promise<StorefrontProductCard[]> {
  return selectCatalogProducts(await getCatalogSnapshotCore(), filters, CATALOG_MAX_RESULTS);
}

export async function listCatalogProducts(filters: CatalogFilters): Promise<StorefrontProductCard[]> {
  return selectCatalogProducts(await getCatalogSnapshot(), filters, CATALOG_MAX_RESULTS);
}

export type StorefrontVariant = {
  id: string;
  nameAr: string;
  nameFr: string;
  colorHex: string | null;
  // null = this variant sells from the parent product's own stock.
  stockQty: number | null;
  images: string[];
};

export type StorefrontProductDetail = {
  id: string;
  nameAr: string;
  nameFr: string;
  descriptionAr: string | null;
  descriptionFr: string | null;
  slug: string;
  sku: string;
  categorySlug: string;
  categoryNameAr: string;
  categoryNameFr: string;
  basePrice: number;
  effectivePrice: number;
  /** See `StorefrontProductCard.postPromoPrice`. */
  postPromoPrice: number;
  promo: StorefrontPromo | null;
  stockQty: number;
  allowBackorder: boolean;
  images: string[];
  variants: StorefrontVariant[];
};

export async function getStorefrontProductBySlugCore(slug: string): Promise<StorefrontProductDetail | null> {
  const [product] = await db
    .select({
      id: products.id,
      nameAr: products.nameAr,
      nameFr: products.nameFr,
      descriptionAr: products.descriptionAr,
      descriptionFr: products.descriptionFr,
      slug: products.slug,
      sku: products.sku,
      price: products.price,
      discountPrice: products.discountPrice,
      stockQty: products.stockQty,
      allowBackorder: products.allowBackorder,
      categorySlug: categories.slug,
      categoryNameAr: categories.nameAr,
      categoryNameFr: categories.nameFr,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.slug, slug), eq(products.isActive, true)))
    .limit(1);

  if (!product) return null;

  const [imageRows, variantRows] = await Promise.all([
    db
      .select({ publicId: productImages.publicId })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sort)),
    db
      .select({
        id: productVariants.id,
        nameAr: productVariants.nameAr,
        nameFr: productVariants.nameFr,
        colorHex: productVariants.colorHex,
        stockQty: productVariants.stockQty,
      })
      .from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.createdAt)),
  ]);

  const variantIds = variantRows.map((variant) => variant.id);
  const variantImageRows = variantIds.length
    ? await db
        .select({ variantId: variantImages.variantId, publicId: variantImages.publicId })
        .from(variantImages)
        .where(inArray(variantImages.variantId, variantIds))
        .orderBy(asc(variantImages.sort))
    : [];

  const variants: StorefrontVariant[] = variantRows.map((variant) => ({
    id: variant.id,
    nameAr: variant.nameAr,
    nameFr: variant.nameFr,
    colorHex: variant.colorHex,
    stockQty: variant.stockQty,
    images: variantImageRows.filter((img) => img.variantId === variant.id).map((img) => img.publicId),
  }));

  const prices = await getEffectivePrices(
    [{ kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice }],
    "web",
  );
  const effective = prices.get(product.id) ?? { price: product.price, base: product.price };

  return {
    id: product.id,
    nameAr: product.nameAr,
    nameFr: product.nameFr,
    descriptionAr: product.descriptionAr,
    descriptionFr: product.descriptionFr,
    slug: product.slug,
    sku: product.sku,
    categorySlug: product.categorySlug,
    categoryNameAr: product.categoryNameAr,
    categoryNameFr: product.categoryNameFr,
    basePrice: product.price,
    effectivePrice: effective.price,
    postPromoPrice: postPromoPrice(product.price, product.discountPrice),
    promo: toPromo(effective),
    stockQty: product.stockQty,
    allowBackorder: product.allowBackorder,
    images: imageRows.map((row) => row.publicId),
    variants,
  };
}

// `cache()` dedupes the two calls a product page makes in one request
// (`generateMetadata` + the page body) into a single query round-trip;
// `use cache` alone only dedupes across requests, not within one.
async function getStorefrontProductBySlugCached(slug: string): Promise<StorefrontProductDetail | null> {
  "use cache";
  cacheLife("storefront");
  cacheTag("products");
  return getStorefrontProductBySlugCore(slug);
}

export const getStorefrontProductBySlug = cache(getStorefrontProductBySlugCached);

export type StorefrontBundleCard = {
  id: string;
  nameAr: string;
  nameFr: string;
  slug: string;
  image: string | null;
  effectivePrice: number;
};

async function firstImagesByBundle(bundleIds: string[]): Promise<Map<string, string>> {
  if (!bundleIds.length) return new Map();

  const rows = await db
    .select({ bundleId: bundleImages.bundleId, publicId: bundleImages.publicId, sort: bundleImages.sort })
    .from(bundleImages)
    .where(inArray(bundleImages.bundleId, bundleIds))
    .orderBy(asc(bundleImages.sort));

  const byBundle = new Map<string, string>();
  for (const row of rows) {
    if (!byBundle.has(row.bundleId)) byBundle.set(row.bundleId, row.publicId);
  }
  return byBundle;
}



export type StorefrontBundleListCard = StorefrontBundleCard & {
  itemCount: number;
  /** From `deriveMaxSellable` — `null` = unlimited, `0` = the availability badge shows. */
  maxSellable: number | null;
};

type BundleComponentRow = {
  bundleId: string;
  qty: number;
  variantStockQty: number | null;
  productStockQty: number;
  allowBackorder: boolean;
};

async function bundleComponentRows(bundleIds: string[]): Promise<BundleComponentRow[]> {
  if (!bundleIds.length) return [];

  return db
    .select({
      bundleId: bundleItems.bundleId,
      qty: bundleItems.qty,
      variantStockQty: productVariants.stockQty,
      productStockQty: products.stockQty,
      allowBackorder: products.allowBackorder,
    })
    .from(bundleItems)
    .innerJoin(products, eq(bundleItems.productId, products.id))
    .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
    .where(inArray(bundleItems.bundleId, bundleIds));
}

/** Mirrors the admin bundle list's own availability grouping (`bundles.ts`) — kept separate so this public module never imports the permission-gated admin service. */
async function bundleAvailabilityByBundle(
  bundleIds: string[],
): Promise<Map<string, { maxSellable: number | null; itemCount: number }>> {
  const rows = await bundleComponentRows(bundleIds);

  const byBundle = new Map<string, AvailabilityComponent[]>();
  for (const row of rows) {
    const list = byBundle.get(row.bundleId) ?? [];
    list.push({ qty: row.qty, stock: row.variantStockQty ?? row.productStockQty, allowBackorder: row.allowBackorder });
    byBundle.set(row.bundleId, list);
  }

  const result = new Map<string, { maxSellable: number | null; itemCount: number }>();
  for (const [bundleId, components] of byBundle) {
    result.set(bundleId, { maxSellable: deriveMaxSellable(components), itemCount: components.length });
  }
  return result;
}

// A small shop's active bundle list comfortably fits in one page — same
// reasoning as `CATALOG_MAX_RESULTS`, just a sane upper bound.
const CATALOG_BUNDLES_MAX_RESULTS = 200;

export async function listCatalogBundlesCore(): Promise<StorefrontBundleListCard[]> {
  const rows = await db
    .select({ id: bundles.id, nameAr: bundles.nameAr, nameFr: bundles.nameFr, slug: bundles.slug, price: bundles.price })
    .from(bundles)
    .where(eq(bundles.isActive, true))
    .orderBy(desc(bundles.createdAt))
    .limit(CATALOG_BUNDLES_MAX_RESULTS);

  const bundleIds = rows.map((row) => row.id);
  const [images, availability, prices] = await Promise.all([
    firstImagesByBundle(bundleIds),
    bundleAvailabilityByBundle(bundleIds),
    getEffectivePrices(
      rows.map((row): PricingItem => ({ kind: "bundle", id: row.id, price: row.price })),
      "web",
    ),
  ]);

  return rows.map((row) => {
    const avail = availability.get(row.id) ?? { maxSellable: 0, itemCount: 0 };
    return {
      id: row.id,
      nameAr: row.nameAr,
      nameFr: row.nameFr,
      slug: row.slug,
      image: images.get(row.id) ?? null,
      effectivePrice: (prices.get(row.id) ?? { price: row.price }).price,
      itemCount: avail.itemCount,
      maxSellable: avail.maxSellable,
    };
  });
}

async function listCatalogBundlesCached(): Promise<StorefrontBundleListCard[]> {
  "use cache";
  cacheLife("storefront");
  cacheTag("bundles");
  return listCatalogBundlesCore();
}

/**
 * Every active box, newest first — the bundle half of the storefront's browse
 * snapshot, and the only bundle-list read there is. `/boxes` renders it whole
 * and the home band takes the first few off the top, where each used to be its
 * own cached query with its own refill.
 */
export const listCatalogBundles = cache(listCatalogBundlesCached);

export async function getHomeBundlesCore(limit = 6): Promise<StorefrontBundleCard[]> {
  return (await listCatalogBundlesCore()).slice(0, limit);
}

export async function getHomeBundles(limit = 6): Promise<StorefrontBundleCard[]> {
  return (await listCatalogBundles()).slice(0, limit);
}

export type StorefrontBundleItem = {
  /** `bundle_items.id` — the only stable identity for a component row, since the same product may legitimately appear twice in one box. */
  id: string;
  productId: string;
  productSlug: string;
  nameAr: string;
  nameFr: string;
  variantNameAr: string | null;
  variantNameFr: string | null;
  qty: number;
  /** The component product's own effective per-unit price today (task-10: "sum of component prices"). */
  unitPrice: number;
};

export type StorefrontBundleDetail = {
  id: string;
  nameAr: string;
  nameFr: string;
  descriptionAr: string | null;
  descriptionFr: string | null;
  slug: string;
  images: string[];
  basePrice: number;
  effectivePrice: number;
  /** See `StorefrontProductCard.postPromoPrice`. A bundle has no standing discount column, so this is always its list price. */
  postPromoPrice: number;
  promo: StorefrontPromo | null;
  maxSellable: number | null;
  items: StorefrontBundleItem[];
  /** Sum of each component's own effective price × qty — the "buy separately" total the savings line compares against. */
  componentPriceSum: number;
};

export async function getStorefrontBundleBySlugCore(slug: string): Promise<StorefrontBundleDetail | null> {
  const [bundle] = await db
    .select({
      id: bundles.id,
      nameAr: bundles.nameAr,
      nameFr: bundles.nameFr,
      descriptionAr: bundles.descriptionAr,
      descriptionFr: bundles.descriptionFr,
      slug: bundles.slug,
      price: bundles.price,
    })
    .from(bundles)
    .where(and(eq(bundles.slug, slug), eq(bundles.isActive, true)))
    .limit(1);

  if (!bundle) return null;

  const [imageRows, itemRows] = await Promise.all([
    db
      .select({ publicId: bundleImages.publicId })
      .from(bundleImages)
      .where(eq(bundleImages.bundleId, bundle.id))
      .orderBy(asc(bundleImages.sort)),
    db
      .select({
        id: bundleItems.id,
        qty: bundleItems.qty,
        productId: products.id,
        productSlug: products.slug,
        productNameAr: products.nameAr,
        productNameFr: products.nameFr,
        productPrice: products.price,
        productDiscountPrice: products.discountPrice,
        productStockQty: products.stockQty,
        allowBackorder: products.allowBackorder,
        variantStockQty: productVariants.stockQty,
        variantNameAr: productVariants.nameAr,
        variantNameFr: productVariants.nameFr,
      })
      .from(bundleItems)
      .innerJoin(products, eq(bundleItems.productId, products.id))
      .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
      .where(eq(bundleItems.bundleId, bundle.id))
      .orderBy(asc(bundleItems.createdAt)),
  ]);

  // One query for the whole manifest plus the box itself, rather than one per
  // component — the same batched call every other listing here now uses.
  const prices = await getEffectivePrices(
    [
      ...itemRows.map((row): PricingItem => ({
        kind: "product",
        id: row.productId,
        price: row.productPrice,
        discountPrice: row.productDiscountPrice,
      })),
      { kind: "bundle", id: bundle.id, price: bundle.price },
    ],
    "web",
  );

  const items: StorefrontBundleItem[] = itemRows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productSlug: row.productSlug,
    nameAr: row.productNameAr,
    nameFr: row.productNameFr,
    variantNameAr: row.variantNameAr,
    variantNameFr: row.variantNameFr,
    qty: row.qty,
    unitPrice: (prices.get(row.productId) ?? { price: row.productPrice }).price,
  }));

  const componentPriceSum = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

  const components: AvailabilityComponent[] = itemRows.map((row) => ({
    qty: row.qty,
    stock: row.variantStockQty ?? row.productStockQty,
    allowBackorder: row.allowBackorder,
  }));

  const effectiveBundle = prices.get(bundle.id) ?? { price: bundle.price, base: bundle.price };

  return {
    id: bundle.id,
    nameAr: bundle.nameAr,
    nameFr: bundle.nameFr,
    descriptionAr: bundle.descriptionAr,
    descriptionFr: bundle.descriptionFr,
    slug: bundle.slug,
    images: imageRows.map((row) => row.publicId),
    basePrice: bundle.price,
    effectivePrice: effectiveBundle.price,
    postPromoPrice: bundle.price,
    promo: toPromo(effectiveBundle),
    maxSellable: deriveMaxSellable(components),
    items,
    componentPriceSum,
  };
}

// See `getStorefrontProductBySlug`'s own comment: `cache()` dedupes
// `generateMetadata` + the page body into one query round-trip per request.
async function getStorefrontBundleBySlugCached(slug: string): Promise<StorefrontBundleDetail | null> {
  "use cache";
  cacheLife("storefront");
  cacheTag("bundles");
  return getStorefrontBundleBySlugCore(slug);
}

export const getStorefrontBundleBySlug = cache(getStorefrontBundleBySlugCached);

export type SitemapEntry = { slug: string; updatedAt: Date };
/** Products carry their category so `app/sitemap.ts` can date a category page by its newest product rather than by the near-immutable category row. */
export type SitemapProductEntry = SitemapEntry & { categorySlug: string };

export type SitemapCatalog = {
  categories: SitemapEntry[];
  products: SitemapProductEntry[];
  bundles: SitemapEntry[];
};

/**
 * Slugs and modification dates for `app/sitemap.ts` — active items across both
 * storefront locales.
 *
 * `updatedAt` is what makes `<lastmod>` truthful, and a truthful `<lastmod>` is
 * the one hint in a sitemap that Google acts on: it is how a repriced product
 * gets recrawled without waiting out the normal cycle. `changefreq` and
 * `priority` are not emitted anywhere, because Google ignores both.
 */
export async function getSitemapCatalogCore(): Promise<SitemapCatalog> {
  const [categoryRows, productRows, bundleRows] = await Promise.all([
    db.select({ slug: categories.slug, updatedAt: categories.updatedAt }).from(categories),
    db
      .select({ slug: products.slug, updatedAt: products.updatedAt, categorySlug: categories.slug })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.isActive, true)),
    db.select({ slug: bundles.slug, updatedAt: bundles.updatedAt }).from(bundles).where(eq(bundles.isActive, true)),
  ]);

  return { categories: categoryRows, products: productRows, bundles: bundleRows };
}

export async function getSitemapCatalog(): Promise<SitemapCatalog> {
  "use cache";
  cacheLife("max");
  cacheTag("categories", "products", "bundles");
  return getSitemapCatalogCore();
}
