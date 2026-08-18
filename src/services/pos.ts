import { and, asc, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { bundleItems, bundles, orderEvents, orderItems, orders, productVariants, products } from "@/src/db/schema";
import { type AvailabilityComponent, deriveMaxSellable } from "@/src/lib/bundle-availability";
import type { ServiceResult } from "@/src/lib/errors";
import { localized } from "@/src/lib/locale-text";
import { insertWithUniqueOrderCode } from "@/src/lib/order-code";
import { track } from "@/src/lib/analytics";
import { getEffectivePrice } from "@/src/services/pricing";
import { requirePermission } from "@/src/services/authz";
import {
  decrementStockLine,
  incrementStockLine,
  loadStockLines,
  type StockLine,
  type StockLineSource,
} from "@/src/services/orders";

// ---------------------------------------------------------------------------
// Task 14 — POS: Scan Mode (in-person counter sales)
// ---------------------------------------------------------------------------

export type PosMessages = {
  invalidInput: string;
  itemUnavailable: string;
  insufficientStock: string;
};

async function getPosMessages(): Promise<PosMessages> {
  const t = await getTranslations("posErrors");
  return {
    invalidInput: t("invalidInput"),
    itemUnavailable: t("itemUnavailable"),
    insufficientStock: t("insufficientStock"),
  };
}

// --- Quick-pick grid ---------------------------------------------------

export type PosQuickPickItem = {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  promo: boolean;
  stockQty: number;
  allowBackorder: boolean;
};

/** Active, pinned products only, in the admin-managed order — task 14: "products flagged `is_quick_pick`, ordered by `quick_pick_sort`." Both roles read this; only `products.ts`'s `toggleQuickPick`/`reorderQuickPicks` (admin-only) can change it. */
export async function listPosQuickPicks(locale: string): Promise<ServiceResult<PosQuickPickItem[]>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isQuickPick, true), eq(products.isActive, true)))
    .orderBy(asc(products.quickPickSort), asc(products.createdAt));

  const now = new Date();
  const items = await Promise.all(
    rows.map(async (product): Promise<PosQuickPickItem> => {
      const effective = await getEffectivePrice(
        { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
        "pos",
        now,
      );
      return {
        id: product.id,
        sku: product.sku,
        name: localized(locale, product.nameAr, product.nameFr),
        unitPrice: effective.price,
        promo: !!effective.promo,
        stockQty: product.stockQty,
        allowBackorder: product.allowBackorder,
      };
    }),
  );

  return { ok: true, data: items };
}

// --- Manual fallback: search-by-name over the whole active catalog ------

export type PosCatalogItem = { kind: "product" | "bundle"; sku: string; name: string };

/** Lightweight name+SKU index for the manual picker (damaged/missing labels) — client-filters this list, same "shop-scale catalog, filter client-side" convention as the counter-sheet (task 06) and order item picker (task 13). Selecting a result re-scans by its SKU, so it's the identical code path as a physical scan. */
export async function listPosCatalog(locale: string): Promise<ServiceResult<PosCatalogItem[]>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  const [productRows, variantRows, bundleRows] = await Promise.all([
    db
      .select({ sku: products.sku, nameAr: products.nameAr, nameFr: products.nameFr })
      .from(products)
      .where(eq(products.isActive, true)),
    db
      .select({
        sku: productVariants.sku,
        variantNameAr: productVariants.nameAr,
        variantNameFr: productVariants.nameFr,
        productNameAr: products.nameAr,
        productNameFr: products.nameFr,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(eq(productVariants.isActive, true), eq(products.isActive, true))),
    db
      .select({ sku: bundles.sku, nameAr: bundles.nameAr, nameFr: bundles.nameFr })
      .from(bundles)
      .where(eq(bundles.isActive, true)),
  ]);

  const items: PosCatalogItem[] = [
    ...productRows.map((row) => ({ kind: "product" as const, sku: row.sku, name: localized(locale, row.nameAr, row.nameFr) })),
    ...variantRows.map((row) => ({
      kind: "product" as const,
      sku: row.sku,
      name: `${localized(locale, row.productNameAr, row.productNameFr)} — ${localized(locale, row.variantNameAr, row.variantNameFr)}`,
    })),
    ...bundleRows.map((row) => ({ kind: "bundle" as const, sku: row.sku, name: localized(locale, row.nameAr, row.nameFr) })),
  ];

  items.sort((a, b) => a.name.localeCompare(b.name, locale === "ar" ? "ar" : "fr"));

  return { ok: true, data: items };
}

