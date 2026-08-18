import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import {
  bundleItems,
  bundles,
  orderEvents,
  orderItems,
  orders,
  productVariants,
  products,
  stockMovements,
  users,
} from "@/src/db/schema";
import { type AvailabilityComponent, deriveMaxSellable } from "@/src/lib/bundle-availability";
import type { ServiceResult } from "@/src/lib/errors";
import { localized } from "@/src/lib/locale-text";
import { insertWithUniqueOrderCode } from "@/src/lib/order-code";
import type { OrderStatusValue } from "@/src/lib/order-tracking";
import { normalizeMauritanianPhone } from "@/src/lib/phone";
import { getEffectivePrice, type PricingChannel } from "@/src/services/pricing";
import { requirePermission } from "@/src/services/authz";

const orderItemSchema = z
  .object({
    key: z.string().trim().min(1).max(200),
    kind: z.enum(["product", "bundle"]),
    productId: z.uuid().optional(),
    variantId: z.uuid().optional(),
    bundleId: z.uuid().optional(),
    qty: z.number().int().min(1).max(99),
  })
  .refine((item) => (item.kind === "product" ? !!item.productId : !!item.bundleId), {
    message: "productId or bundleId must match kind",
  });

const createOrderSchema = z.object({
  locale: z.enum(["ar", "fr"]),
  customerName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  // Checkout only ever offers NDB (pickup) or NKC (bus) — "other" stays a
  // valid `orders.city` DB value for admin/POS-entered orders, just not a
  // choice the public storefront hands out.
  city: z.enum(["ndb", "nkc"]),
  note: z.string().trim().max(500).optional(),
  items: z.array(orderItemSchema).min(1).max(50),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type OrderMessages = { invalidInput: string; itemsUnavailable: string };

export type CreateOrderItemResult = { name: string; qty: number; unitPrice: number };

export type CreateOrderResult = {
  code: string;
  customerName: string;
  city: "ndb" | "nkc";
  items: CreateOrderItemResult[];
  subtotal: number;
  discountTotal: number;
  total: number;
};

type ResolvedLine = { key: string; nameSnapshot: string; unitPrice: number; basePrice: number; qty: number } & (
  | { kind: "product"; productId: string; variantId: string | null }
  | { kind: "bundle"; bundleId: string }
);

/**
 * Public order creation (task 11) — the storefront's one write path with no
 * permission gate, same posture as `storefront.ts`'s public reads.
 * `/api/orders` sits outside the locale-prefixed route tree (see
 * `proxy.ts`'s matcher), so there is no ambient request locale to read —
 * the locale is read defensively from the raw body (before Zod validates
 * it) so even a rejected payload still gets a message in the right
 * language, then resolved to translated strings here and handed to
 * `createOrderCore`, the same `getTranslations`-outside / messages-in split
 * `products.ts` uses so the core logic is directly testable under Vitest
 * (`getTranslations` needs a real Next.js server runtime).
 */
export async function createOrder(input: unknown): Promise<ServiceResult<CreateOrderResult>> {
  const rawLocale =
    input && typeof input === "object" && (input as { locale?: unknown }).locale === "fr" ? "fr" : "ar";
  const t = await getTranslations({ locale: rawLocale, namespace: "orderErrors" });

  return createOrderCore(input, { invalidInput: t("invalidInput"), itemsUnavailable: t("itemsUnavailable") });
}

/**
 * Every price is re-derived server-side through `getEffectivePrice`
 * (channel `web`, server clock); the client's cart-snapshot prices are
 * display-only and never trusted. Availability is checked in full before
 * any write, so the "all-or-nothing" rule in `error-handling.md` falls out
 * naturally — there is nothing to roll back because nothing is written
 * until every line clears.
 */
export async function createOrderCore(
  input: unknown,
  messages: OrderMessages,
): Promise<ServiceResult<CreateOrderResult>> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const data = parsed.data;

  const normalizedPhone = normalizeMauritanianPhone(data.phone);
  if (!normalizedPhone) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  const productIds = [...new Set(data.items.filter((item) => item.kind === "product").map((item) => item.productId!))];
  const variantIds = [
    ...new Set(data.items.filter((item) => item.kind === "product" && item.variantId).map((item) => item.variantId!)),
  ];
  const bundleIds = [...new Set(data.items.filter((item) => item.kind === "bundle").map((item) => item.bundleId!))];

  const [productRows, variantRows, bundleRows, bundleComponentRows] = await Promise.all([
    productIds.length
      ? db.select().from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
    variantIds.length
      ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds))
      : Promise.resolve([]),
    bundleIds.length ? db.select().from(bundles).where(inArray(bundles.id, bundleIds)) : Promise.resolve([]),
    bundleIds.length
      ? db
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
          .where(inArray(bundleItems.bundleId, bundleIds))
      : Promise.resolve([]),
  ]);

  const productById = new Map(productRows.map((row) => [row.id, row]));
  const variantById = new Map(variantRows.map((row) => [row.id, row]));
  const bundleById = new Map(bundleRows.map((row) => [row.id, row]));

  const componentsByBundle = new Map<string, AvailabilityComponent[]>();
  for (const row of bundleComponentRows) {
    const list = componentsByBundle.get(row.bundleId) ?? [];
    list.push({ qty: row.qty, stock: row.variantStockQty ?? row.productStockQty, allowBackorder: row.allowBackorder });
    componentsByBundle.set(row.bundleId, list);
  }

  const now = new Date();
  const unavailableKeys: string[] = [];
  const resolved: ResolvedLine[] = [];

  for (const item of data.items) {
    if (item.kind === "product") {
      const product = productById.get(item.productId!);
      if (!product || !product.isActive) {
        unavailableKeys.push(item.key);
        continue;
      }

      let variant: (typeof variantRows)[number] | null = null;
      if (item.variantId) {
        variant = variantById.get(item.variantId) ?? null;
        if (!variant || !variant.isActive || variant.productId !== product.id) {
          unavailableKeys.push(item.key);
          continue;
        }
      }

      const stockQty = variant ? (variant.stockQty ?? product.stockQty) : product.stockQty;
      if (!product.allowBackorder && stockQty < item.qty) {
        unavailableKeys.push(item.key);
        continue;
      }

      const effective = await getEffectivePrice(
        { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
        "web",
        now,
      );
      const productName = localized(data.locale, product.nameAr, product.nameFr);
      const nameSnapshot = variant ? `${productName} — ${localized(data.locale, variant.nameAr, variant.nameFr)}` : productName;

      resolved.push({
        key: item.key,
        kind: "product",
        productId: product.id,
        variantId: variant?.id ?? null,
        nameSnapshot,
        unitPrice: effective.price,
        basePrice: product.price,
        qty: item.qty,
      });
    } else {
      const bundle = bundleById.get(item.bundleId!);
      if (!bundle || !bundle.isActive) {
        unavailableKeys.push(item.key);
        continue;
      }

      const maxSellable = deriveMaxSellable(componentsByBundle.get(bundle.id) ?? []);
      if (maxSellable !== null && maxSellable < item.qty) {
        unavailableKeys.push(item.key);
        continue;
      }

      const effective = await getEffectivePrice({ kind: "bundle", id: bundle.id, price: bundle.price }, "web", now);

      resolved.push({
        key: item.key,
        kind: "bundle",
        bundleId: bundle.id,
        nameSnapshot: localized(data.locale, bundle.nameAr, bundle.nameFr),
        unitPrice: effective.price,
        basePrice: bundle.price,
        qty: item.qty,
      });
    }
  }

  if (unavailableKeys.length > 0) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: messages.itemsUnavailable, details: { unavailableKeys } },
    };
  }

  const subtotal = resolved.reduce((sum, line) => sum + line.basePrice * line.qty, 0);
  const total = resolved.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const discountTotal = subtotal - total;

  const created = await insertWithUniqueOrderCode(now, (code) =>
    db
      .insert(orders)
      .values({
        code,
        source: "web",
        status: "pending",
        customerName: data.customerName,
        customerPhone: normalizedPhone,
        city: data.city,
        delivery: data.city === "ndb" ? "pickup" : "bus",
        subtotal,
        discountTotal,
        total,
        note: data.note || null,
      })
      .returning({ id: orders.id, code: orders.code })
      .then(([row]) => row),
  );

  try {
    await db.insert(orderItems).values(
      resolved.map((line) => ({
        orderId: created.id,
        productId: line.kind === "product" ? line.productId : null,
        variantId: line.kind === "product" ? line.variantId : null,
        bundleId: line.kind === "bundle" ? line.bundleId : null,
        nameSnapshot: line.nameSnapshot,
        unitPrice: line.unitPrice,
        qty: line.qty,
      })),
    );

    await db.insert(orderEvents).values({
      orderId: created.id,
      type: "created",
      payload: { source: "web" },
    });
  } catch (error) {
    // neon-http has no transactions (see order-code.ts / sku.ts's own note),
    // so a failure after the order row lands is a manual rollback — deleting
    // the order cascades to any order_items/order_events that did commit.
    await db.delete(orders).where(eq(orders.id, created.id));
    throw error;
  }

  return {
    ok: true,
    data: {
      code: created.code,
      customerName: data.customerName,
      city: data.city,
      items: resolved.map((line) => ({ name: line.nameSnapshot, qty: line.qty, unitPrice: line.unitPrice })),
      subtotal,
      discountTotal,
      total,
    },
  };
}

