import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import {
  bundleItems,
  categories,
  orderItems,
  productImages,
  products,
  productVariants,
  stockMovements,
  variantImages,
} from "@/src/db/schema";
import { destroyCloudinaryAssets } from "@/src/lib/cloudinary-sign";
import { isUniqueViolation } from "@/src/lib/db-errors";
import type { ServiceResult } from "@/src/lib/errors";
import { containsTerm } from "@/src/lib/search";
import { slugify } from "@/src/lib/slug";
import { insertWithUniqueSku } from "@/src/lib/sku";
import { can, requirePermission } from "@/src/services/authz";
import { deactivateDependentBundlesCore, type DeactivatedBundleRef } from "@/src/services/bundles";
import { maxFixedDiscountForProduct } from "@/src/services/promotions";

export type ProductListItem = {
  id: string;
  nameAr: string;
  nameFr: string;
  slug: string;
  sku: string;
  categoryId: string;
  categoryNameAr: string;
  categoryNameFr: string;
  price: number;
  discountPrice: number | null;
  stockQty: number;
  lowStockThreshold: number;
  allowBackorder: boolean;
  isActive: boolean;
  isQuickPick: boolean;
  quickPickSort: number | null;
};

type ImageRef = { publicId: string; sort: number };

export type ProductVariantDetail = {
  id: string;
  nameAr: string;
  nameFr: string;
  colorHex: string | null;
  sku: string;
  stockQty: number | null;
  isActive: boolean;
  images: ImageRef[];
};

export type ProductDetail = ProductListItem & {
  descriptionAr: string | null;
  descriptionFr: string | null;
  images: ImageRef[];
  variants: ProductVariantDetail[];
};

export type ProductMessages = {
  invalidInput: string;
  discountTooHigh: string;
  slugTaken: string;
  /** A live fixed-value promotion would take this new price to nothing. */
  priceBelowPromo: string;
};

const PRODUCT_SELECT = {
  id: products.id,
  nameAr: products.nameAr,
  nameFr: products.nameFr,
  slug: products.slug,
  sku: products.sku,
  categoryId: products.categoryId,
  categoryNameAr: categories.nameAr,
  categoryNameFr: categories.nameFr,
  price: products.price,
  discountPrice: products.discountPrice,
  stockQty: products.stockQty,
  lowStockThreshold: products.lowStockThreshold,
  allowBackorder: products.allowBackorder,
  isActive: products.isActive,
  isQuickPick: products.isQuickPick,
  quickPickSort: products.quickPickSort,
};

export async function listProducts(filters: {
  search?: string;
  categoryId?: string;
  activeOnly?: boolean;
}): Promise<ServiceResult<ProductListItem[]>> {
  const auth = await requirePermission("catalog.view");
  if (!auth.ok) return auth;

  const conditions = [];
  const term = containsTerm(filters.search);
  if (term) {
    conditions.push(
      or(ilike(products.nameFr, term), ilike(products.nameAr, term), ilike(products.sku, term)),
    );
  }
  if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  if (filters.activeOnly) conditions.push(eq(products.isActive, true));

  const rows = await db
    .select(PRODUCT_SELECT)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(products.createdAt));

  return { ok: true, data: rows };
}

export async function getProduct(id: string): Promise<ServiceResult<ProductDetail>> {
  const auth = await requirePermission("catalog.view");
  if (!auth.ok) return auth;

  const t = await getTranslations("productErrors");

  const [product] = await db
    .select({
      ...PRODUCT_SELECT,
      descriptionAr: products.descriptionAr,
      descriptionFr: products.descriptionFr,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);

  if (!product) {
    return { ok: false, error: { code: "NOT_FOUND", message: t("notFound") } };
  }

  const images = await db
    .select({ publicId: productImages.publicId, sort: productImages.sort })
    .from(productImages)
    .where(eq(productImages.productId, id))
    .orderBy(asc(productImages.sort));

  const variantRows = await db
    .select({
      id: productVariants.id,
      nameAr: productVariants.nameAr,
      nameFr: productVariants.nameFr,
      colorHex: productVariants.colorHex,
      sku: productVariants.sku,
      stockQty: productVariants.stockQty,
      isActive: productVariants.isActive,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.createdAt));

  const variantIds = variantRows.map((v) => v.id);
  const variantImageRows = variantIds.length
    ? await db
        .select({
          variantId: variantImages.variantId,
          publicId: variantImages.publicId,
          sort: variantImages.sort,
        })
        .from(variantImages)
        .where(inArray(variantImages.variantId, variantIds))
        .orderBy(asc(variantImages.sort))
    : [];

  const variants: ProductVariantDetail[] = variantRows.map((variant) => ({
    ...variant,
    images: variantImageRows
      .filter((img) => img.variantId === variant.id)
      .map((img) => ({ publicId: img.publicId, sort: img.sort })),
  }));

  return { ok: true, data: { ...product, images, variants } };
}

const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  nameAr: z.string().trim().min(1).max(120),
  nameFr: z.string().trim().min(1).max(120),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional()
    .nullable(),
  stockQty: z.number().int().min(0).optional().nullable(),
  images: z.array(z.string().trim().min(1)).max(20).default([]),
});

const productBaseSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameFr: z.string().trim().min(1).max(200),
  descriptionAr: z.string().trim().max(4000).optional().nullable(),
  descriptionFr: z.string().trim().max(4000).optional().nullable(),
  categoryId: z.string().uuid(),
  price: z.number().int().positive(),
  discountPrice: z.number().int().positive().optional().nullable(),
  lowStockThreshold: z.number().int().min(0),
  allowBackorder: z.boolean(),
  isActive: z.boolean(),
  slug: z.string().trim().min(1).max(80),
  images: z.array(z.string().trim().min(1)).max(20).default([]),
  variants: z.array(variantInputSchema).max(30).default([]),
});

/** Just the money fields, for the pricing gate's own before/after compare. */
const productPriceFieldsSchema = z.object({
  price: z.number().int().positive(),
  discountPrice: z.number().int().positive().optional().nullable(),
});

const createProductSchema = productBaseSchema.extend({
  stockQty: z.number().int().min(0),
});

const updateProductSchema = productBaseSchema;

async function resolveUniqueProductSlug(
  requestedSlug: string,
  nameFr: string,
  excludeId?: string,
): Promise<string | null> {
  const base = slugify(requestedSlug) || slugify(nameFr);
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, base))
    .limit(1);

  if (existing && existing.id !== excludeId) return null;
  return base;
}

type VariantInput = z.infer<typeof variantInputSchema>;

/** Inserts every variant with no `id` (newly added on this save) — auto SKU, initial stock + a `restock` movement when a starting quantity is given. */
async function insertNewVariants(productId: string, variants: VariantInput[], actorId: string) {
  const newVariants = variants.filter((v) => !v.id);
  if (!newVariants.length) return;

  for (const variant of newVariants) {
    const created = await insertWithUniqueSku(
      productVariants,
      productVariants.sku,
      "V",
      "product_variants_sku_unique",
      (sku) =>
        db
          .insert(productVariants)
          .values({
            productId,
            nameAr: variant.nameAr,
            nameFr: variant.nameFr,
            colorHex: variant.colorHex ?? null,
            sku,
            stockQty: variant.stockQty ?? null,
          })
          .returning({ id: productVariants.id })
          .then(([row]) => row),
    );

    if (variant.images.length) {
      await db
        .insert(variantImages)
        .values(variant.images.map((publicId, sort) => ({ variantId: created.id, publicId, sort })));
    }

    if (variant.stockQty != null && variant.stockQty > 0) {
      await db.insert(stockMovements).values({
        productId,
        variantId: created.id,
        delta: variant.stockQty,
        reason: "restock",
        actorId,
      });
    }
  }
}

// Creating a product means setting its first price, so creation needs the
// pricing key as well as the catalog one — there is no priceless product to
// create and let someone else price later.
export async function createProduct(input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.pricing");
  if (!auth.ok) return auth;

  const t = await getTranslations("productErrors");
  return createProductCore(input, auth.data.id, {
    invalidInput: t("invalidInput"),
    discountTooHigh: t("discountTooHigh"),
    slugTaken: t("slugTaken"),
    priceBelowPromo: t("priceBelowPromo"),
  });
}