// --- Scan resolution: the one code path for a physical scan, a quick-pick
// tap, and a manual-search pick alike -------------------------------------

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

export type PosScanResult =
  | { status: "found"; line: PosResolvedLine }
  | { status: "not_found" }
  | { status: "inactive"; name: string };

const scanSchema = z.string().trim().min(1).max(64);

export async function resolvePosScan(rawSku: unknown, locale: string): Promise<ServiceResult<PosScanResult>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  return resolvePosScanCore(rawSku, locale, await getPosMessages());
}

export async function resolvePosScanCore(
  rawSku: unknown,
  locale: string,
  messages: PosMessages,
): Promise<ServiceResult<PosScanResult>> {
  const parsed = scanSchema.safeParse(rawSku);
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
  reason: z.enum(["wrong_scan", "changed_mind"]),
});

const completeSaleSchema = z.object({
  locale: z.enum(["ar", "fr"]),
  paymentMethod: z.enum(["cash", "bankily", "masrvi", "sedad", "other"]),
  lines: z.array(posLineSchema).min(1).max(50),
  removedLines: z.array(removedLineSchema).max(50).default([]),
});

export type CompleteSaleResult = { code: string; total: number };

export async function completeSale(input: unknown): Promise<ServiceResult<CompleteSaleResult>> {
  const auth = await requirePermission("pos.use");
  if (!auth.ok) return auth;

  return completeSaleCore(input, auth.data.id, await getPosMessages());
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
 * Non-backorder line short on recorded stock: the physical item exists (it
 * was just scanned at the counter), so an explicit staff override corrects
 * the count up to exactly what's needed — a `correction` movement, noted as
 * such (task 14: "logged as a `correction` context on the movement note") —
 * before the normal atomic decrement, which is then guaranteed to clear.
 * Returns `false` only when the line wasn't overridden and stock is short.
 */
async function decrementOrCorrect(
  line: StockLine,
  overridden: boolean,
  orderId: string,
  actorId: string,
): Promise<boolean> {
  if (line.allowBackorder) {
    return decrementStockLine(line, orderId, actorId, "pos_sale");
  }

  if (overridden) {
    const [currentQty] = line.usesVariantStock
      ? await db.select({ q: productVariants.stockQty }).from(productVariants).where(eq(productVariants.id, line.variantId!)).limit(1)
      : await db.select({ q: products.stockQty }).from(products).where(eq(products.id, line.productId)).limit(1);
    const shortfall = line.qty - (currentQty?.q ?? 0);
    if (shortfall > 0) {
      // `incrementStockLine` bumps by its line's own `qty`, not an arbitrary
      // delta — pass a shortfall-sized copy so only the missing amount is
      // corrected, not the whole sale quantity.
      await incrementStockLine(
        { ...line, qty: shortfall },
        orderId,
        actorId,
        "correction",
        "POS override: recorded stock corrected to match a physically scanned sale",
      );
    }
  }

  return decrementStockLine(line, orderId, actorId, "pos_sale");
}

/** All-or-nothing across the whole sale, same shape as `orders.ts`'s own `decrementStockLines` — loads each top-level line's stock units separately (rather than one batched `loadStockLines` call) so a bundle's expanded component units keep that line's own `overridden` flag. */
async function applySaleStock(
  lines: { source: StockLineSource; overridden: boolean }[],
  orderId: string,
  actorId: string,
): Promise<string | null> {
  const applied: StockLine[] = [];

  for (const { source, overridden } of lines) {
    const stockLines = await loadStockLines([source]);
    for (const line of stockLines) {
      const ok = await decrementOrCorrect(line, overridden, orderId, actorId);
      if (!ok) {
        for (const done of applied) await incrementStockLine(done, orderId, actorId, "correction");
        return source.nameSnapshot;
      }
      applied.push(line);
    }
  }

  return null;
}

/**
 * Creates the order + items + events (including buffered line-removal
 * events) + `pos_sale` stock movements as one logical unit — `neon-http` has
 * no transactions (see `orders.ts`'s own note), so a failure after the order
 * row lands is a manual rollback: delete the order, which cascades to
 * whatever `order_items`/`order_events` already committed. Nothing about
 * price or name is trusted from the client — every line is re-resolved here,
 * the same discipline `createOrderCore` uses for the storefront.
 */
export async function completeSaleCore(
  input: unknown,
  actorId: string,
  messages: PosMessages,
): Promise<ServiceResult<CompleteSaleResult>> {
  const parsed = completeSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  const data = parsed.data;

  const productIds = [...new Set(data.lines.filter((l) => l.kind === "product").map((l) => l.productId!))];
  const variantIds = [...new Set(data.lines.filter((l) => l.kind === "product" && l.variantId).map((l) => l.variantId!))];
  const bundleIds = [...new Set(data.lines.filter((l) => l.kind === "bundle").map((l) => l.bundleId!))];

  const [productRows, variantRows, bundleRows] = await Promise.all([
    productIds.length ? db.select().from(products).where(inArray(products.id, productIds)) : Promise.resolve([]),
    variantIds.length ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : Promise.resolve([]),
    bundleIds.length ? db.select().from(bundles).where(inArray(bundles.id, bundleIds)) : Promise.resolve([]),
  ]);

  const productById = new Map(productRows.map((row) => [row.id, row]));
  const variantById = new Map(variantRows.map((row) => [row.id, row]));
  const bundleById = new Map(bundleRows.map((row) => [row.id, row]));

  const now = new Date();
  const unavailable: string[] = [];
  const resolved: ResolvedSaleLine[] = [];

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

      const effective = await getEffectivePrice(
        { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
        "pos",
        now,
      );
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

      const effective = await getEffectivePrice({ kind: "bundle", id: bundle.id, price: bundle.price }, "pos", now);
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

  if (unavailable.length > 0) {
    return { ok: false, error: { code: "CONFLICT", message: messages.itemUnavailable, details: { unavailable } } };
  }

  const subtotal = resolved.reduce((sum, line) => sum + line.basePrice * line.qty, 0);
  const total = resolved.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const discountTotal = subtotal - total;

  const created = await insertWithUniqueOrderCode(now, (code) =>
    db
      .insert(orders)
      .values({
        code,
        source: "pos",
        status: "delivered",
        paymentMethod: data.paymentMethod,
        subtotal,
        discountTotal,
        total,
        createdBy: actorId,
      })
      .returning({ id: orders.id, code: orders.code })
      .then(([row]) => row),
  );

  try {
    await db.insert(orderItems).values(
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

    await db.insert(orderEvents).values({ orderId: created.id, actorId, type: "created", payload: { source: "pos" } });

    for (const removed of data.removedLines) {
      await db.insert(orderEvents).values({
        orderId: created.id,
        actorId,
        type: "line_removed",
        payload: {
          itemId: null,
          before: { nameSnapshot: removed.nameSnapshot, unitPrice: removed.unitPrice, qty: removed.qty },
          after: null,
          reason: removed.reason,
        },
      });
    }

    const failedItem = await applySaleStock(
      resolved.map((line) => ({
        source: {
          productId: line.productId,
          variantId: line.variantId,
          bundleId: line.bundleId,
          qty: line.qty,
          nameSnapshot: line.nameSnapshot,
        },
        overridden: line.overridden,
      })),
      created.id,
      actorId,
    );

    if (failedItem) {
      await db.delete(orders).where(eq(orders.id, created.id));
      return {
        ok: false,
        error: { code: "CONFLICT", message: messages.insufficientStock, details: { itemName: failedItem } },
      };
    }
  } catch (error) {
    await db.delete(orders).where(eq(orders.id, created.id));
    throw error;
  }

  track("pos_sale_completed", {
    total,
    items_count: resolved.reduce((sum, line) => sum + line.qty, 0),
    payment_method: data.paymentMethod,
  });

  return { ok: true, data: { code: created.code, total } };
}
