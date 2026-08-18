import { and, asc, desc, eq, gt, gte, ilike, inArray, lte, or, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
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
import { getEffectivePrice, type EffectivePrice } from "@/src/services/pricing";

/**
 * Public, unauthenticated reads for the storefront (customer-facing, no
 * permission gate — unlike every other `src/services/*` module). Each
 * exported read is a thin `unstable_cache` wrapper, tagged `"products"` /
 * `"bundles"` / `"categories"` — the exact tags every admin mutation already
 * calls `revalidateTag(..., "max")` with (see product-actions.ts /
 * bundle-actions.ts / category-actions.ts / promotion-actions.ts), so a save
 * in admin invalidates the storefront home on the next request with no extra
 * wiring. `unstable_cache` throws outside a real Next.js request
 * (`Invariant: incrementalCache missing`), the same way `requirePermission`'s
 * `next/headers()` call can't run under Vitest — so like every other
 * `src/services/*` module, the real query logic lives in an exported
 * `*Core` function tests call directly, uncached.
 */

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

export const getStorefrontCategories = unstable_cache(getStorefrontCategoriesCore, ["storefront-categories"], {
  tags: ["categories"],
});

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

/** Shared row → card hydration (images + the one authoritative pricing call) for every product-card listing. */
async function hydrateProductCards(rows: ProductCardRow[]): Promise<StorefrontProductCard[]> {
  const images = await firstImagesByProduct(rows.map((row) => row.id));
  const now = new Date();

  return Promise.all(
    rows.map(async (row) => {
      const effective = await getEffectivePrice(
        { kind: "product", id: row.id, price: row.price, discountPrice: row.discountPrice },
        "web",
        now,
      );
      return {
        id: row.id,
        nameAr: row.nameAr,
        nameFr: row.nameFr,
        slug: row.slug,
        categorySlug: row.categorySlug,
        image: images.get(row.id) ?? null,
        basePrice: row.price,
        effectivePrice: effective.price,
        promo: toPromo(effective),
        stockQty: row.stockQty,
        allowBackorder: row.allowBackorder,
      };
    }),
  );
}

export async function getFeaturedProductsCore(limit = 8): Promise<StorefrontProductCard[]> {
  const rows = await db
    .select(PRODUCT_CARD_SELECT)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .orderBy(desc(products.createdAt))
    .limit(limit);

  return hydrateProductCards(rows);
}

export const getFeaturedProducts = unstable_cache(getFeaturedProductsCore, ["storefront-featured-products"], {
  tags: ["products"],
});

export type CatalogSort = "newest" | "price-asc" | "price-desc";

export type CatalogFilters = {
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: CatalogSort;
};

// A small shop's active catalog comfortably fits in one page — no pagination
// in task 09's scope, just a sane upper bound so a future data glitch can't
// return an unbounded response.
const CATALOG_MAX_RESULTS = 200;

export async function listCatalogProductsCore(filters: CatalogFilters): Promise<StorefrontProductCard[]> {
  const conditions: SQL[] = [eq(products.isActive, true)];
  if (filters.categorySlug) conditions.push(eq(categories.slug, filters.categorySlug));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(products.nameFr, term), ilike(products.nameAr, term))!);
  }
  if (filters.minPrice != null) conditions.push(gte(products.price, filters.minPrice));
  if (filters.maxPrice != null) conditions.push(lte(products.price, filters.maxPrice));
  if (filters.inStockOnly) conditions.push(or(gt(products.stockQty, 0), eq(products.allowBackorder, true))!);

  const rows = await db
    .select(PRODUCT_CARD_SELECT)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))
    .limit(CATALOG_MAX_RESULTS);

  // Base `price` filters/orders in SQL (cheap, indexable); the customer's
  // actually-perceived price only exists after the per-row promotion lookup,
  // so "price asc/desc" re-sorts the hydrated cards by `effectivePrice`
  // rather than trusting SQL's base-price order.
  const cards = await hydrateProductCards(rows);

  if (filters.sort === "price-asc") return [...cards].sort((a, b) => a.effectivePrice - b.effectivePrice);
  if (filters.sort === "price-desc") return [...cards].sort((a, b) => b.effectivePrice - a.effectivePrice);
  return cards;
}

export const listCatalogProducts = unstable_cache(listCatalogProductsCore, ["storefront-catalog-products"], {
  tags: ["products"],
});

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

  const effective = await getEffectivePrice(
    { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
    "web",
    new Date(),
  );

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
    promo: toPromo(effective),
    stockQty: product.stockQty,
    allowBackorder: product.allowBackorder,
    images: imageRows.map((row) => row.publicId),
    variants,
  };
}