// ---------------------------------------------------------------------------
// Task 13 — Admin: Orders Management
// ---------------------------------------------------------------------------

const ORDER_STATUS_VALUES = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "arrived",
  "ready",
  "delivered",
  "cancelled",
  "voided",
] as const;

type PaymentMethodValue = "cash" | "bankily" | "masrvi" | "sedad" | "other";

export type OrderAdminMessages = {
  notFound: string;
  invalidTransition: string;
  insufficientStock: string;
  reasonRequired: string;
  busCompanyRequired: string;
  paymentMethodRequired: string;
  cannotRemoveOnlyItem: string;
  invalidInput: string;
};

async function getOrderAdminMessages(): Promise<OrderAdminMessages> {
  const t = await getTranslations("orderAdminErrors");
  return {
    notFound: t("notFound"),
    invalidTransition: t("invalidTransition"),
    insufficientStock: t("insufficientStock"),
    reasonRequired: t("reasonRequired"),
    busCompanyRequired: t("busCompanyRequired"),
    paymentMethodRequired: t("paymentMethodRequired"),
    cannotRemoveOnlyItem: t("cannotRemoveOnlyItem"),
    invalidInput: t("invalidInput"),
  };
}

export type OrderListItem = {
  id: string;
  code: string;
  status: OrderStatusValue;
  source: "web" | "pos";
  city: "ndb" | "nkc" | "other" | null;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  createdAt: Date;
  delivery: "pickup" | "bus" | null;
  paymentMethod: PaymentMethodValue | null;
  nextActions: OrderNextAction[];
};

