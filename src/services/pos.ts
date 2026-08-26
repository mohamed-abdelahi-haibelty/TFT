import { and, asc, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, withTransaction, type Tx } from "@/src/db/client";
import {
  bundleItems,
  bundles,
  categories,
  orderEvents,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
} from "@/src/db/schema";
import { type AvailabilityComponent, deriveMaxSellable } from "@/src/lib/bundle-availability";
import { isUniqueViolation } from "@/src/lib/db-errors";
import type { ServiceResult } from "@/src/lib/errors";
import { localized } from "@/src/lib/locale-text";
import { insertWithUniqueOrderCode } from "@/src/lib/order-code";
import { track } from "@/src/lib/analytics";
import { getEffectivePrice, getEffectivePrices, type PricingItem } from "@/src/services/pricing";
import { can, requirePermission } from "@/src/services/authz";
import {
  InsufficientStockError,
  type StockLevel,
  decrementStockLine,
  incrementStockLine,
  loadStockLines,
  type StockLine,
  type StockLineSource,
} from "@/src/services/orders";

// ---------------------------------------------------------------------------
// Task 14 — POS: in-person counter sales
// ---------------------------------------------------------------------------

export type PosMessages = {
  invalidInput: string;
  itemUnavailable: string;
  insufficientStock: string;
  overrideForbidden: string;
};

async function getPosMessages(): Promise<PosMessages> {
  const t = await getTranslations("posErrors");
  return {
    invalidInput: t("invalidInput"),
    itemUnavailable: t("itemUnavailable"),
    insufficientStock: t("insufficientStock"),
    overrideForbidden: t("overrideForbidden"),
  };
}

// --- Product/bundle grid --------------------------------------------------

/**
 * One shared shape for every tile the POS browsing grid renders — the
 * curated quick-pick set and the full searchable catalog alike carry price,
 * stock, and image, so the UI has exactly one big-image card component
 * instead of a curated-tile/plain-row split.
 */
export type PosGridItem = {
  kind: "product" | "bundle";
  id: string;
  /**
   * The same three-way identity `PosResolvedLine` carries, so the register can
   * turn a tapped tile straight into a cart line. Without it a tile only knew
   * its own `id` — the *variant* id for a variant row, with no way back to the
   * parent product — so every tap had to ask the server who it had just
   * touched, which is roughly seven round trips per item added to a basket.
   */
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  sku: string;
  name: string;
  unitPrice: number;
  promo: boolean;
  /** `null` = not tracked at this granularity (a bundle); never shown as "out of stock". */
  stockQty: number | null;
  allowBackorder: boolean;
  categoryId: string | null;
  imagePublicId: string | null;
};

/**
 * Exactly the columns a `PosGridItem` needs, and nothing else.
 *
 * These reads used to be a bare `db.select()`, which drags `description_ar` /
 * `description_fr` — the largest text columns in the schema — across the wire
 * for every row in the catalog, on the one page that is open all day at the
 * counter. Neon's Free plan meters egress (5 GB/month) alongside compute, and
 * the register is the heaviest repeat reader there is.
 */
const POS_PRODUCT_SELECT = {
  id: products.id,
  sku: products.sku,
  nameAr: products.nameAr,
  nameFr: products.nameFr,
  price: products.price,
  discountPrice: products.discountPrice,
  stockQty: products.stockQty,
  allowBackorder: products.allowBackorder,
  categoryId: products.categoryId,
};

const POS_BUNDLE_SELECT = {
  id: bundles.id,
  sku: bundles.sku,
  nameAr: bundles.nameAr,
  nameFr: bundles.nameFr,
  price: bundles.price,
};

/** First image (by `sort`) for each of the given products, keyed by product id. */
async function firstImageByProduct(productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({ productId: productImages.productId, publicId: productImages.publicId })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sort), asc(productImages.createdAt));

  const byProduct = new Map<string, string>();
  for (const row of rows) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, row.publicId);
  }
  return byProduct;
}