export async function createProductCore(
  input: unknown,
  actorId: string,
  messages: ProductMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  if (parsed.data.discountPrice != null && parsed.data.discountPrice >= parsed.data.price) {
    return { ok: false, error: { code: "VALIDATION", message: messages.discountTooHigh } };
  }

  const slug = await resolveUniqueProductSlug(parsed.data.slug, parsed.data.nameFr);
  if (!slug) {
    return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
  }

  let created: { id: string };
  try {
    created = await insertWithUniqueSku(products, products.sku, "P", "products_sku_unique", (sku) =>
      db
        .insert(products)
        .values({
          nameAr: parsed.data.nameAr,
          nameFr: parsed.data.nameFr,
          descriptionAr: parsed.data.descriptionAr ?? null,
          descriptionFr: parsed.data.descriptionFr ?? null,
          slug,
          categoryId: parsed.data.categoryId,
          price: parsed.data.price,
          discountPrice: parsed.data.discountPrice ?? null,
          sku,
          stockQty: parsed.data.stockQty,
          lowStockThreshold: parsed.data.lowStockThreshold,
          allowBackorder: parsed.data.allowBackorder,
          isActive: parsed.data.isActive,
        })
        .returning({ id: products.id })
        .then(([row]) => row),
    );
  } catch (error) {
    // `resolveUniqueProductSlug` checks first, but check-then-insert is not
    // atomic; a concurrent create claiming the same slug used to surface the
    // raw Postgres 23505 as an unhandled action error instead of the message
    // this function already prepared for exactly that outcome.
    if (isUniqueViolation(error, "products_slug_unique")) {
      return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
    }
    throw error;
  }

  if (parsed.data.images.length) {
    await db
      .insert(productImages)
      .values(parsed.data.images.map((publicId, sort) => ({ productId: created.id, publicId, sort })));
  }

  if (parsed.data.stockQty > 0) {
    await db.insert(stockMovements).values({
      productId: created.id,
      delta: parsed.data.stockQty,
      reason: "restock",
      actorId,
    });
  }

  await insertNewVariants(created.id, parsed.data.variants, actorId);

  return { ok: true, data: { id: created.id } };
}

/**
 * `catalog.manage` edits the product; `catalog.pricing` is checked only
 * against the two money fields, and only when they actually change. Someone
 * who may fix a typo in a product name but may not reprice it can therefore
 * save the form — the gate is on the delta, not on the payload containing a
 * price at all (every save posts the whole product, including its price).
 */
export async function updateProduct(
  id: string,
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("productErrors");

  if (!can(auth.data, "catalog.pricing")) {
    const parsedPrice = productPriceFieldsSchema.safeParse(input);
    if (!parsedPrice.success) {
      return { ok: false, error: { code: "VALIDATION", message: t("invalidInput") } };
    }

    const [current] = await db
      .select({ price: products.price, discountPrice: products.discountPrice })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!current) {
      return { ok: false, error: { code: "NOT_FOUND", message: t("notFound") } };
    }

    if (
      parsedPrice.data.price !== current.price ||
      (parsedPrice.data.discountPrice ?? null) !== current.discountPrice
    ) {
      const tAuth = await getTranslations("authErrors");
      return { ok: false, error: { code: "FORBIDDEN", message: tAuth("priceForbidden") } };
    }
  }

  return updateProductCore(id, input, auth.data.id, {
    invalidInput: t("invalidInput"),
    discountTooHigh: t("discountTooHigh"),
    slugTaken: t("slugTaken"),
    priceBelowPromo: t("priceBelowPromo"),
  });
}

