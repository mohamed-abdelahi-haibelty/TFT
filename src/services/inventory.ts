import { and, asc, count, desc, eq, gte, ilike, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { categories, orders, products, productVariants, stockMovements, users } from "@/src/db/schema";
import type { ServiceResult } from "@/src/lib/errors";
import { containsTerm } from "@/src/lib/search";
import { requirePermission } from "@/src/services/authz";

export type InventoryItem = {
  key: string;
  productId: string;
  variantId: string | null;
  nameAr: string;
  nameFr: string;
  variantNameAr: string | null;
  variantNameFr: string | null;
  sku: string;
  categoryNameAr: string;
  categoryNameFr: string;
  stockQty: number;
  lowStockThreshold: number;
  allowBackorder: boolean;
};

export async function listInventoryItems(filters: {
  search?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
}): Promise<ServiceResult<InventoryItem[]>> {
  const auth = await requirePermission("inventory.view");
  if (!auth.ok) return auth;

  const locale = await getLocale();
  const nameColumn = locale === "ar" ? products.nameAr : products.nameFr;
  const variantNameColumn = locale === "ar" ? productVariants.nameAr : productVariants.nameFr;

  const term = containsTerm(filters.search);

  const productConditions = [];
  if (term) {
    productConditions.push(or(ilike(products.nameFr, term), ilike(products.nameAr, term), ilike(products.sku, term)));
  }
  if (filters.categoryId) productConditions.push(eq(products.categoryId, filters.categoryId));
  if (filters.lowStockOnly) productConditions.push(lte(products.stockQty, products.lowStockThreshold));

  const productRows = await db
    .select({
      productId: products.id,
      nameAr: products.nameAr,
      nameFr: products.nameFr,
      sku: products.sku,
      categoryNameAr: categories.nameAr,
      categoryNameFr: categories.nameFr,
      stockQty: products.stockQty,
      lowStockThreshold: products.lowStockThreshold,
      allowBackorder: products.allowBackorder,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(productConditions.length ? and(...productConditions) : undefined)
    .orderBy(asc(nameColumn));

  // A variant only gets its own inventory row when it tracks its own stock
  // (`stockQty` non-null) — a variant sharing its parent's stock is already
  // covered by the product's own row, per `loadStockLines`' own
  // `usesVariantStock` distinction (task 13/14).
  const variantConditions = [];
  variantConditions.push(isNotNull(productVariants.stockQty));
  if (term) {
    variantConditions.push(
      or(
        ilike(productVariants.sku, term),
        ilike(products.nameFr, term),
        ilike(products.nameAr, term),
        ilike(productVariants.nameFr, term),
        ilike(productVariants.nameAr, term),
      ),
    );
  }
  if (filters.categoryId) variantConditions.push(eq(products.categoryId, filters.categoryId));
  if (filters.lowStockOnly) variantConditions.push(lte(productVariants.stockQty, products.lowStockThreshold));

  const variantRows = await db
    .select({
      productId: productVariants.productId,
      variantId: productVariants.id,
      nameAr: products.nameAr,
      nameFr: products.nameFr,
      variantNameAr: productVariants.nameAr,
      variantNameFr: productVariants.nameFr,
      sku: productVariants.sku,
      categoryNameAr: categories.nameAr,
      categoryNameFr: categories.nameFr,
      stockQty: productVariants.stockQty,
      lowStockThreshold: products.lowStockThreshold,
      allowBackorder: products.allowBackorder,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...variantConditions))
    .orderBy(asc(nameColumn), asc(variantNameColumn));

  const items: InventoryItem[] = [
    ...productRows.map((row) => ({
      key: row.productId,
      variantId: null,
      variantNameAr: null,
      variantNameFr: null,
      ...row,
    })),
    ...variantRows.map((row) => ({
      key: `${row.productId}:${row.variantId}`,
      ...row,
      stockQty: row.stockQty as number,
    })),
  ];

  items.sort((a, b) => {
    const aName = locale === "ar" ? a.nameAr : a.nameFr;
    const bName = locale === "ar" ? b.nameAr : b.nameFr;
    const byName = aName.localeCompare(bName, locale === "ar" ? "ar" : "fr");
    if (byName !== 0) return byName;
    const aVariant = locale === "ar" ? a.variantNameAr : a.variantNameFr;
    const bVariant = locale === "ar" ? b.variantNameAr : b.variantNameFr;
    return (aVariant ?? "").localeCompare(bVariant ?? "", locale === "ar" ? "ar" : "fr");
  });

  return { ok: true, data: items };
}

export type InventoryMessages = {
  invalidInput: string;
  notFound: string;
  belowZero: string;
  /** Absolute set lost a race — the operator needs to re-read before retrying. */
  stockMoved: string;
};

const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  mode: z.enum(["delta", "absolute"]),
  value: z.number().int(),
  reason: z.enum(["restock", "correction", "manual_adjust"]),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function adjustStock(input: unknown): Promise<ServiceResult<{ stockQty: number }>> {
  // Staff can adjust stock — architecture.md: "staff can... adjust stock."
  const auth = await requirePermission("inventory.adjust");
  if (!auth.ok) return auth;

  const t = await getTranslations("inventoryErrors");
  return adjustStockCore(input, auth.data.id, {
    invalidInput: t("invalidInput"),
    notFound: t("notFound"),
    belowZero: t("belowZero"),
    stockMoved: t("stockMoved"),
  });
}

export async function adjustStockCore(
  input: unknown,
  actorId: string,
  messages: InventoryMessages,
): Promise<ServiceResult<{ stockQty: number }>> {
  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }
  const { productId, mode, value, reason, note } = parsed.data;
  const variantId = parsed.data.variantId ?? null;

  const [product] = await db
    .select({ id: products.id, stockQty: products.stockQty, allowBackorder: products.allowBackorder })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  let current: number;
  if (variantId) {
    const [variant] = await db
      .select({ stockQty: productVariants.stockQty })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (!variant || variant.stockQty === null) {
      return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
    }
    current = variant.stockQty;
  } else {
    current = product.stockQty;
  }

  const delta = mode === "absolute" ? value - current : value;
  if (delta === 0) return { ok: true, data: { stockQty: current } };

  // Two different conditional updates, because the two modes assert different
  // things.
  //
  // `delta` ("add 5") is relative and composes with whatever else happened
  // since the read, so it only needs the non-negative floor.
  //
  // `absolute` ("set to 10") does not compose: the delta above is derived from
  // a value that may already be stale, so it must also assert that the row
  // still holds what we read. A sale landing mid stock-take used to silently
  // turn "set to 10" into 9, and two people setting 10 from 5 landed on 15.
  const variantWhere = variantId
    ? mode === "absolute"
      ? and(eq(productVariants.id, variantId), eq(productVariants.stockQty, current))
      : product.allowBackorder
        ? eq(productVariants.id, variantId)
        : and(eq(productVariants.id, variantId), gte(productVariants.stockQty, -delta))
    : undefined;

  const productWhere = variantId
    ? undefined
    : mode === "absolute"
      ? and(eq(products.id, productId), eq(products.stockQty, current))
      : product.allowBackorder
        ? eq(products.id, productId)
        : and(eq(products.id, productId), gte(products.stockQty, -delta));

  const rows = variantId
    ? await db
        .update(productVariants)
        .set({ stockQty: sql`${productVariants.stockQty} + ${delta}` })
        .where(variantWhere)
        .returning({ stockQty: productVariants.stockQty })
    : await db
        .update(products)
        .set({ stockQty: sql`${products.stockQty} + ${delta}` })
        .where(productWhere)
        .returning({ stockQty: products.stockQty });

  if (!rows.length || rows[0].stockQty === null) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: mode === "absolute" ? messages.stockMoved : messages.belowZero,
      },
    };
  }

  await db.insert(stockMovements).values({
    productId,
    variantId,
    delta,
    reason,
    actorId,
    note: note ?? null,
  });

  return { ok: true, data: { stockQty: rows[0].stockQty } };
}