export type OrderListFilters = {
  status?: OrderStatusValue;
  source?: "web" | "pos";
  city?: "ndb" | "nkc" | "other";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
};

export type OrderListResult = {
  rows: OrderListItem[];
  page: number;
  pageCount: number;
  total: number;
};

const ORDERS_PAGE_SIZE = 50;

/**
 * Order reads gate on `orders.view`, lifecycle writes on `orders.manage`,
 * cancellation on its own `orders.cancel`, and voiding a completed sale on
 * `pos.void` — voiding is a POS act (it restocks a sale that already
 * happened), not an order-desk one, so it sits with the register rather than
 * with the queue. An admin holds all four regardless.
 */
export async function listOrdersAdmin(filters: OrderListFilters): Promise<ServiceResult<OrderListResult>> {
  const auth = await requirePermission("orders.view");
  if (!auth.ok) return auth;

  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  if (filters.source) conditions.push(eq(orders.source, filters.source));
  if (filters.city) conditions.push(eq(orders.city, filters.city));
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime())) conditions.push(gte(orders.createdAt, from));
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setDate(to.getDate() + 1);
      conditions.push(lt(orders.createdAt, to));
    }
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(orders.code, term), ilike(orders.customerPhone, term), ilike(orders.customerName, term)));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ value: total }] = await db.select({ value: count() }).from(orders).where(where);

  const rows = await db
    .select({
      id: orders.id,
      code: orders.code,
      status: orders.status,
      source: orders.source,
      city: orders.city,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      total: orders.total,
      createdAt: orders.createdAt,
      delivery: orders.delivery,
      paymentMethod: orders.paymentMethod,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(ORDERS_PAGE_SIZE)
    .offset((page - 1) * ORDERS_PAGE_SIZE);

  return {
    ok: true,
    data: {
      rows: rows.map((row) => ({
        ...row,
        status: row.status as OrderStatusValue,
        source: row.source as "web" | "pos",
        city: row.city as "ndb" | "nkc" | "other" | null,
        delivery: row.delivery as "pickup" | "bus" | null,
        paymentMethod: row.paymentMethod as PaymentMethodValue | null,
        nextActions: computeNextActions(
          row.status as OrderStatusValue,
          row.delivery as "pickup" | "bus" | null,
          row.paymentMethod as PaymentMethodValue | null,
          row.source as "web" | "pos",
        ),
      })),
      page,
      pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)),
      total,
    },
  };
}

/** Badge counts per status for the list page — every status always present, zero-filled. */
export async function getOrderStatusCounts(): Promise<ServiceResult<Record<OrderStatusValue, number>>> {
  const auth = await requirePermission("orders.view");
  if (!auth.ok) return auth;

  const rows = await db.select({ status: orders.status, count: count() }).from(orders).groupBy(orders.status);

  const counts = Object.fromEntries(ORDER_STATUS_VALUES.map((status) => [status, 0])) as Record<
    OrderStatusValue,
    number
  >;
  for (const row of rows) counts[row.status as OrderStatusValue] = Number(row.count);

  return { ok: true, data: counts };
}

export type OrderItemDetail = {
  id: string;
  kind: "product" | "bundle";
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  nameSnapshot: string;
  unitPrice: number;
  qty: number;
};

export type OrderEventDetail = {
  id: string;
  type: (typeof orderEvents.type.enumValues)[number];
  payload: unknown;
  actorName: string | null;
  createdAt: Date;
};

export type OrderNextAction =
  | { action: "confirm"; requiresPaymentMethod: boolean }
  | { action: "advance"; target: "preparing" }
  | { action: "advance"; target: "shipped"; requiresBusInfo: true }
  | { action: "advance"; target: "ready" }
  | { action: "advance"; target: "arrived" }
  | { action: "advance"; target: "delivered" }
  | { action: "cancel" }
  | { action: "void" };

export type OrderDetail = {
  id: string;
  code: string;
  status: OrderStatusValue;
  source: "web" | "pos";
  city: "ndb" | "nkc" | "other" | null;
  delivery: "pickup" | "bus" | null;
  busCompany: string | null;
  busNote: string | null;
  paymentMethod: PaymentMethodValue | null;
  paymentNote: string | null;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  items: OrderItemDetail[];
  events: OrderEventDetail[];
  nextActions: OrderNextAction[];
  createdAt: Date;
};

/**
 * The state machine's forward edges, as data the detail page renders
 * directly (task 13: "only-valid next actions") — a crafted request past
 * this is independently re-validated by `advanceOrderStatusCore`'s own
 * `isValidAdvance`, so the UI can trust this list without duplicating the
 * rules, but a bad actor hitting the action route directly still can't.
 */