/** Max sellable units per bundle, from its components' current stock — the grid's own copy of `deriveMaxSellable`, in one query for the whole list. */
async function posBundleAvailability(bundleIds: string[]): Promise<Map<string, { maxSellable: number | null }>> {
  if (bundleIds.length === 0) return new Map();

  const rows = await db
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

  const byBundle = new Map<string, AvailabilityComponent[]>();
  for (const row of rows) {
    const list = byBundle.get(row.bundleId) ?? [];
    list.push({ qty: row.qty, stock: row.variantStockQty ?? row.productStockQty, allowBackorder: row.allowBackorder });
    byBundle.set(row.bundleId, list);
  }

  const result = new Map<string, { maxSellable: number | null }>();
  // A bundle with no components at all derives to 0, same as everywhere else.
  for (const bundleId of bundleIds) {
    result.set(bundleId, { maxSellable: deriveMaxSellable(byBundle.get(bundleId) ?? []) });
  }
  return result;
}

/** What one box tile shows after a sale — `null` = unlimited, `0` = the availability badge. */
export type PosBundleLevel = { bundleId: string; maxSellable: number | null };

/**
 * Max sellable for *every* active bundle, in one query.
 *
 * Selling a component moves the availability of every box containing it, not
 * just the box that was sold, so the register cannot derive this for itself.
 * One query after a sale is what lets it stop re-fetching the entire catalog
 * to find out.
 */
async function activeBundleAvailability(tx: Tx): Promise<PosBundleLevel[]> {
  const rows = await tx
    .select({
      bundleId: bundles.id,
      qty: bundleItems.qty,
      variantStockQty: productVariants.stockQty,
      productStockQty: products.stockQty,
      allowBackorder: products.allowBackorder,
    })
    .from(bundles)
    .innerJoin(bundleItems, eq(bundleItems.bundleId, bundles.id))
    .innerJoin(products, eq(bundleItems.productId, products.id))
    .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
    .where(eq(bundles.isActive, true));

  const byBundle = new Map<string, AvailabilityComponent[]>();
  for (const row of rows) {
    const list = byBundle.get(row.bundleId) ?? [];
    list.push({ qty: row.qty, stock: row.variantStockQty ?? row.productStockQty, allowBackorder: row.allowBackorder });
    byBundle.set(row.bundleId, list);
  }

  return [...byBundle].map(([bundleId, components]) => ({ bundleId, maxSellable: deriveMaxSellable(components) }));
}

/** Active, pinned products only, in the admin-managed order — task 14: "products flagged `is_quick_pick`, ordered by `quick_pick_sort`." Both roles read this; only `products.ts`'s `toggleQuickPick`/`reorderQuickPicks` (admin-only) can change it. */
export async function listPosQuickPicks(locale: string): Promise<ServiceResult<PosGridItem[]>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  const rows = await db
    .select(POS_PRODUCT_SELECT)
    .from(products)
    .where(and(eq(products.isQuickPick, true), eq(products.isActive, true)))
    .orderBy(asc(products.quickPickSort), asc(products.createdAt));

  const [imageByProduct, priceByProduct] = await Promise.all([
    firstImageByProduct(rows.map((r) => r.id)),
    getEffectivePrices(
      rows.map((p) => ({ kind: "product" as const, id: p.id, price: p.price, discountPrice: p.discountPrice })),
      "pos",
      new Date(),
    ),
  ]);

  const items = rows.map((product): PosGridItem => {
    const effective = priceByProduct.get(product.id)!;
    return {
      kind: "product",
      id: product.id,
      productId: product.id,
      variantId: null,
      bundleId: null,
      sku: product.sku,
      name: localized(locale, product.nameAr, product.nameFr),
      unitPrice: effective.price,
      promo: !!effective.promo,
      stockQty: product.stockQty,
      allowBackorder: product.allowBackorder,
      categoryId: product.categoryId,
      imagePublicId: imageByProduct.get(product.id) ?? null,
    };
  });

  return { ok: true, data: items };
}

// --- Categories ----------------------------------------------------------

export type PosCategory = { id: string; name: string; slug: string };

/** Category tabs for POS browsing, in the admin-managed catalog order. */
export async function listPosCategories(locale: string): Promise<ServiceResult<PosCategory[]>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  const rows = await db.select().from(categories).orderBy(asc(categories.sort), asc(categories.createdAt));

  return {
    ok: true,
    data: rows.map((row) => ({ id: row.id, name: localized(locale, row.nameAr, row.nameFr), slug: row.slug })),
  };
}

// --- Full catalog: the primary browsing/search surface --------------------