export type StockMovementListItem = {
  id: string;
  productId: string;
  variantId: string | null;
  productNameAr: string;
  productNameFr: string;
  variantNameAr: string | null;
  variantNameFr: string | null;
  sku: string;
  delta: number;
  reason: (typeof stockMovements.reason.enumValues)[number];
  orderId: string | null;
  orderCode: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: Date;
};

const MOVEMENTS_PAGE_SIZE = 50;

export async function listStockMovements(filters: {
  productId?: string;
  variantId?: string;
  reason?: (typeof stockMovements.reason.enumValues)[number];
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}): Promise<ServiceResult<{ items: StockMovementListItem[]; page: number; pageCount: number; total: number }>> {
  const auth = await requirePermission("inventory.view");
  if (!auth.ok) return auth;

  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];
  if (filters.productId) conditions.push(eq(stockMovements.productId, filters.productId));
  if (filters.variantId) conditions.push(eq(stockMovements.variantId, filters.variantId));
  if (filters.reason) conditions.push(eq(stockMovements.reason, filters.reason));
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime())) conditions.push(gte(stockMovements.createdAt, from));
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    if (!Number.isNaN(to.getTime())) {
      // Exclusive upper bound one UTC day on, matching `listOrdersAdmin` —
      // `23:59:59.999` silently drops anything stamped in the final millisecond.
      to.setUTCDate(to.getUTCDate() + 1);
      conditions.push(lt(stockMovements.createdAt, to));
    }
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ value: total }] = await db.select({ value: count() }).from(stockMovements).where(where);

  const rows = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      variantId: stockMovements.variantId,
      productNameAr: products.nameAr,
      productNameFr: products.nameFr,
      variantNameAr: productVariants.nameAr,
      variantNameFr: productVariants.nameFr,
      sku: sql<string>`coalesce(${productVariants.sku}, ${products.sku})`,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
      orderId: stockMovements.orderId,
      orderCode: orders.code,
      actorName: users.name,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .leftJoin(productVariants, eq(stockMovements.variantId, productVariants.id))
    .leftJoin(orders, eq(stockMovements.orderId, orders.id))
    .leftJoin(users, eq(stockMovements.actorId, users.id))
    .where(where)
    .orderBy(desc(stockMovements.createdAt))
    .limit(MOVEMENTS_PAGE_SIZE)
    .offset((page - 1) * MOVEMENTS_PAGE_SIZE);

  return {
    ok: true,
    data: { items: rows, page, pageCount: Math.max(1, Math.ceil(total / MOVEMENTS_PAGE_SIZE)), total },
  };
}

export async function getInventoryItemName(
  productId: string,
  variantId?: string,
): Promise<ServiceResult<{ nameAr: string; nameFr: string; variantNameAr: string | null; variantNameFr: string | null }>> {
  const auth = await requirePermission("inventory.view");
  if (!auth.ok) return auth;

  const t = await getTranslations("inventoryErrors");
  const [product] = await db
    .select({ nameAr: products.nameAr, nameFr: products.nameFr })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return { ok: false, error: { code: "NOT_FOUND", message: t("notFound") } };

  let variantNameAr: string | null = null;
  let variantNameFr: string | null = null;
  if (variantId) {
    const [variant] = await db
      .select({ nameAr: productVariants.nameAr, nameFr: productVariants.nameFr })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (variant) {
      variantNameAr = variant.nameAr;
      variantNameFr = variant.nameFr;
    }
  }

  return { ok: true, data: { ...product, variantNameAr, variantNameFr } };
}