function computeNextActions(
  status: OrderStatusValue,
  delivery: "pickup" | "bus" | null,
  paymentMethod: PaymentMethodValue | null,
  source: "web" | "pos",
): OrderNextAction[] {
  switch (status) {
    case "pending":
      return [{ action: "confirm", requiresPaymentMethod: source === "web" }, { action: "cancel" }];
    case "confirmed":
      return [{ action: "advance", target: "preparing" }, { action: "cancel" }];
    case "preparing":
      return [
        delivery === "bus"
          ? { action: "advance", target: "shipped", requiresBusInfo: true }
          : { action: "advance", target: "ready" },
        { action: "cancel" },
      ];
    case "shipped":
      return [{ action: "advance", target: "arrived" }, { action: "cancel" }];
    case "arrived":
    case "ready":
      return [{ action: "advance", target: "delivered" }, { action: "cancel" }];
    case "delivered":
      // A POS sale lands `delivered` directly (task 14) — its one reversal
      // is admin-only void, never the customer-order cancel flow. A
      // `delivered` web order has no further action at all.
      return source === "pos" ? [{ action: "void" }] : [];
    default:
      return [];
  }
}

export async function getOrderAdmin(id: string): Promise<ServiceResult<OrderDetail>> {
  const auth = await requirePermission("orders.view");
  if (!auth.ok) return auth;

  const t = await getTranslations("orderAdminErrors");
  return getOrderAdminCore(id, { notFound: t("notFound") });
}

export async function getOrderAdminCore(id: string, messages: { notFound: string }): Promise<ServiceResult<OrderDetail>> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.createdAt));
  const eventRows = await db
    .select({
      id: orderEvents.id,
      type: orderEvents.type,
      payload: orderEvents.payload,
      createdAt: orderEvents.createdAt,
      actorName: users.name,
    })
    .from(orderEvents)
    .leftJoin(users, eq(orderEvents.actorId, users.id))
    .where(eq(orderEvents.orderId, id))
    .orderBy(asc(orderEvents.createdAt));

  const items: OrderItemDetail[] = itemRows.map((row) => ({
    id: row.id,
    kind: row.productId ? "product" : "bundle",
    productId: row.productId,
    variantId: row.variantId,
    bundleId: row.bundleId,
    nameSnapshot: row.nameSnapshot,
    unitPrice: row.unitPrice,
    qty: row.qty,
  }));

  const status = order.status as OrderStatusValue;
  const delivery = order.delivery as "pickup" | "bus" | null;
  const paymentMethod = order.paymentMethod as PaymentMethodValue | null;

  return {
    ok: true,
    data: {
      id: order.id,
      code: order.code,
      status,
      source: order.source as "web" | "pos",
      city: order.city,
      delivery,
      busCompany: order.busCompany,
      busNote: order.busNote,
      paymentMethod,
      paymentNote: order.paymentNote,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      note: order.note,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      total: order.total,
      items,
      events: eventRows,
      nextActions: computeNextActions(status, delivery, paymentMethod, order.source as "web" | "pos"),
      createdAt: order.createdAt,
    },
  };
}

// --- Stock adjustment: shared by confirm / cancel / item edits ------------
// (also reused by `pos.ts` for a completed counter sale and its void — see
// task 14, which needed the exact same atomic-decrement/rollback shape one
// level up in its own order/void orchestration rather than duplicating it.)

export type StockLine = {
  itemLabel: string;
  productId: string;
  variantId: string | null;
  usesVariantStock: boolean;
  qty: number;
  allowBackorder: boolean;
};

export type StockLineSource = {
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  qty: number;
  nameSnapshot: string;
};

/**
 * Expands order lines into flat stock-adjustment units — a product/variant
 * line is one unit, a bundle line is expanded into one unit per current
 * component (qty × the component's own qty), re-read fresh from
 * `bundle_items` at call time (not a snapshot of the bundle's composition
 * when the order was placed — this codebase doesn't version bundle
 * composition, same simplification `createOrderCore`'s own availability
 * check already makes).
 */
export async function loadStockLines(sources: StockLineSource[]): Promise<StockLine[]> {
  const productIds = [...new Set(sources.filter((s) => s.productId).map((s) => s.productId!))];
  const variantIds = [...new Set(sources.filter((s) => s.variantId).map((s) => s.variantId!))];
  const bundleIds = [...new Set(sources.filter((s) => s.bundleId).map((s) => s.bundleId!))];

  const [productRows, variantRows, bundleComponentRows] = await Promise.all([
    productIds.length
      ? db.select({ id: products.id, allowBackorder: products.allowBackorder }).from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
    variantIds.length
      ? db
          .select({ id: productVariants.id, stockQty: productVariants.stockQty })
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
      : Promise.resolve([]),
    bundleIds.length
      ? db
          .select({
            bundleId: bundleItems.bundleId,
            qty: bundleItems.qty,
            productId: bundleItems.productId,
            variantId: bundleItems.variantId,
            productAllowBackorder: products.allowBackorder,
            variantStockQty: productVariants.stockQty,
          })
          .from(bundleItems)
          .innerJoin(products, eq(bundleItems.productId, products.id))
          .leftJoin(productVariants, eq(bundleItems.variantId, productVariants.id))
          .where(inArray(bundleItems.bundleId, bundleIds))
      : Promise.resolve([]),
  ]);

  const productById = new Map(productRows.map((row) => [row.id, row]));
  const variantById = new Map(variantRows.map((row) => [row.id, row]));
  const componentsByBundle = new Map<string, typeof bundleComponentRows>();
  for (const row of bundleComponentRows) {
    const list = componentsByBundle.get(row.bundleId) ?? [];
    list.push(row);
    componentsByBundle.set(row.bundleId, list);
  }

  const lines: StockLine[] = [];
  for (const source of sources) {
    if (source.productId) {
      const product = productById.get(source.productId);
      if (!product) continue;
      const variant = source.variantId ? variantById.get(source.variantId) : null;
      const usesVariantStock = !!variant && variant.stockQty !== null;
      lines.push({
        itemLabel: source.nameSnapshot,
        productId: source.productId,
        variantId: usesVariantStock ? source.variantId! : null,
        usesVariantStock,
        qty: source.qty,
        allowBackorder: product.allowBackorder,
      });
    } else if (source.bundleId) {
      const components = componentsByBundle.get(source.bundleId) ?? [];
      for (const component of components) {
        const usesVariantStock = component.variantId != null && component.variantStockQty !== null;
        lines.push({
          itemLabel: source.nameSnapshot,
          productId: component.productId,
          variantId: usesVariantStock ? component.variantId : null,
          usesVariantStock,
          qty: source.qty * component.qty,
          allowBackorder: component.productAllowBackorder,
        });
      }
    }
  }
  return lines;
}