/** The whole active catalog (products, variants, bundles), same shape as the quick-pick grid — client-filters this list, same "shop-scale catalog, filter client-side" convention as the counter-sheet (task 06) and order item picker (task 13). Selecting a result resolves it by SKU, the same code path a quick-pick tap uses. */
export async function listPosCatalog(locale: string): Promise<ServiceResult<PosGridItem[]>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  const [productRows, variantRows, bundleRows] = await Promise.all([
    db.select(POS_PRODUCT_SELECT).from(products).where(eq(products.isActive, true)),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        variantNameAr: productVariants.nameAr,
        variantNameFr: productVariants.nameFr,
        stockQty: productVariants.stockQty,
        productId: products.id,
        productNameAr: products.nameAr,
        productNameFr: products.nameFr,
        productPrice: products.price,
        productDiscountPrice: products.discountPrice,
        productStockQty: products.stockQty,
        productAllowBackorder: products.allowBackorder,
        categoryId: products.categoryId,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(eq(productVariants.isActive, true), eq(products.isActive, true))),
    db.select(POS_BUNDLE_SELECT).from(bundles).where(eq(bundles.isActive, true)),
  ]);

  const [imageByProduct, bundleAvailability, priceByItem] = await Promise.all([
    firstImageByProduct([...productRows.map((r) => r.id), ...variantRows.map((r) => r.productId)]),
    posBundleAvailability(bundleRows.map((row) => row.id)),
    getEffectivePrices(
      [
        ...productRows.map((p): PricingItem => ({ kind: "product", id: p.id, price: p.price, discountPrice: p.discountPrice })),
        // A variant carries no price of its own — priced via its parent product, same convention `resolvePosItemCore` uses.
        ...variantRows.map(
          (v): PricingItem => ({ kind: "product", id: v.productId, price: v.productPrice, discountPrice: v.productDiscountPrice }),
        ),
        ...bundleRows.map((b): PricingItem => ({ kind: "bundle", id: b.id, price: b.price })),
      ],
      "pos",
      new Date(),
    ),
  ]);

  const items: PosGridItem[] = [
    ...productRows.map((row): PosGridItem => {
      const effective = priceByItem.get(row.id)!;
      return {
        kind: "product",
        id: row.id,
        productId: row.id,
        variantId: null,
        bundleId: null,
        sku: row.sku,
        name: localized(locale, row.nameAr, row.nameFr),
        unitPrice: effective.price,
        promo: !!effective.promo,
        stockQty: row.stockQty,
        allowBackorder: row.allowBackorder,
        categoryId: row.categoryId,
        imagePublicId: imageByProduct.get(row.id) ?? null,
      };
    }),
    ...variantRows.map((row): PosGridItem => {
      const effective = priceByItem.get(row.productId)!;
      return {
        kind: "product",
        id: row.id,
        productId: row.productId,
        variantId: row.id,
        bundleId: null,
        sku: row.sku,
        name: `${localized(locale, row.productNameAr, row.productNameFr)} — ${localized(locale, row.variantNameAr, row.variantNameFr)}`,
        unitPrice: effective.price,
        promo: !!effective.promo,
        stockQty: row.stockQty ?? row.productStockQty,
        allowBackorder: row.productAllowBackorder,
        categoryId: row.categoryId,
        imagePublicId: imageByProduct.get(row.productId) ?? null,
      };
    }),
    ...bundleRows.map((row): PosGridItem => {
      const effective = priceByItem.get(row.id)!;
      // A bundle tile used to hard-code "unlimited", so the grid never marked
      // one out of stock and a cashier only found out after tapping it. This
      // is the same `deriveMaxSellable` the scan path (`resolvePosItemCore`)
      // and the storefront's own boxes list already report.
      const availability = bundleAvailability.get(row.id) ?? { maxSellable: 0 };
      return {
        kind: "bundle",
        id: row.id,
        productId: null,
        variantId: null,
        bundleId: row.id,
        sku: row.sku,
        name: localized(locale, row.nameAr, row.nameFr),
        unitPrice: effective.price,
        promo: !!effective.promo,
        stockQty: availability.maxSellable,
        allowBackorder: availability.maxSellable === null,
        categoryId: null,
        imagePublicId: null,
      };
    }),
  ];

  items.sort((a, b) => a.name.localeCompare(b.name, locale === "ar" ? "ar" : "fr"));

  return { ok: true, data: items };
}

// --- Item resolution: the one code path for a quick-pick tap and a
// manual-search pick alike -------------------------------------------------