// `cache()` dedupes the two calls a product page makes in one request
// (`generateMetadata` + the page body) into a single query round-trip;
// `unstable_cache` alone only dedupes across requests, not within one.
export const getStorefrontProductBySlug = cache(
  unstable_cache(getStorefrontProductBySlugCore, ["storefront-product-detail"], { tags: ["products"] }),
);

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

export async function getHomeBundlesCore(limit = 6): Promise<StorefrontBundleCard[]> {
  const rows = await db
    .select({ id: bundles.id, nameAr: bundles.nameAr, nameFr: bundles.nameFr, slug: bundles.slug, price: bundles.price })
    .from(bundles)
    .where(eq(bundles.isActive, true))
    .orderBy(desc(bundles.createdAt))
    .limit(limit);

  const images = await firstImagesByBundle(rows.map((row) => row.id));
  const now = new Date();

  return Promise.all(
    rows.map(async (row) => {
      const effective = await getEffectivePrice({ kind: "bundle", id: row.id, price: row.price }, "web", now);
      return {
        id: row.id,
        nameAr: row.nameAr,
        nameFr: row.nameFr,
        slug: row.slug,
        image: images.get(row.id) ?? null,
        effectivePrice: effective.price,
      };
    }),
  );
}

export const getHomeBundles = unstable_cache(getHomeBundlesCore, ["storefront-home-bundles"], { tags: ["bundles"] });

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
  const [images, availability] = await Promise.all([firstImagesByBundle(bundleIds), bundleAvailabilityByBundle(bundleIds)]);
  const now = new Date();

  return Promise.all(
    rows.map(async (row) => {
      const effective = await getEffectivePrice({ kind: "bundle", id: row.id, price: row.price }, "web", now);
      const avail = availability.get(row.id) ?? { maxSellable: 0, itemCount: 0 };
      return {
        id: row.id,
        nameAr: row.nameAr,
        nameFr: row.nameFr,
        slug: row.slug,
        image: images.get(row.id) ?? null,
        effectivePrice: effective.price,
        itemCount: avail.itemCount,
        maxSellable: avail.maxSellable,
      };
    }),
  );
}

export const listCatalogBundles = unstable_cache(listCatalogBundlesCore, ["storefront-catalog-bundles"], {
  tags: ["bundles"],
});

export type StorefrontBundleItem = {
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

  const now = new Date();

  const items: StorefrontBundleItem[] = await Promise.all(
    itemRows.map(async (row) => {
      const effective = await getEffectivePrice(
        { kind: "product", id: row.productId, price: row.productPrice, discountPrice: row.productDiscountPrice },
        "web",
        now,
      );
      return {
        productId: row.productId,
        productSlug: row.productSlug,
        nameAr: row.productNameAr,
        nameFr: row.productNameFr,
        variantNameAr: row.variantNameAr,
        variantNameFr: row.variantNameFr,
        qty: row.qty,
        unitPrice: effective.price,
      };
    }),
  );

  const componentPriceSum = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

  const components: AvailabilityComponent[] = itemRows.map((row) => ({
    qty: row.qty,
    stock: row.variantStockQty ?? row.productStockQty,
    allowBackorder: row.allowBackorder,
  }));

  const effectiveBundle = await getEffectivePrice({ kind: "bundle", id: bundle.id, price: bundle.price }, "web", now);

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
    promo: toPromo(effectiveBundle),
    maxSellable: deriveMaxSellable(components),
    items,
    componentPriceSum,
  };
}

// See `getStorefrontProductBySlug`'s own comment: `cache()` dedupes
// `generateMetadata` + the page body into one query round-trip per request.
export const getStorefrontBundleBySlug = cache(
  unstable_cache(getStorefrontBundleBySlugCore, ["storefront-bundle-detail"], { tags: ["bundles"] }),
);

export type SitemapCatalog = {
  categories: { slug: string }[];
  products: { slug: string }[];
  bundles: { slug: string }[];
};

/** Slugs only, for `app/sitemap.ts` — active items across both storefront locales. */
export async function getSitemapCatalogCore(): Promise<SitemapCatalog> {
  const [categoryRows, productRows, bundleRows] = await Promise.all([
    db.select({ slug: categories.slug }).from(categories),
    db.select({ slug: products.slug }).from(products).where(eq(products.isActive, true)),
    db.select({ slug: bundles.slug }).from(bundles).where(eq(bundles.isActive, true)),
  ]);

  return { categories: categoryRows, products: productRows, bundles: bundleRows };
}

export const getSitemapCatalog = unstable_cache(getSitemapCatalogCore, ["storefront-sitemap-catalog"], {
  tags: ["categories", "products", "bundles"],
});