/**
 * Atomic, conditional decrement (task 13: "conditional update") — a
 * non-backorder line's `WHERE` clause requires enough stock, so a race lost
 * between a pre-check and this write still can't drive it negative; a
 * backorder line has no floor at all and is allowed to go negative,
 * visibly (see the relaxed `products_stock_qty_non_negative` check,
 * migration `0003`). Returns `false` without writing anything when the
 * conditional update matched zero rows.
 */
export async function decrementStockLine(
  line: StockLine,
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
  note?: string,
): Promise<boolean> {
  let succeeded: boolean;

  if (line.usesVariantStock) {
    const where = line.allowBackorder
      ? eq(productVariants.id, line.variantId!)
      : and(eq(productVariants.id, line.variantId!), gte(productVariants.stockQty, line.qty));
    const rows = await db
      .update(productVariants)
      .set({ stockQty: sql`${productVariants.stockQty} - ${line.qty}` })
      .where(where)
      .returning({ id: productVariants.id });
    succeeded = rows.length > 0;
  } else {
    const where = line.allowBackorder
      ? eq(products.id, line.productId)
      : and(eq(products.id, line.productId), gte(products.stockQty, line.qty));
    const rows = await db
      .update(products)
      .set({ stockQty: sql`${products.stockQty} - ${line.qty}` })
      .where(where)
      .returning({ id: products.id });
    succeeded = rows.length > 0;
  }

  if (!succeeded) return false;

  await db.insert(stockMovements).values({
    productId: line.productId,
    variantId: line.variantId,
    delta: -line.qty,
    reason,
    orderId,
    actorId,
    note: note ?? null,
  });
  return true;
}

export async function incrementStockLine(
  line: StockLine,
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
  note?: string,
): Promise<void> {
  if (line.usesVariantStock) {
    await db
      .update(productVariants)
      .set({ stockQty: sql`${productVariants.stockQty} + ${line.qty}` })
      .where(eq(productVariants.id, line.variantId!));
  } else {
    await db
      .update(products)
      .set({ stockQty: sql`${products.stockQty} + ${line.qty}` })
      .where(eq(products.id, line.productId));
  }

  await db.insert(stockMovements).values({
    productId: line.productId,
    variantId: line.variantId,
    delta: line.qty,
    reason,
    orderId,
    actorId,
    note: note ?? null,
  });
}

/** All-or-nothing: pre-checked-but-atomic decrement of every line, rolling back (increment) whatever already applied the moment one line's conditional update fails. Returns the failing line's label, or `null` on full success. */
export async function decrementStockLines(
  lines: StockLine[],
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
): Promise<string | null> {
  const applied: StockLine[] = [];
  for (const line of lines) {
    const ok = await decrementStockLine(line, orderId, actorId, reason);
    if (!ok) {
      for (const done of applied) await incrementStockLine(done, orderId, actorId, "correction");
      return line.itemLabel;
    }
    applied.push(line);
  }
  return null;
}

/**
 * Re-derives `subtotal`/`discountTotal`/`total` from the order's current
 * lines after an edit — `subtotal` uses each product/bundle's *current*
 * base price (today's list price, not a stored snapshot: this schema never
 * persisted a per-line base price), while `total` sums each line's own
 * stored `unitPrice` (frozen at order/edit time). `discountTotal` is just
 * the derived gap between the two — a display figure, not a source of
 * truth for what's actually charged.
 */
async function recomputeOrderTotals(orderId: string): Promise<void> {
  const items = await db
    .select({
      productId: orderItems.productId,
      bundleId: orderItems.bundleId,
      unitPrice: orderItems.unitPrice,
      qty: orderItems.qty,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const productIds = [...new Set(items.filter((i) => i.productId).map((i) => i.productId!))];
  const bundleIds = [...new Set(items.filter((i) => i.bundleId).map((i) => i.bundleId!))];

  const [productRows, bundleRows] = await Promise.all([
    productIds.length
      ? db.select({ id: products.id, price: products.price }).from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
    bundleIds.length
      ? db.select({ id: bundles.id, price: bundles.price }).from(bundles).where(inArray(bundles.id, bundleIds))
      : Promise.resolve([]),
  ]);
  const priceByProduct = new Map(productRows.map((row) => [row.id, row.price]));
  const priceByBundle = new Map(bundleRows.map((row) => [row.id, row.price]));

  let subtotal = 0;
  let total = 0;
  for (const item of items) {
    const basePrice = item.productId
      ? (priceByProduct.get(item.productId) ?? item.unitPrice)
      : (priceByBundle.get(item.bundleId!) ?? item.unitPrice);
    subtotal += basePrice * item.qty;
    total += item.unitPrice * item.qty;
  }

  await db.update(orders).set({ subtotal, discountTotal: subtotal - total, total }).where(eq(orders.id, orderId));
}

// --- Status transitions -----------------------------------------------------

export type ConfirmOrderInput = {
  paymentMethod?: PaymentMethodValue;
  paymentNote?: string;
};

const confirmOrderSchema = z.object({
  paymentMethod: z.enum(["cash", "bankily", "masrvi", "sedad", "other"]).optional(),
  paymentNote: z.string().trim().max(500).optional(),
});

export async function confirmOrder(id: string, input?: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) return auth;
  const messages = await getOrderAdminMessages();

  const parsed = input === undefined ? undefined : confirmOrderSchema.safeParse(input);
  if (input !== undefined && !parsed?.success) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };
  }

  return confirmOrderCore(id, auth.data.id, messages, parsed?.success ? parsed.data : undefined);
}