export async function updateProductCore(
  id: string,
  input: unknown,
  actorId: string,
  messages: ProductMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  if (parsed.data.discountPrice != null && parsed.data.discountPrice >= parsed.data.price) {
    return { ok: false, error: { code: "VALIDATION", message: messages.discountTooHigh } };
  }

  // A `fixed` promotion is validated against its covered items when *it* is
  // saved, but nothing re-validated it when a covered product's price moved
  // afterwards — a 500 MRU discount left standing over an item repriced to 400
  // resolved to a free product. Pricing floors this at runtime too; refusing
  // here is what lets the owner see why.
  const lowestPrice = Math.min(parsed.data.price, parsed.data.discountPrice ?? parsed.data.price);
  const maxFixedDiscount = await maxFixedDiscountForProduct(id);
  if (maxFixedDiscount != null && maxFixedDiscount >= lowestPrice) {
    return { ok: false, error: { code: "CONFLICT", message: messages.priceBelowPromo } };
  }

  const slug = await resolveUniqueProductSlug(parsed.data.slug, parsed.data.nameFr, id);
  if (!slug) {
    return { ok: false, error: { code: "CONFLICT", message: messages.slugTaken } };
  }

  await db
    .update(products)
    .set({
      nameAr: parsed.data.nameAr,
      nameFr: parsed.data.nameFr,
      descriptionAr: parsed.data.descriptionAr ?? null,
      descriptionFr: parsed.data.descriptionFr ?? null,
      slug,
      categoryId: parsed.data.categoryId,
      price: parsed.data.price,
      discountPrice: parsed.data.discountPrice ?? null,
      lowStockThreshold: parsed.data.lowStockThreshold,
      allowBackorder: parsed.data.allowBackorder,
      isActive: parsed.data.isActive,
    })
    .where(eq(products.id, id));

  // Deactivating a product here (via the edit form's "active" checkbox, not
  // just the list's quick toggle below) cascades the same way — a bundle
  // that depends on an inactive component can't be sold either.
  if (!parsed.data.isActive) {
    await deactivateDependentBundlesCore(id);
  }

  // Cloudinary assets are dropped *here*, after the save has committed — not
  // in the browser the moment someone clicks the remove button. Deleting on
  // click destroyed the asset while the row still referenced it, so abandoning
  // the form (or hitting a validation error) left a live product page pointing
  // at an image that no longer existed.
  const orphaned: string[] = [];

  const previousImages = await db
    .select({ publicId: productImages.publicId })
    .from(productImages)
    .where(eq(productImages.productId, id));
  const keptImages = new Set(parsed.data.images);
  orphaned.push(...previousImages.map((row) => row.publicId).filter((publicId) => !keptImages.has(publicId)));

  await db.delete(productImages).where(eq(productImages.productId, id));
  if (parsed.data.images.length) {
    await db
      .insert(productImages)
      .values(parsed.data.images.map((publicId, sort) => ({ productId: id, publicId, sort })));
  }

  const existingVariants = parsed.data.variants.filter(
    (v): v is VariantInput & { id: string } => !!v.id,
  );
  for (const variant of existingVariants) {
    // Scoped to this product. `WHERE id = ...` alone let a crafted payload
    // rename or re-image a variant belonging to a different product.
    const updated = await db
      .update(productVariants)
      .set({
        nameAr: variant.nameAr,
        nameFr: variant.nameFr,
        colorHex: variant.colorHex ?? null,
      })
      .where(and(eq(productVariants.id, variant.id), eq(productVariants.productId, id)))
      .returning({ id: productVariants.id });
    if (!updated.length) continue;

    const previousVariantImages = await db
      .select({ publicId: variantImages.publicId })
      .from(variantImages)
      .where(eq(variantImages.variantId, variant.id));
    const keptVariantImages = new Set(variant.images);
    orphaned.push(
      ...previousVariantImages.map((row) => row.publicId).filter((publicId) => !keptVariantImages.has(publicId)),
    );

    await db.delete(variantImages).where(eq(variantImages.variantId, variant.id));
    if (variant.images.length) {
      await db
        .insert(variantImages)
        .values(variant.images.map((publicId, sort) => ({ variantId: variant.id, publicId, sort })));
    }
  }

  await insertNewVariants(id, parsed.data.variants, actorId);

  await destroyCloudinaryAssets(orphaned);

  return { ok: true, data: { id } };
}

export type DeleteProductMessages = {
  deleteBlockedByOrders: string;
  deleteBlockedByMovements: string;
};

export async function deleteProduct(id: string): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  const t = await getTranslations("productErrors");
  return deleteProductCore(id, {
    deleteBlockedByOrders: t("deleteBlockedByOrders"),
    deleteBlockedByMovements: t("deleteBlockedByMovements"),
  });
}