export type PosResolvedLine = {
  kind: "product" | "bundle";
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  sku: string;
  name: string;
  unitPrice: number;
  promo: boolean;
  /** `null` = unlimited (a bundle whose every component allows backorder). */
  stockQty: number | null;
  allowBackorder: boolean;
};

export type PosLookupResult =
  | { status: "found"; line: PosResolvedLine }
  | { status: "not_found" }
  | { status: "inactive"; name: string };

const skuSchema = z.string().trim().min(1).max(64);

export async function resolvePosItem(rawSku: unknown, locale: string): Promise<ServiceResult<PosLookupResult>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  return resolvePosItemCore(rawSku, locale, await getPosMessages());
}

export async function resolvePosItemCore(
  rawSku: unknown,
  locale: string,
  messages: PosMessages,
): Promise<ServiceResult<PosLookupResult>> {
  const parsed = skuSchema.safeParse(rawSku);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  const sku = parsed.data;
  const now = new Date();

  const [variantRows, productRows, bundleRows] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.sku, sku)).limit(1),
    db.select().from(products).where(eq(products.sku, sku)).limit(1),
    db.select().from(bundles).where(eq(bundles.sku, sku)).limit(1),
  ]);

  if (variantRows.length) {
    const variant = variantRows[0];
    const [product] = await db.select().from(products).where(eq(products.id, variant.productId)).limit(1);
    if (!product) return { ok: true, data: { status: "not_found" } };

    const productName = localized(locale, product.nameAr, product.nameFr);
    const name = `${productName} — ${localized(locale, variant.nameAr, variant.nameFr)}`;
    if (!variant.isActive || !product.isActive) return { ok: true, data: { status: "inactive", name } };

    const effective = await getEffectivePrice(
      { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
      "pos",
      now,
    );

    return {
      ok: true,
      data: {
        status: "found",
        line: {
          kind: "product",
          productId: product.id,
          variantId: variant.id,
          bundleId: null,
          sku,
          name,
          unitPrice: effective.price,
          promo: !!effective.promo,
          stockQty: variant.stockQty ?? product.stockQty,
          allowBackorder: product.allowBackorder,
        },
      },
    };
  }

  if (productRows.length) {
    const product = productRows[0];
    const name = localized(locale, product.nameAr, product.nameFr);
    if (!product.isActive) return { ok: true, data: { status: "inactive", name } };

    const effective = await getEffectivePrice(
      { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
      "pos",
      now,
    );

    return {
      ok: true,
      data: {
        status: "found",
        line: {
          kind: "product",
          productId: product.id,
          variantId: null,
          bundleId: null,
          sku,
          name,
          unitPrice: effective.price,
          promo: !!effective.promo,
          stockQty: product.stockQty,
          allowBackorder: product.allowBackorder,
        },
      },
    };
  }

  if (bundleRows.length) {
    const bundle = bundleRows[0];
    const name = localized(locale, bundle.nameAr, bundle.nameFr);
    if (!bundle.isActive) return { ok: true, data: { status: "inactive", name } };

    const componentRows = await db
      .select({
        qty: bundleItems.qty,
        variantStockQty: productVariants.stockQty,
        productStockQty: products.stockQty,
        allowBackorder: products.allowBackorder,
      })
      .from(bundleItems)
      .innerJoin(products, eq(bundleItems.productId, products.id))
      .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
      .where(eq(bundleItems.bundleId, bundle.id));

    const components: AvailabilityComponent[] = componentRows.map((row) => ({
      qty: row.qty,
      stock: row.variantStockQty ?? row.productStockQty,
      allowBackorder: row.allowBackorder,
    }));
    const maxSellable = deriveMaxSellable(components);

    const effective = await getEffectivePrice({ kind: "bundle", id: bundle.id, price: bundle.price }, "pos", now);

    return {
      ok: true,
      data: {
        status: "found",
        line: {
          kind: "bundle",
          productId: null,
          variantId: null,
          bundleId: bundle.id,
          sku,
          name,
          unitPrice: effective.price,
          promo: !!effective.promo,
          stockQty: maxSellable,
          allowBackorder: maxSellable === null,
        },
      },
    };
  }

  return { ok: true, data: { status: "not_found" } };
}

// --- Complete sale ---------------------------------------------------------

const posLineSchema = z
  .object({
    kind: z.enum(["product", "bundle"]),
    productId: z.uuid().optional(),
    variantId: z.uuid().optional(),
    bundleId: z.uuid().optional(),
    qty: z.number().int().min(1).max(99),
    overridden: z.boolean().default(false),
  })
  .refine((line) => (line.kind === "product" ? !!line.productId : !!line.bundleId), {
    message: "productId or bundleId must match kind",
  });

const removedLineSchema = z.object({
  nameSnapshot: z.string().trim().min(1).max(300),
  unitPrice: z.number().int().min(0),
  qty: z.number().int().min(1).max(99),
  reason: z.enum(["added_by_mistake", "changed_mind"]),
});

const completeSaleSchema = z.object({
  locale: z.enum(["ar", "fr"]),
  paymentMethod: z.enum(["cash", "bankily", "masrvi", "sedad", "other"]),
  lines: z.array(posLineSchema).min(1).max(50),
  removedLines: z.array(removedLineSchema).max(50).default([]),
  /**
   * One key per sale at the register. A dropped response used to leave the
   * cashier retrying a sale the server had already recorded — double stock
   * decrement, double revenue, and both showing in the dashboard as real.
   */
  idempotencyKey: z.uuid().optional(),
});

export type CompleteSaleResult = {
  code: string;
  total: number;
  /**
   * Where the sale left every product and variant it touched, plus every
   * active bundle's availability — enough for the register to redraw its grid
   * in place.
   *
   * The register used to call `router.refresh()` here, which re-ran the whole
   * POS page: the full catalog, the quick picks, the category list and a
   * session read for each, after every single counter sale. That is the single
   * most repeated database workload in the shop, and none of it was needed to
   * answer "what changed?".
   *
   * Both are empty when a retry is answered from the idempotency index: the
   * sale already happened, so there is nothing new to report and the register
   * keeps whatever it already drew.
   */
  stockLevels: StockLevel[];
  bundleLevels: PosBundleLevel[];
};

/**
 * `pos.use` rings up a sale. An *override* is something else: it writes
 * recorded stock upward to cover a line the system says isn't there, which is
 * exactly the act `inventory.adjust` exists to gate. Without this check the
 * register quietly routed around the permission split — an account trusted
 * only to sell could move inventory arbitrarily by claiming an override, and
 * shrinkage became indistinguishable from a miscount in the movement log.
 */
export async function completeSale(input: unknown): Promise<ServiceResult<CompleteSaleResult>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  const messages = await getPosMessages();
  const wantsOverride =
    !!input &&
    typeof input === "object" &&
    Array.isArray((input as { lines?: unknown }).lines) &&
    (input as { lines: unknown[] }).lines.some(
      (line) => !!line && typeof line === "object" && (line as { overridden?: unknown }).overridden === true,
    );

  if (wantsOverride && !can(auth.data, "inventory.adjust")) {
    return { ok: false, error: { code: "FORBIDDEN", message: messages.overrideForbidden } };
  }

  return completeSaleCore(input, auth.data.id, messages);
}