/**
 * `pending → confirmed` (task 13's one status transition with a stock
 * side effect): every current line is pre-loaded, then atomically
 * decremented one by one via `decrementStockLines` — a non-backorder line
 * with insufficient stock fails its own conditional update, and everything
 * already decremented for this confirm attempt is rolled back, so the order
 * stays `pending` and nothing is left partially applied.
 *
 * Web orders hard-require a payment method at confirm (PRODUCT.md: the
 * client confirms over WhatsApp and sends a payment screenshot, which the
 * admin records here); POS orders are confirmed at the counter.
 */
export async function confirmOrderCore(
  id: string,
  actorId: string,
  messages: OrderAdminMessages,
  input?: ConfirmOrderInput,
): Promise<ServiceResult<{ id: string }>> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  if (order.status !== "pending") {
    return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
  }

  if (order.source === "web" && !input?.paymentMethod) {
    return { ok: false, error: { code: "VALIDATION", message: messages.paymentMethodRequired } };
  }

  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const lines = await loadStockLines(
    itemRows.map((row) => ({
      productId: row.productId,
      variantId: row.variantId,
      bundleId: row.bundleId,
      qty: row.qty,
      nameSnapshot: row.nameSnapshot,
    })),
  );

  const failedItem = await decrementStockLines(lines, id, actorId, order.source === "pos" ? "pos_sale" : "web_sale");
  if (failedItem) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: messages.insufficientStock, details: { itemName: failedItem } },
    };
  }

  const patch: { status: "confirmed"; paymentMethod?: PaymentMethodValue; paymentNote?: string } = {
    status: "confirmed",
  };
  if (input?.paymentMethod) patch.paymentMethod = input.paymentMethod;
  if (input?.paymentNote) patch.paymentNote = input.paymentNote;

  await db.update(orders).set(patch).where(eq(orders.id, id));
  await db.insert(orderEvents).values({
    orderId: id,
    actorId,
    type: "status_changed",
    payload: {
      from: "pending",
      to: "confirmed",
      ...(input?.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      ...(input?.paymentNote ? { paymentNote: input.paymentNote } : {}),
    },
  });

  return { ok: true, data: { id } };
}

const advanceStatusSchema = z.object({
  target: z.enum(["preparing", "shipped", "ready", "arrived", "delivered"]),
  busCompany: z.string().trim().min(1).max(120).optional(),
  busNote: z.string().trim().max(500).optional(),
});

function isValidAdvance(current: OrderStatusValue, delivery: "pickup" | "bus" | null, target: string): boolean {
  if (current === "confirmed") return target === "preparing";
  if (current === "preparing") {
    return delivery === "bus" ? target === "shipped" : target === "ready";
  }
  if (current === "shipped") return target === "arrived";
  if (current === "arrived" || current === "ready") return target === "delivered";
  return false;
}

export async function advanceOrderStatus(id: string, input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) return auth;
  return advanceOrderStatusCore(id, input, auth.data.id, await getOrderAdminMessages());
}

/** Every other forward transition — no stock side effect, `confirmOrderCore` owns the one status change that has one. */
export async function advanceOrderStatusCore(
  id: string,
  input: unknown,
  actorId: string,
  messages: OrderAdminMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = advanceStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  const current = order.status as OrderStatusValue;
  const delivery = order.delivery as "pickup" | "bus" | null;
  if (!isValidAdvance(current, delivery, parsed.data.target)) {
    return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
  }

  const patch: { status: OrderStatusValue; busCompany?: string; busNote?: string | null } = {
    status: parsed.data.target,
  };

  if (parsed.data.target === "shipped") {
    if (!parsed.data.busCompany) {
      return { ok: false, error: { code: "VALIDATION", message: messages.busCompanyRequired } };
    }
    patch.busCompany = parsed.data.busCompany;
    patch.busNote = parsed.data.busNote ?? null;
  }

  await db.update(orders).set(patch).where(eq(orders.id, id));
  await db.insert(orderEvents).values({
    orderId: id,
    actorId,
    type: "status_changed",
    payload: { from: current, to: parsed.data.target },
  });

  return { ok: true, data: { id } };
}

const cancelOrderSchema = z.object({ reason: z.string().trim().min(1).max(500) });

export async function cancelOrder(id: string, input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("orders.cancel");
  if (!auth.ok) return auth;
  return cancelOrderCore(id, input, auth.data.id, await getOrderAdminMessages());
}

