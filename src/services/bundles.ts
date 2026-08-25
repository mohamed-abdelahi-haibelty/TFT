import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { bundleImages, bundleItems, bundles, categories, orderItems, productVariants, products } from "@/src/db/schema";
import { destroyCloudinaryAssets } from "@/src/lib/cloudinary-sign";
import { isUniqueViolation } from "@/src/lib/db-errors";
import type { ServiceResult } from "@/src/lib/errors";
import { containsTerm } from "@/src/lib/search";
import { deriveMaxSellable, deriveLimitingComponent, type AvailabilityComponent, type LimitRef } from "@/src/lib/bundle-availability";
import { insertWithUniqueSku } from "@/src/lib/sku";
import { slugify } from "@/src/lib/slug";
import { can, requirePermission } from "@/src/services/authz";

export { deriveMaxSellable, deriveLimitingComponent, type AvailabilityComponent, type LimitRef } from "@/src/lib/bundle-availability";

export type BundleListItem = {
  id: string;
  nameAr: string;
  nameFr: string;
  slug: string;
  sku: string;
  price: number;
  isActive: boolean;
  itemCount: number;
  maxSellable: number | null;
  /** The component whose stock caps the bundle — null when nothing limits it. */
  limitBy: LimitRef | null;
};

type ImageRef = { publicId: string; sort: number };

export type BundleItemDetail = {
  id: string;
  productId: string;
  productNameAr: string;
  productNameFr: string;
  productSku: string;
  qty: number;
  variantId: string | null;
  variantNameAr: string | null;
  variantNameFr: string | null;
  stock: number;
  allowBackorder: boolean;
  /** The component's own unit price (discount price when set) — for the client-side live component-sum recompute as qty changes. */
  price: number;
  /** The component product (and its variant, when one is chosen) is active. */
  isActive: boolean;
};

export type BundleDetail = BundleListItem & {
  descriptionAr: string | null;
  descriptionFr: string | null;
  images: ImageRef[];
  items: BundleItemDetail[];
  /** Sum of each component's own price × qty — informational only, shown next to the bundle price. */
  componentPriceSum: number;
};

export type BundleMessages = {
  invalidInput: string;
  slugTaken: string;
};

export type DeactivatedBundleRef = { id: string; nameAr: string; nameFr: string };

const BUNDLE_SELECT = {
  id: bundles.id,
  nameAr: bundles.nameAr,
  nameFr: bundles.nameFr,
  slug: bundles.slug,
  sku: bundles.sku,
  price: bundles.price,
  isActive: bundles.isActive,
};

type ComponentRow = {
  bundleId: string;
  qty: number;
  variantStockQty: number | null;
  productStockQty: number;
  allowBackorder: boolean;
  productNameAr: string;
  productNameFr: string;
  variantNameAr: string | null;
  variantNameFr: string | null;
};

async function listComponentRows(bundleIds: string[]): Promise<ComponentRow[]> {
  if (!bundleIds.length) return [];

  return db
    .select({
      bundleId: bundleItems.bundleId,
      qty: bundleItems.qty,
      variantStockQty: productVariants.stockQty,
      productStockQty: products.stockQty,
      allowBackorder: products.allowBackorder,
      productNameAr: products.nameAr,
      productNameFr: products.nameFr,
      variantNameAr: productVariants.nameAr,
      variantNameFr: productVariants.nameFr,
    })
    .from(bundleItems)
    .innerJoin(products, eq(bundleItems.productId, products.id))
    .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
    .where(inArray(bundleItems.bundleId, bundleIds));
}

type BundleAvailability = { maxSellable: number | null; itemCount: number; limitBy: LimitRef | null };

function groupAvailability(rows: ComponentRow[]): Map<string, BundleAvailability> {
  const byBundle = new Map<string, (AvailabilityComponent & LimitRef)[]>();
  for (const row of rows) {
    const list = byBundle.get(row.bundleId) ?? [];
    list.push({
      qty: row.qty,
      stock: row.variantStockQty ?? row.productStockQty,
      allowBackorder: row.allowBackorder,
      nameAr: row.variantNameAr ?? row.productNameAr,
      nameFr: row.variantNameFr ?? row.productNameFr,
    });
    byBundle.set(row.bundleId, list);
  }

  const result = new Map<string, BundleAvailability>();
  for (const [bundleId, components] of byBundle) {
    result.set(bundleId, {
      maxSellable: deriveMaxSellable(components),
      itemCount: components.length,
      limitBy: deriveLimitingComponent(components),
    });
  }
  return result;
}