export async function deleteProductCore(
  id: string,
  messages: DeleteProductMessages,
): Promise<ServiceResult<{ id: string }>> {
  // Order history and stock history both hard-reference the product (no
  // onDelete) — deleting would be a referential-integrity violation, so the
  // product is treated as "must keep": deactivate it instead.
  const [orderReference] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1);
  if (orderReference) {
    return { ok: false, error: { code: "CONFLICT", message: messages.deleteBlockedByOrders } };
  }

  const [movementReference] = await db
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(eq(stockMovements.productId, id))
    .limit(1);
  if (movementReference) {
    return { ok: false, error: { code: "CONFLICT", message: messages.deleteBlockedByMovements } };
  }

  // `bundleItems` hard-references the product (no onDelete), so its rows must
  // go first — and any bundle depending on the deleted product can no longer
  // be sold, so deactivate those bundles too (same rule as deactivation).
  await deactivateDependentBundlesCore(id);
  await db.delete(bundleItems).where(eq(bundleItems.productId, id));

  // The image rows cascade with the product; the Cloudinary assets they point
  // at do not, so collect them before the cascade takes the addresses away.
  const [productImageRows, variantImageRows] = await Promise.all([
    db.select({ publicId: productImages.publicId }).from(productImages).where(eq(productImages.productId, id)),
    db
      .select({ publicId: variantImages.publicId })
      .from(variantImages)
      .innerJoin(productVariants, eq(variantImages.variantId, productVariants.id))
      .where(eq(productVariants.productId, id)),
  ]);

  // productImages / productVariants / promotion_items cascade with the row.
  await db.delete(products).where(eq(products.id, id));

  await destroyCloudinaryAssets([
    ...productImageRows.map((row) => row.publicId),
    ...variantImageRows.map((row) => row.publicId),
  ]);

  return { ok: true, data: { id } };
}

export type ToggleProductActiveResult = { id: string; deactivatedBundles: DeactivatedBundleRef[] };

export async function toggleProductActive(
  id: string,
  isActive: boolean,
): Promise<ServiceResult<ToggleProductActiveResult>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  return toggleProductActiveCore(id, isActive);
}

export async function toggleProductActiveCore(
  id: string,
  isActive: boolean,
): Promise<ServiceResult<ToggleProductActiveResult>> {
  await db.update(products).set({ isActive }).where(eq(products.id, id));

  // Deactivating a component product marks its dependent bundles inactive
  // too (task-07 scope) — reactivating a product never reactivates bundles,
  // since a bundle may depend on several products and re-enabling it is an
  // admin decision, not an automatic one.
  const deactivatedBundles = isActive ? [] : await deactivateDependentBundlesCore(id);

  return { ok: true, data: { id, deactivatedBundles } };
}

export async function toggleVariantActive(
  id: string,
  isActive: boolean,
): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  await db.update(productVariants).set({ isActive }).where(eq(productVariants.id, id));
  return { ok: true, data: { id } };
}

// ---------------------------------------------------------------------------
// Task 14 — POS quick-pick grid membership + order (admin-managed, from the
// product list; the grid itself is read-only for staff).
// ---------------------------------------------------------------------------

export async function toggleQuickPick(id: string, isQuickPick: boolean): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  return toggleQuickPickCore(id, isQuickPick);
}

export async function toggleQuickPickCore(id: string, isQuickPick: boolean): Promise<ServiceResult<{ id: string }>> {
  if (isQuickPick) {
    // Newly pinned products land last in the grid — `reorderQuickPicks`
    // (the product list's up/down controls) is how an admin moves one up.
    const [{ value: nextSort }] = await db
      .select({ value: count() })
      .from(products)
      .where(eq(products.isQuickPick, true));
    await db.update(products).set({ isQuickPick: true, quickPickSort: nextSort }).where(eq(products.id, id));
  } else {
    await db.update(products).set({ isQuickPick: false, quickPickSort: null }).where(eq(products.id, id));
  }

  return { ok: true, data: { id } };
}

export async function reorderQuickPicks(orderedIds: string[]): Promise<ServiceResult<null>> {
  const auth = await requirePermission("catalog.manage");
  if (!auth.ok) return auth;

  await Promise.all(
    orderedIds.map((id, index) => db.update(products).set({ quickPickSort: index }).where(eq(products.id, id))),
  );

  return { ok: true, data: null };
}