type ResolvedSaleLine = {
  kind: "product" | "bundle";
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  nameSnapshot: string;
  basePrice: number;
  unitPrice: number;
  qty: number;
  overridden: boolean;
};

/**
 * A non-backorder line short on recorded stock, where the cashier has
 * explicitly overridden: the physical item exists (it was just rung up at the
 * counter), so the count is corrected up to exactly what is needed — a
 * `correction` movement, noted as such (task 14: "logged as a `correction`
 * context on the movement note") — before the normal atomic decrement.
 *
 * The decrement can still fail: another register may have taken the stock
 * between the read and the write. It throws when it does, and the transaction
 * takes the correction back out along with it. That used to require a written
 * ledger of every adjustment applied so far, replayed backwards on the way
 * out, with an override's upward correction easy to leave behind.
 */
async function decrementOrCorrect(tx: Tx, line: StockLine, orderId: string, actorId: string): Promise<StockLevel> {
  if (!line.allowBackorder && line.overridden) {
    const [currentQty] = line.usesVariantStock
      ? await tx.select({ q: productVariants.stockQty }).from(productVariants).where(eq(productVariants.id, line.variantId!)).limit(1)
      : await tx.select({ q: products.stockQty }).from(products).where(eq(products.id, line.productId)).limit(1);
    const shortfall = line.qty - (currentQty?.q ?? 0);
    if (shortfall > 0) {
      // `incrementStockLine` bumps by its line's own `qty`, not an arbitrary
      // delta — pass a shortfall-sized copy so only the missing amount is
      // corrected, not the whole sale quantity.
      await incrementStockLine(
        tx,
        { ...line, qty: shortfall },
        orderId,
        actorId,
        "correction",
        "POS override: recorded stock corrected to match a completed counter sale",
      );
    }
  }

  return decrementStockLine(tx, line, orderId, actorId, "pos_sale");
}