export async function listBundles(filters: {
  search?: string;
  activeOnly?: boolean;
}): Promise<ServiceResult<BundleListItem[]>> {
  const auth = await requirePermission("catalog.view");
  if (!auth.ok) return auth;

  const conditions = [];
  const term = containsTerm(filters.search);
  if (term) {
    conditions.push(or(ilike(bundles.nameFr, term), ilike(bundles.nameAr, term), ilike(bundles.sku, term)));
  }
  if (filters.activeOnly) conditions.push(eq(bundles.isActive, true));

  const rows = await db
    .select(BUNDLE_SELECT)
    .from(bundles)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bundles.createdAt));

  const availability = groupAvailability(await listComponentRows(rows.map((b) => b.id)));

  return {
    ok: true,
    data: rows.map((bundle) => ({
      ...bundle,
      itemCount: availability.get(bundle.id)?.itemCount ?? 0,
      maxSellable: availability.get(bundle.id)?.maxSellable ?? 0,
      limitBy: availability.get(bundle.id)?.limitBy ?? null,
    })),
  };
}

export async function getBundle(id: string): Promise<ServiceResult<BundleDetail>> {
  const auth = await requirePermission("catalog.view");
  if (!auth.ok) return auth;

  const t = await getTranslations("bundleErrors");
  return getBundleCore(id, { notFound: t("notFound") });
}

export async function getBundleCore(
  id: string,
  messages: { notFound: string },
): Promise<ServiceResult<BundleDetail>> {
  const [bundle] = await db
    .select({ ...BUNDLE_SELECT, descriptionAr: bundles.descriptionAr, descriptionFr: bundles.descriptionFr })
    .from(bundles)
    .where(eq(bundles.id, id))
    .limit(1);

  if (!bundle) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  const images = await db
    .select({ publicId: bundleImages.publicId, sort: bundleImages.sort })
    .from(bundleImages)
    .where(eq(bundleImages.bundleId, id))
    .orderBy(asc(bundleImages.sort));

  const itemRows = await db
    .select({
      id: bundleItems.id,
      qty: bundleItems.qty,
      productId: products.id,
      productNameAr: products.nameAr,
      productNameFr: products.nameFr,
      productSku: products.sku,
      productPrice: products.price,
      productDiscountPrice: products.discountPrice,
      productStockQty: products.stockQty,
      productAllowBackorder: products.allowBackorder,
      productIsActive: products.isActive,
      variantId: productVariants.id,
      variantNameAr: productVariants.nameAr,
      variantNameFr: productVariants.nameFr,
      variantStockQty: productVariants.stockQty,
      variantIsActive: productVariants.isActive,
    })
    .from(bundleItems)
    .innerJoin(products, eq(bundleItems.productId, products.id))
    .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
    .where(eq(bundleItems.bundleId, id))
    .orderBy(asc(bundleItems.createdAt));

  const items: BundleItemDetail[] = itemRows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productNameAr: row.productNameAr,
    productNameFr: row.productNameFr,
    productSku: row.productSku,
    qty: row.qty,
    variantId: row.variantId,
    variantNameAr: row.variantNameAr,
    variantNameFr: row.variantNameFr,
    stock: row.variantStockQty ?? row.productStockQty,
    allowBackorder: row.productAllowBackorder,
    price: row.productDiscountPrice ?? row.productPrice,
    isActive: row.productIsActive && (row.variantId ? !!row.variantIsActive : true),
  }));

  const components: (AvailabilityComponent & LimitRef)[] = items.map((item) => ({
    qty: item.qty,
    stock: item.stock,
    allowBackorder: item.allowBackorder,
    nameAr: item.variantNameAr ?? item.productNameAr,
    nameFr: item.variantNameFr ?? item.productNameFr,
  }));
  const componentPriceSum = itemRows.reduce(
    (sum, row) => sum + (row.productDiscountPrice ?? row.productPrice) * row.qty,
    0,
  );

  return {
    ok: true,
    data: {
      ...bundle,
      itemCount: items.length,
      maxSellable: deriveMaxSellable(components),
      limitBy: deriveLimitingComponent(components),
      images,
      items,
      componentPriceSum,
    },
  };
}

const bundleItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  qty: z.number().int().min(1),
});

/** Just the money field, for the pricing gate's own before/after compare. */
const bundlePriceFieldSchema = z.object({ price: z.number().int().positive() });

const bundleBaseSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameFr: z.string().trim().min(1).max(200),
  descriptionAr: z.string().trim().max(4000).optional().nullable(),
  descriptionFr: z.string().trim().max(4000).optional().nullable(),
  price: z.number().int().positive(),
  isActive: z.boolean(),
  slug: z.string().trim().min(1).max(80),
  images: z.array(z.string().trim().min(1)).max(20).default([]),
  items: z.array(bundleItemInputSchema).min(1).max(50),
});

/**
 * A `bundle_items` row names a product and, optionally, one of *that
 * product's* variants. Zod only checks both are UUIDs, so a crafted payload
 * could pair product A with product B's variant — availability would then read
 * B's stock while `loadStockLines` decremented B's variant on a sale of A,
 * corrupting two products' inventory at once.
 */
async function itemsHaveValidParents(items: { productId: string; variantId?: string | null }[]): Promise<boolean> {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const variantIds = [...new Set(items.map((item) => item.variantId).filter((id): id is string => !!id))];

  const [productRows, variantRows] = await Promise.all([
    productIds.length
      ? db.select({ id: products.id }).from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
    variantIds.length
      ? db
          .select({ id: productVariants.id, productId: productVariants.productId })
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
      : Promise.resolve([]),
  ]);

  if (productRows.length !== productIds.length || variantRows.length !== variantIds.length) return false;

  const parentByVariant = new Map(variantRows.map((row) => [row.id, row.productId]));
  return items.every((item) => !item.variantId || parentByVariant.get(item.variantId) === item.productId);
}

async function resolveUniqueBundleSlug(
  requestedSlug: string,
  nameFr: string,
  excludeId?: string,
): Promise<string | null> {
  const base = slugify(requestedSlug) || slugify(nameFr);
  const [existing] = await db.select({ id: bundles.id }).from(bundles).where(eq(bundles.slug, base)).limit(1);

  if (existing && existing.id !== excludeId) return null;
  return base;
}

// Same rule as `createProduct`: a bundle is created with its price.
export async function createBundle(input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.pricing");
  if (!auth.ok) return auth;

  const t = await getTranslations("bundleErrors");
  return createBundleCore(input, { invalidInput: t("invalidInput"), slugTaken: t("slugTaken") });
}

export async function createBundleCore(
  input: unknown,
  messages: BundleMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = bundleBaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  if (!(await itemsHaveValidParents(parsed.data.items))) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const slug = await resolveUniqueBundleSlug(parsed.data.slug, parsed.data.nameFr);
  if (!slug) {
    return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
  }

  let created: { id: string };
  try {
    created = await insertWithUniqueSku(bundles, bundles.sku, "B", "bundles_sku_unique", (sku) =>
      db
        .insert(bundles)
        .values({
          nameAr: parsed.data.nameAr,
          nameFr: parsed.data.nameFr,
          descriptionAr: parsed.data.descriptionAr ?? null,
          descriptionFr: parsed.data.descriptionFr ?? null,
          slug,
          price: parsed.data.price,
          sku,
          isActive: parsed.data.isActive,
        })
        .returning({ id: bundles.id })
        .then(([row]) => row),
    );
  } catch (error) {
    // Check-then-insert is not atomic; see `createProductCore`.
    if (isUniqueViolation(error, "bundles_slug_unique")) {
      return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
    }
    throw error;
  }

  if (parsed.data.images.length) {
    await db
      .insert(bundleImages)
      .values(parsed.data.images.map((publicId, sort) => ({ bundleId: created.id, publicId, sort })));
  }

  await db.insert(bundleItems).values(
    parsed.data.items.map((item) => ({
      bundleId: created.id,
      productId: item.productId,
      variantId: item.variantId ?? null,
      qty: item.qty,
    })),
  );

  return { ok: true, data: { id: created.id } };
}