/** Cancel from any pre-delivered status; restores every current line's stock (`cancel_restock`) when the order had already been confirmed — matching exactly what's currently on the order, since item edits kept stock in sync incrementally as they happened. */
export async function cancelOrderCore(
  id: string,
  input: unknown,
  actorId: string,
  messages: OrderAdminMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = cancelOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.reasonRequired } };

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  const current = order.status as OrderStatusValue;
  if (current === "delivered" || current === "cancelled" || current === "voided") {
    return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
  }

  if (current !== "pending") {
    const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const lines = await loadStockLines(
      itemRows.map((row) => ({
        productId: row.productId,
        variantId: row.variantId,
        bundleId: row.bundleId,
        qty: row.qty,
        nameSnapshot: row.nameSnapshot,
      })),
    );
    for (const line of lines) await incrementStockLine(line, id, actorId, "cancel_restock");
  }

  await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({
    orderId: id,
    actorId,
    type: "cancelled",
    payload: { reason: parsed.data.reason, from: current },
  });

  return { ok: true, data: { id } };
}

const voidOrderSchema = z.object({ reason: z.string().trim().min(1).max(500) });

export async function voidOrder(id: string, input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("pos.void");
  if (!auth.ok) return auth;
  return voidOrderCore(id, input, auth.data.id, await getOrderAdminMessages());
}

/**
 * `delivered(pos) → voided`, admin-only (task 14 — staff runs POS sales but
 * cannot reverse one). Every current line's stock is restored
 * (`void_restock`), same shared `loadStockLines`/`incrementStockLine`
 * primitives `cancelOrderCore` already uses one status earlier in the web
 * lifecycle.
 */
export async function voidOrderCore(
  id: string,
  input: unknown,
  actorId: string,
  messages: OrderAdminMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = voidOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.reasonRequired } };

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  if (order.source !== "pos" || order.status !== "delivered") {
    return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
  }

  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const lines = await loadStockLines(
    itemRows.map((row) => ({
      productId: row.productId,
      variantId: row.variantId,
      bundleId: row.bundleId,
      qty: row.qty,
      nameSnapshot: row.nameSnapshot,
    })),
  );
  for (const line of lines) await incrementStockLine(line, id, actorId, "void_restock");

  await db.update(orders).set({ status: "voided" }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({
    orderId: id,
    actorId,
    type: "voided",
    payload: { reason: parsed.data.reason },
  });

  return { ok: true, data: { id } };
}

// --- Item edits (pending | confirmed | preparing) ---------------------------

const EDITABLE_STATUSES: OrderStatusValue[] = ["pending", "confirmed", "preparing"];

const addOrderItemSchema = z
  .object({
    kind: z.enum(["product", "bundle"]),
    productId: z.uuid().optional(),
    variantId: z.uuid().optional(),
    bundleId: z.uuid().optional(),
    qty: z.number().int().min(1).max(99),
  })
  .refine((item) => (item.kind === "product" ? !!item.productId : !!item.bundleId), {
    message: "productId or bundleId must match kind",
  });

export async function addOrderItem(orderId: string, input: unknown, locale: string): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) return auth;
  return addOrderItemCore(orderId, input, locale, auth.data.id, await getOrderAdminMessages());
}

export async function addOrderItemCore(
  orderId: string,
  input: unknown,
  locale: string,
  actorId: string,
  messages: OrderAdminMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = addOrderItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  const status = order.status as OrderStatusValue;
  if (!EDITABLE_STATUSES.includes(status)) {
    return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
  }

  const now = new Date();
  let resolvedLine: {
    productId: string | null;
    variantId: string | null;
    bundleId: string | null;
    nameSnapshot: string;
    unitPrice: number;
  };

  if (parsed.data.kind === "product") {
    const [product] = await db.select().from(products).where(eq(products.id, parsed.data.productId!)).limit(1);
    if (!product || !product.isActive) {
      return { ok: false, error: { code: "CONFLICT", message: messages.insufficientStock } };
    }
    let variant: typeof productVariants.$inferSelect | null = null;
    if (parsed.data.variantId) {
      const rows = await db.select().from(productVariants).where(eq(productVariants.id, parsed.data.variantId)).limit(1);
      variant = rows[0] ?? null;
      if (!variant || !variant.isActive || variant.productId !== product.id) {
        return { ok: false, error: { code: "CONFLICT", message: messages.insufficientStock } };
      }
    }
    const effective = await getEffectivePrice(
      { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
      order.source as PricingChannel,
      now,
    );
    const productName = localized(locale, product.nameAr, product.nameFr);
    resolvedLine = {
      productId: product.id,
      variantId: variant?.id ?? null,
      bundleId: null,
      nameSnapshot: variant ? `${productName} — ${localized(locale, variant.nameAr, variant.nameFr)}` : productName,
      unitPrice: effective.price,
    };
  } else {
    const [bundle] = await db.select().from(bundles).where(eq(bundles.id, parsed.data.bundleId!)).limit(1);
    if (!bundle || !bundle.isActive) {
      return { ok: false, error: { code: "CONFLICT", message: messages.insufficientStock } };
    }
    const effective = await getEffectivePrice({ kind: "bundle", id: bundle.id, price: bundle.price }, order.source as PricingChannel, now);
    resolvedLine = {
      productId: null,
      variantId: null,
      bundleId: bundle.id,
      nameSnapshot: localized(locale, bundle.nameAr, bundle.nameFr),
      unitPrice: effective.price,
    };
  }

  if (status !== "pending") {
    const lines = await loadStockLines([
      { ...resolvedLine, qty: parsed.data.qty, nameSnapshot: resolvedLine.nameSnapshot },
    ]);
    const failedItem = await decrementStockLines(lines, orderId, actorId, order.source === "pos" ? "pos_sale" : "web_sale");
    if (failedItem) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: messages.insufficientStock, details: { itemName: failedItem } },
      };
    }
  }

  const [inserted] = await db
    .insert(orderItems)
    .values({ orderId, ...resolvedLine, qty: parsed.data.qty })
    .returning({ id: orderItems.id });

  await db.insert(orderEvents).values({
    orderId,
    actorId,
    type: "items_edited",
    payload: {
      itemId: inserted.id,
      before: null,
      after: { nameSnapshot: resolvedLine.nameSnapshot, unitPrice: resolvedLine.unitPrice, qty: parsed.data.qty },
    },
  });

  await recomputeOrderTotals(orderId);

  return { ok: true, data: { id: inserted.id } };
}