/** The already-recorded sale for this key, if the register is retrying. */
async function findSaleByIdempotencyKey(idempotencyKey: string): Promise<CompleteSaleResult | null> {
  const [order] = await db
    .select({ code: orders.code, total: orders.total })
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);

  return order ? { ...order, stockLevels: [], bundleLevels: [] } : null;
}

/**
 * Creates the order, its items, its events (including buffered line-removal
 * events) and every `pos_sale` stock movement as one transaction — the busiest
 * write path in the shop, and the one that most needs to be all-or-nothing.
 *
 * It used to be twenty-odd sequential HTTP requests with hand-written
 * compensating undo standing in for a rollback, because `neon-http` cannot
 * hold a transaction open. Now the whole sale is one connection and one
 * `COMMIT`; a line that cannot be supplied throws, and Postgres unwinds the
 * rest.
 *
 * Nothing about price or name is trusted from the client — every line is
 * re-resolved here against the same snapshot the writes land in, the same
 * discipline `createOrderCore` uses for the storefront.
 */
export async function completeSaleCore(
  input: unknown,
  actorId: string,
  messages: PosMessages,
): Promise<ServiceResult<CompleteSaleResult>> {
  const parsed = completeSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  const data = parsed.data;

  if (data.idempotencyKey) {
    const existing = await findSaleByIdempotencyKey(data.idempotencyKey);
    if (existing) return { ok: true, data: existing };
  }

  const productIds = [...new Set(data.lines.filter((l) => l.kind === "product").map((l) => l.productId!))];
  const variantIds = [...new Set(data.lines.filter((l) => l.kind === "product" && l.variantId).map((l) => l.variantId!))];
  const bundleIds = [...new Set(data.lines.filter((l) => l.kind === "bundle").map((l) => l.bundleId!))];
  const now = new Date();

  // Only feeds the analytics event below, which has to fire after the
  // commit rather than from inside it.
  let soldItemsCount = 0;

  try {
    const result = await withTransaction(async (tx): Promise<ServiceResult<CompleteSaleResult>> => {
      const [productRows, variantRows, bundleRows] = await Promise.all([
        productIds.length ? tx.select().from(products).where(inArray(products.id, productIds)) : Promise.resolve([]),
        variantIds.length ? tx.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : Promise.resolve([]),
        bundleIds.length ? tx.select().from(bundles).where(inArray(bundles.id, bundleIds)) : Promise.resolve([]),
      ]);

      const productById = new Map(productRows.map((row) => [row.id, row]));
      const variantById = new Map(variantRows.map((row) => [row.id, row]));
      const bundleById = new Map(bundleRows.map((row) => [row.id, row]));

      const unavailable: string[] = [];
      const resolved: ResolvedSaleLine[] = [];

      // One promotion query for the whole basket, not one per line, and read
      // through `tx` so the price charged comes from the same snapshot the
      // sale is written into.
      const prices = await getEffectivePrices(
        [
          ...productRows.map((row): PricingItem => ({
            kind: "product",
            id: row.id,
            price: row.price,
            discountPrice: row.discountPrice,
          })),
          ...bundleRows.map((row): PricingItem => ({ kind: "bundle", id: row.id, price: row.price })),
        ],
        "pos",
        now,
        tx,
      );

      for (const line of data.lines) {
        if (line.kind === "product") {
          const product = productById.get(line.productId!);
          if (!product || !product.isActive) {
            unavailable.push(line.productId!);
            continue;
          }
          let variant: (typeof variantRows)[number] | null = null;
          if (line.variantId) {
            variant = variantById.get(line.variantId) ?? null;
            if (!variant || !variant.isActive || variant.productId !== product.id) {
              unavailable.push(line.variantId);
              continue;
            }
          }

          const effective = prices.get(product.id) ?? { price: product.price };
          const productName = localized(data.locale, product.nameAr, product.nameFr);
          resolved.push({
            kind: "product",
            productId: product.id,
            variantId: variant?.id ?? null,
            bundleId: null,
            nameSnapshot: variant ? `${productName} — ${localized(data.locale, variant.nameAr, variant.nameFr)}` : productName,
            basePrice: product.price,
            unitPrice: effective.price,
            qty: line.qty,
            overridden: line.overridden,
          });
        } else {
          const bundle = bundleById.get(line.bundleId!);
          if (!bundle || !bundle.isActive) {
            unavailable.push(line.bundleId!);
            continue;
          }

          const effective = prices.get(bundle.id) ?? { price: bundle.price };
          resolved.push({
            kind: "bundle",
            productId: null,
            variantId: null,
            bundleId: bundle.id,
            nameSnapshot: localized(data.locale, bundle.nameAr, bundle.nameFr),
            basePrice: bundle.price,
            unitPrice: effective.price,
            qty: line.qty,
            overridden: line.overridden,
          });
        }
      }

      // Nothing has been written yet, so returning here commits an empty
      // transaction rather than needing to roll one back.
      if (unavailable.length > 0) {
        return { ok: false, error: { code: "CONFLICT", message: messages.itemUnavailable, details: { unavailable } } };
      }

      const subtotal = resolved.reduce((sum, line) => sum + line.basePrice * line.qty, 0);
      const total = resolved.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

      const created = await insertWithUniqueOrderCode(tx, now, (code) =>
        tx
          .insert(orders)
          .values({
            code,
            source: "pos",
            status: "delivered",
            paymentMethod: data.paymentMethod,
            subtotal,
            discountTotal: subtotal - total,
            total,
            createdBy: actorId,
            idempotencyKey: data.idempotencyKey ?? null,
          })
          .returning({ id: orders.id, code: orders.code })
          .then(([row]) => row),
      );

      await tx.insert(orderItems).values(
        resolved.map((line) => ({
          orderId: created.id,
          productId: line.productId,
          variantId: line.variantId,
          bundleId: line.bundleId,
          nameSnapshot: line.nameSnapshot,
          unitPrice: line.unitPrice,
          qty: line.qty,
        })),
      );

      // The `created` event and every buffered line removal in one insert,
      // where the removals used to be a statement apiece.
      await tx.insert(orderEvents).values([
        { orderId: created.id, actorId, type: "created" as const, payload: { source: "pos" } },
        ...data.removedLines.map((removed) => ({
          orderId: created.id,
          actorId,
          type: "line_removed" as const,
          payload: {
            itemId: null,
            before: { nameSnapshot: removed.nameSnapshot, unitPrice: removed.unitPrice, qty: removed.qty },
            after: null,
            reason: removed.reason,
          },
        })),
      ]);

      // One expansion for the whole basket. Each line's own `overridden` flag
      // rides along on the source, which is what used to force a separate
      // `loadStockLines` call per line.
      const stockLines = await loadStockLines(
        tx,
        resolved.map((line): StockLineSource => ({
          productId: line.productId,
          variantId: line.variantId,
          bundleId: line.bundleId,
          qty: line.qty,
          nameSnapshot: line.nameSnapshot,
          overridden: line.overridden,
        })),
      );

      const stockLevels: StockLevel[] = [];
      for (const line of stockLines) stockLevels.push(await decrementOrCorrect(tx, line, created.id, actorId));

      soldItemsCount = resolved.reduce((sum, line) => sum + line.qty, 0);

      return {
        ok: true,
        data: { code: created.code, total, stockLevels, bundleLevels: await activeBundleAvailability(tx) },
      };
    });

    // Reported after the commit, never from inside it — a sale that rolls back
    // must not show up in the analytics as one that happened.
    if (result.ok) {
      track("pos_sale_completed", {
        total: result.data.total,
        items_count: soldItemsCount,
        payment_method: data.paymentMethod,
      });
    }

    return result;
  } catch (error) {
    // A register retrying after a dropped response raced its own first
    // attempt. The index is the authority; the loser reports the winner's
    // sale, read outside the aborted transaction.
    if (data.idempotencyKey && isUniqueViolation(error, "orders_idempotency_key_unique")) {
      const existing = await findSaleByIdempotencyKey(data.idempotencyKey);
      if (existing) return { ok: true, data: existing };
    }
    if (error instanceof InsufficientStockError) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: messages.insufficientStock, details: { itemName: error.itemLabel } },
      };
    }
    throw error;
  }
}