/** Price changes need `catalog.pricing`; everything else needs only `catalog.manage` — same delta-based check as `updateProduct`. */
export async function updateBundle(id: string, input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("bundleErrors");

  if (!can(auth.data, "catalog.pricing")) {
    const parsedPrice = bundlePriceFieldSchema.safeParse(input);
    if (!parsedPrice.success) {
      return { ok: false, error: { code: "VALIDATION", message: t("invalidInput") } };
    }

    const [current] = await db
      .select({ price: bundles.price })
      .from(bundles)
      .where(eq(bundles.id, id))
      .limit(1);

    if (!current) {
      return { ok: false, error: { code: "NOT_FOUND", message: t("notFound") } };
    }

    if (parsedPrice.data.price !== current.price) {
      const tAuth = await getTranslations("authErrors");
      return { ok: false, error: { code: "FORBIDDEN", message: tAuth("priceForbidden") } };
    }
  }

  return updateBundleCore(id, input, { invalidInput: t("invalidInput"), slugTaken: t("slugTaken") });
}

export async function updateBundleCore(
  id: string,
  input: unknown,
  messages: BundleMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = bundleBaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  if (!(await itemsHaveValidParents(parsed.data.items))) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const slug = await resolveUniqueBundleSlug(parsed.data.slug, parsed.data.nameFr, id);
  if (!slug) {
    return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
  }

  await db
    .update(bundles)
    .set({
      nameAr: parsed.data.nameAr,
      nameFr: parsed.data.nameFr,
      descriptionAr: parsed.data.descriptionAr ?? null,
      descriptionFr: parsed.data.descriptionFr ?? null,
      slug,
      price: parsed.data.price,
      isActive: parsed.data.isActive,
    })
    .where(eq(bundles.id, id));

  // Same rule as `updateProductCore`: the remote asset goes only once the save
  // has committed, never on the click that removed it from the form.
  const previousImages = await db
    .select({ publicId: bundleImages.publicId })
    .from(bundleImages)
    .where(eq(bundleImages.bundleId, id));
  const kept = new Set(parsed.data.images);
  const orphaned = previousImages.map((row) => row.publicId).filter((publicId) => !kept.has(publicId));

  await db.delete(bundleImages).where(eq(bundleImages.bundleId, id));
  if (parsed.data.images.length) {
    await db
      .insert(bundleImages)
      .values(parsed.data.images.map((publicId, sort) => ({ bundleId: id, publicId, sort })));
  }

  // Items carry no independent identity worth diffing (no stock movements or
  // history tied to a bundle_items row) — replace the set wholesale, same as
  // images above.
  await db.delete(bundleItems).where(eq(bundleItems.bundleId, id));
  await db.insert(bundleItems).values(
    parsed.data.items.map((item) => ({
      bundleId: id,
      productId: item.productId,
      variantId: item.variantId ?? null,
      qty: item.qty,
    })),
  );

  await destroyCloudinaryAssets(orphaned);

  return { ok: true, data: { id } };
}

export type ToggleBundleActiveResult = { id: string };

export async function toggleBundleActive(
  id: string,
  isActive: boolean,
): Promise<ServiceResult<ToggleBundleActiveResult>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  return toggleBundleActiveCore(id, isActive);
}

export async function toggleBundleActiveCore(
  id: string,
  isActive: boolean,
): Promise<ServiceResult<ToggleBundleActiveResult>> {
  await db.update(bundles).set({ isActive }).where(eq(bundles.id, id));
  return { ok: true, data: { id } };
}

export type DeleteBundleMessages = {
  deleteBlockedByOrders: string;
};

export async function deleteBundle(id: string): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("bundleErrors");
  return deleteBundleCore(id, { deleteBlockedByOrders: t("deleteBlockedByOrders") });
}