const updateItemQtySchema = z.object({ qty: z.number().int().min(1).max(99) });

export async function updateOrderItemQty(
  orderId: string,
  itemId: string,
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) return auth;
  return updateOrderItemQtyCore(orderId, itemId, input, auth.data.id, await getOrderAdminMessages());
}

export async function updateOrderItemQtyCore(
  orderId: string,
  itemId: string,
  input: unknown,
  actorId: string,
  messages: OrderAdminMessages,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = updateItemQtySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput } };

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  const status = order.status as OrderStatusValue;
  if (!EDITABLE_STATUSES.includes(status)) {
    return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
  }

  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
    .limit(1);
  if (!item) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

  const oldQty = item.qty;
  const newQty = parsed.data.qty;
  if (newQty === oldQty) return { ok: true, data: { id: item.id } };

  const now = new Date();
  let newUnitPrice = item.unitPrice;
  if (item.productId) {
    const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
    if (product) {
      const effective = await getEffectivePrice(
        { kind: "product", id: product.id, price: product.price, discountPrice: product.discountPrice },
        order.source as PricingChannel,
        now,
      );
      newUnitPrice = effective.price;
    }
  } else if (item.bundleId) {
    const [bundle] = await db.select().from(bundles).where(eq(bundles.id, item.bundleId)).limit(1);
    if (bundle) {
      const effective = await getEffectivePrice({ kind: "bundle", id: bundle.id, price: bundle.price }, order.source as PricingChannel, now);
      newUnitPrice = effective.price;
    }
  }

  const delta = newQty - oldQty;
  if (status !== "pending" && delta !== 0) {
    const lines = await loadStockLines([
      {
        productId: item.productId,
        variantId: item.variantId,
        bundleId: item.bundleId,
        qty: Math.abs(delta),
        nameSnapshot: item.nameSnapshot,
      },
    ]);
    if (delta > 0) {
      const failedItem = await decrementStockLines(lines, orderId, actorId, order.source === "pos" ? "pos_sale" : "web_sale");
      if (failedItem) {
        return {
          ok: false,
          error: { code: "CONFLICT", message: messages.insufficientStock, details: { itemName: failedItem } },
        };
      }
    } else {
      for (const line of lines) await incrementStockLine(line, orderId, actorId, "correction");
    }
  }

  await db.update(orderItems).set({ qty: newQty, unitPrice: newUnitPrice }).where(eq(orderItems.id, itemId));

  await db.insert(orderEvents).values({
    orderId,
    actorId,
    type: "items_edited",
    payload: {
      itemId,
      before: { qty: oldQty, unitPrice: item.unitPrice },
      after: { qty: newQty, unitPrice: newUnitPrice },
    },
  });

  await recomputeOrderTotals(orderId);

  return { ok: true, data: { id: itemId } };
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<ServiceResult<{ id: string }>> {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) return auth;
  return removeOrderItemCore(orderId, itemId, auth.data.id, await getOrderAdminMessages());
}

export async function removeOrderItemCore(
  orderId: string,
  itemId: string,
  actorId: string,
  messages: OrderAdminMessages,
): Promise<ServiceResult<{ id: string }>> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  const status = order.status as OrderStatusValue;
  if (!EDITABLE_STATUSES.includes(status)) {
    return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
  }

  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const item = itemRows.find((row) => row.id === itemId);
  if (!item) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  if (itemRows.length <= 1) {
    return { ok: false, error: { code: "VALIDATION", message: messages.cannotRemoveOnlyItem } };
  }

  if (status !== "pending") {
    const lines = await loadStockLines([
      {
        productId: item.productId,
        variantId: item.variantId,
        bundleId: item.bundleId,
        qty: item.qty,
        nameSnapshot: item.nameSnapshot,
      },
    ]);
    for (const line of lines) await incrementStockLine(line, orderId, actorId, "correction");
  }

  await db.delete(orderItems).where(eq(orderItems.id, itemId));

  await db.insert(orderEvents).values({
    orderId,
    actorId,
    type: "line_removed",
    payload: { itemId, before: { nameSnapshot: item.nameSnapshot, unitPrice: item.unitPrice, qty: item.qty }, after: null },
  });

  await recomputeOrderTotals(orderId);

  return { ok: true, data: { id: itemId } };
}