export async function deleteBundleCore(
  id: string,
  messages: DeleteBundleMessages,
): Promise<ServiceResult<{ id: string }>> {
  // Order history hard-references the bundle (no onDelete) — deleting would be
  // a referential-integrity violation, so the bundle is treated as "must
  // keep": deactivate it instead (same rule as products). bundle_images,
  // bundle_items and promotion_items all cascade with the row.
  const [orderReference] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.bundleId, id))
    .limit(1);
  if (orderReference) {
    return { ok: false, error: { code: "CONFLICT", message: messages.deleteBlockedByOrders } };
  }

  const imageRows = await db
    .select({ publicId: bundleImages.publicId })
    .from(bundleImages)
    .where(eq(bundleImages.bundleId, id));

  await db.delete(bundles).where(eq(bundles.id, id));

  // The rows cascade; the Cloudinary assets behind them do not.
  await destroyCloudinaryAssets(imageRows.map((row) => row.publicId));

  return { ok: true, data: { id } };
}

/**
 * Deactivates every currently-active bundle that has `productId` as a
 * component, returning the affected bundles so the caller (product
 * deactivation) can warn about them — task-07's "deactivating a component
 * product marks dependent bundles inactive with a warning listing them".
 */
export async function deactivateDependentBundlesCore(productId: string): Promise<DeactivatedBundleRef[]> {
  const affected = await db
    .selectDistinct({ id: bundles.id, nameAr: bundles.nameAr, nameFr: bundles.nameFr })
    .from(bundles)
    .innerJoin(bundleItems, eq(bundleItems.bundleId, bundles.id))
    .where(and(eq(bundleItems.productId, productId), eq(bundles.isActive, true)));

  if (affected.length) {
    await db
      .update(bundles)
      .set({ isActive: false })
      .where(
        inArray(
          bundles.id,
          affected.map((bundle) => bundle.id),
        ),
      );
  }

  return affected;
}

export type BundleDependency = { id: string; nameAr: string; nameFr: string };

/**
 * Active bundles per component product, for the whole list in one query —
 * the product list needs it to warn *before* a deactivation, since the
 * cascade is one-way (`toggleProductActiveCore` never reactivates a bundle).
 */
export async function listBundleDependenciesByProduct(): Promise<Map<string, BundleDependency[]>> {
  const rows = await db
    .selectDistinct({
      productId: bundleItems.productId,
      id: bundles.id,
      nameAr: bundles.nameAr,
      nameFr: bundles.nameFr,
    })
    .from(bundleItems)
    .innerJoin(bundles, eq(bundleItems.bundleId, bundles.id))
    .where(eq(bundles.isActive, true));

  const byProduct = new Map<string, BundleDependency[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({ id: row.id, nameAr: row.nameAr, nameFr: row.nameFr });
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

export type BundlePickerVariant = {
  id: string;
  nameAr: string;
  nameFr: string;
};

export type BundlePickerProduct = {
  id: string;
  nameAr: string;
  nameFr: string;
  sku: string;
  price: number;
  discountPrice: number | null;
  stockQty: number;
  allowBackorder: boolean;
  categoryNameAr: string;
  categoryNameFr: string;
  variants: BundlePickerVariant[];
};

/** Every active product (with its active variants) — source list for the bundle item picker's client-side search. */
export async function listBundlePickerProducts(): Promise<ServiceResult<BundlePickerProduct[]>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const productRows = await db
    .select({
      id: products.id,
      nameAr: products.nameAr,
      nameFr: products.nameFr,
      sku: products.sku,
      price: products.price,
      discountPrice: products.discountPrice,
      stockQty: products.stockQty,
      allowBackorder: products.allowBackorder,
      categoryNameAr: categories.nameAr,
      categoryNameFr: categories.nameFr,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(products.nameFr));

  const variantRows = productRows.length
    ? await db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          nameAr: productVariants.nameAr,
          nameFr: productVariants.nameFr,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.isActive, true),
            inArray(
              productVariants.productId,
              productRows.map((p) => p.id),
            ),
          ),
        )
        .orderBy(asc(productVariants.createdAt))
    : [];

  return {
    ok: true,
    data: productRows.map((product) => ({
      ...product,
      variants: variantRows
        .filter((variant) => variant.productId === product.id)
        .map((variant) => ({ id: variant.id, nameAr: variant.nameAr, nameFr: variant.nameFr })),
    })),
  };
}
