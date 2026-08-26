import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, withTransaction, type Tx } from "@/src/db/client";
import { track } from "@/src/lib/analytics";
import { getAnalyticsDistinctId } from "@/src/lib/analytics-identity";
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
import { isUniqueViolation } from "@/src/lib/db-errors";
import type { ServiceResult } from "@/src/lib/errors";
import { localized } from "@/src/lib/locale-text";
import { insertWithUniqueOrderCode } from "@/src/lib/order-code";
import type { OrderStatusValue } from "@/src/lib/order-tracking";
import { normalizeMauritanianPhone } from "@/src/lib/phone";
import { containsTerm } from "@/src/lib/search";
import { getEffectivePrice, getEffectivePrices, type PricingChannel, type PricingItem } from "@/src/services/pricing";
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
  /** One key per checkout attempt — see `orders.idempotencyKey`. */
  idempotencyKey: z.uuid().optional(),
  items: z
    .array(orderItemSchema)
    .min(1)
    .max(50)
    // One cart line per key, by construction. The availability check below
    // aggregates by product anyway, but a duplicated key would still write two
    // `order_items` rows for what the customer sees as one line.
    .refine((items) => new Set(items.map((item) => item.key)).size === items.length, {
      message: "duplicate cart line key",
    }),
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
/** Re-derives the confirmation payload for an order that already exists — the reply to a retried checkout. */
async function existingOrderResult(idempotencyKey: string): Promise<CreateOrderResult | null> {
  const [order] = await db
    .select({
      id: orders.id,
      code: orders.code,
      customerName: orders.customerName,
      city: orders.city,
      subtotal: orders.subtotal,
      discountTotal: orders.discountTotal,
      total: orders.total,
    })
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!order) return null;

  const itemRows = await db
    .select({ nameSnapshot: orderItems.nameSnapshot, unitPrice: orderItems.unitPrice, qty: orderItems.qty })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.createdAt));

  return {
    code: order.code,
    customerName: order.customerName ?? "",
    city: (order.city ?? "ndb") as "ndb" | "nkc",
    items: itemRows.map((row) => ({ name: row.nameSnapshot, qty: row.qty, unitPrice: row.unitPrice })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
  };
}

export async function createOrderCore(
  input: unknown,
  messages: OrderMessages,
): Promise<ServiceResult<CreateOrderResult>> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    // Name the offending field so checkout can point at it. Without this the
    // one generic "invalid input" was the only feedback for a name over 120
    // characters or a note over 500 — neither of which the form bounded.
    const field = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: messages.invalidInput,
        details: typeof field === "string" ? { field } : undefined,
      },
    };
  }

  const data = parsed.data;

  // A retry after a lost response must not become a second order.
  if (data.idempotencyKey) {
    const existing = await existingOrderResult(data.idempotencyKey);
    if (existing) return { ok: true, data: existing };
  }

  const normalizedPhone = normalizeMauritanianPhone(data.phone);
  if (!normalizedPhone) {
    return { ok: false, error: { code: "VALIDATION", message: messages.invalidInput, details: { field: "phone" } } };
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

  // One promotion query for the whole cart. This loop used to `await`
  // `getEffectivePrice` per line, serialising up to 50 round trips on the one
  // request path a customer is actively waiting on.
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
    "web",
    now,
  );

  // Availability is checked against the total quantity requested for a given
  // stock pool, not line by line: two lines naming the same product each used
  // to clear the same single unit independently.
  const requestedByStockKey = new Map<string, number>();
  const stockKeyOf = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ""}`;
  for (const item of data.items) {
    if (item.kind !== "product") continue;
    const product = productById.get(item.productId!);
    if (!product) continue;
    const variant = item.variantId ? (variantById.get(item.variantId) ?? null) : null;
    // A variant with `stockQty: null` sells from its parent's pool, so it
    // aggregates against the parent, not against itself.
    const poolVariantId = variant && variant.stockQty !== null ? variant.id : null;
    const key = stockKeyOf(product.id, poolVariantId);
    requestedByStockKey.set(key, (requestedByStockKey.get(key) ?? 0) + item.qty);
  }

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

      const poolVariantId = variant && variant.stockQty !== null ? variant.id : null;
      const stockQty = poolVariantId ? variant!.stockQty! : product.stockQty;
      const requested = requestedByStockKey.get(stockKeyOf(product.id, poolVariantId)) ?? item.qty;
      if (!product.allowBackorder && stockQty < requested) {
        unavailableKeys.push(item.key);
        continue;
      }

      const effective = prices.get(product.id) ?? { price: product.price };
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

      const effective = prices.get(bundle.id) ?? { price: bundle.price };

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

  // The order, its lines and its `created` event are one unit. This used to
  // be three independent requests with a `DELETE` in the catch block standing
  // in for a rollback; now a failure anywhere leaves no trace of the order at
  // all.
  let created: { id: string; code: string };
  try {
    created = await withTransaction(async (tx) => {
      const row = await insertWithUniqueOrderCode(tx, now, (code) =>
        tx
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
            idempotencyKey: data.idempotencyKey ?? null,
          })
          .returning({ id: orders.id, code: orders.code })
          .then(([inserted]) => inserted),
      );

      await tx.insert(orderItems).values(
        resolved.map((line) => ({
          orderId: row.id,
          productId: line.kind === "product" ? line.productId : null,
          variantId: line.kind === "product" ? line.variantId : null,
          bundleId: line.kind === "bundle" ? line.bundleId : null,
          nameSnapshot: line.nameSnapshot,
          unitPrice: line.unitPrice,
          qty: line.qty,
        })),
      );

      await tx.insert(orderEvents).values({
        orderId: row.id,
        type: "created",
        payload: { source: "web" },
      });

      return row;
    });
  } catch (error) {
    // Two requests carrying the same key raced past the check above; the
    // index is the authority, and the loser reports the winner's order. The
    // lookup runs on `db`, outside the aborted transaction — a constraint
    // violation poisons its own transaction, so nothing more can be read
    // through `tx` once one has been raised.
    if (data.idempotencyKey && isUniqueViolation(error, "orders_idempotency_key_unique")) {
      const existing = await existingOrderResult(data.idempotencyKey);
      if (existing) return { ok: true, data: existing };
    }
    throw error;
  }

  // Reported here rather than from the route handler, and only on this branch,
  // because both idempotent-retry paths above (`existingOrderResult`) also
  // return `ok: true` for an order that already exists. A checkout that retries
  // — which is the whole reason the idempotency key exists — would otherwise
  // report a second `order_submitted` and double-count its revenue. Same rule
  // and same placement as `pos_sale_completed` in pos.ts: after the write has
  // actually committed, never before.
  track(
    "order_submitted",
    {
      code: created.code,
      total,
      city: data.city,
      items_count: resolved.reduce((sum, line) => sum + line.qty, 0),
    },
    await getAnalyticsDistinctId(),
  );

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
/**
 * Every filter except `status`, shared by the list and by the status-badge
 * counts above it — the counts used to aggregate over the whole table, so a
 * search or date range narrowed the rows underneath while the badges kept
 * reporting shop-wide totals.
 */
function buildOrderConditions(filters: Omit<OrderListFilters, "status" | "page">): SQL[] {
  const conditions: SQL[] = [];
  if (filters.source) conditions.push(eq(orders.source, filters.source));
  if (filters.city) conditions.push(eq(orders.city, filters.city));
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime())) conditions.push(gte(orders.createdAt, from));
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setUTCDate(to.getUTCDate() + 1);
      conditions.push(lt(orders.createdAt, to));
    }
  }
  const term = containsTerm(filters.search);
  if (term) {
    conditions.push(or(ilike(orders.code, term), ilike(orders.customerPhone, term), ilike(orders.customerName, term))!);
  }
  return conditions;
}

export async function listOrdersAdmin(filters: OrderListFilters): Promise<ServiceResult<OrderListResult>> {
  const auth = await requirePermission("orders.view");
  if (!auth.ok) return auth;

  const page = Math.max(1, filters.page ?? 1);
  const conditions: SQL[] = buildOrderConditions(filters);
  if (filters.status) conditions.push(eq(orders.status, filters.status));
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

/**
 * Badge counts per status for the list page — every status always present,
 * zero-filled, and narrowed by the same search/source/city/date filters as the
 * list beneath them, so the badges describe the result set the operator is
 * actually looking at.
 */
export async function getOrderStatusCounts(
  filters: Omit<OrderListFilters, "status" | "page"> = {},
): Promise<ServiceResult<Record<OrderStatusValue, number>>> {
  const auth = await requirePermission("orders.view");
  if (!auth.ok) return auth;

  const conditions = buildOrderConditions(filters);
  const rows = await db
    .select({ status: orders.status, count: count() })
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(orders.status);

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
  /**
   * A cashier vouching that the item is physically here even though the count
   * says otherwise (POS only — gated on `inventory.adjust`). Carried on the
   * line so a whole basket can be expanded in one `loadStockLines` call
   * instead of one call per line, which is what it used to take to keep each
   * line's own flag attached to its components.
   */
  overridden: boolean;
};

/** What one stock-tracked unit holds after a write — what the register redraws its tiles from. */
export type StockLevel = { productId: string; variantId: string | null; stockQty: number };

export type StockLineSource = {
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  qty: number;
  nameSnapshot: string;
  /** POS only; defaults to `false` everywhere else. */
  overridden?: boolean;
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
export async function loadStockLines(tx: Tx, sources: StockLineSource[]): Promise<StockLine[]> {
  const productIds = [...new Set(sources.filter((s) => s.productId).map((s) => s.productId!))];
  const variantIds = [...new Set(sources.filter((s) => s.variantId).map((s) => s.variantId!))];
  const bundleIds = [...new Set(sources.filter((s) => s.bundleId).map((s) => s.bundleId!))];

  const [productRows, variantRows, bundleComponentRows] = await Promise.all([
    productIds.length
      ? tx.select({ id: products.id, allowBackorder: products.allowBackorder }).from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
    variantIds.length
      ? tx
          .select({ id: productVariants.id, stockQty: productVariants.stockQty })
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
      : Promise.resolve([]),
    bundleIds.length
      ? tx
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
        overridden: source.overridden ?? false,
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
          // A bundle's components inherit the top-level line's override, so a
          // cashier overriding a box overrides everything inside it.
          overridden: source.overridden ?? false,
        });
      }
    }
  }
  return lines;
}

/**
 * Thrown when a non-backorder line cannot be satisfied, to abort the
 * transaction it is running in.
 *
 * This is how "all or nothing" is expressed now. It used to be a `false`
 * return value that each caller had to notice and answer by replaying its own
 * writes backwards — a compensating-undo scheme that was, by some distance,
 * the most delicate code in the repo, and that could itself fail halfway and
 * leave recorded stock permanently adrift. `ROLLBACK` does the same job
 * unconditionally, so the label is all that has to survive the unwind.
 */
export class InsufficientStockError extends Error {
  constructor(readonly itemLabel: string) {
    super(`Insufficient stock for ${itemLabel}`);
    this.name = "InsufficientStockError";
  }
}

/**
 * Atomic, conditional decrement (task 13: "conditional update") — a
 * non-backorder line's `WHERE` clause requires enough stock, so a race lost
 * between a pre-check and this write still can't drive it negative; a
 * backorder line has no floor at all and is allowed to go negative,
 * visibly (see the relaxed `products_stock_qty_non_negative` check,
 * migration `0003`).
 *
 * The conditional `WHERE` still earns its keep inside a transaction: it is
 * what makes the decrement safe against a concurrent register, which
 * `READ COMMITTED` on its own does not give.
 *
 * Throws `InsufficientStockError` when the conditional update matches no rows.
 * Returns the level the decrement left behind, so a caller can tell a client
 * what the new count is without reading it back.
 */
export async function decrementStockLine(
  tx: Tx,
  line: StockLine,
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
  note?: string,
): Promise<StockLevel> {
  let remaining: number | undefined;

  if (line.usesVariantStock) {
    const where = line.allowBackorder
      ? eq(productVariants.id, line.variantId!)
      : and(eq(productVariants.id, line.variantId!), gte(productVariants.stockQty, line.qty));
    const rows = await tx
      .update(productVariants)
      .set({ stockQty: sql`${productVariants.stockQty} - ${line.qty}` })
      .where(where)
      .returning({ stockQty: productVariants.stockQty });
    remaining = rows[0]?.stockQty ?? undefined;
  } else {
    const where = line.allowBackorder
      ? eq(products.id, line.productId)
      : and(eq(products.id, line.productId), gte(products.stockQty, line.qty));
    const rows = await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} - ${line.qty}` })
      .where(where)
      .returning({ stockQty: products.stockQty });
    remaining = rows[0]?.stockQty;
  }

  if (remaining === undefined) throw new InsufficientStockError(line.itemLabel);

  await tx.insert(stockMovements).values({
    productId: line.productId,
    variantId: line.variantId,
    delta: -line.qty,
    reason,
    orderId,
    actorId,
    note: note ?? null,
  });

  return { productId: line.productId, variantId: line.variantId, stockQty: remaining };
}

export async function incrementStockLine(
  tx: Tx,
  line: StockLine,
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
  note?: string,
): Promise<void> {
  if (line.usesVariantStock) {
    await tx
      .update(productVariants)
      .set({ stockQty: sql`${productVariants.stockQty} + ${line.qty}` })
      .where(eq(productVariants.id, line.variantId!));
  } else {
    await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} + ${line.qty}` })
      .where(eq(products.id, line.productId));
  }

  await tx.insert(stockMovements).values({
    productId: line.productId,
    variantId: line.variantId,
    delta: line.qty,
    reason,
    orderId,
    actorId,
    note: note ?? null,
  });
}

/** Every line or none: the first one that cannot be satisfied throws, and the transaction takes the rest back. */
export async function decrementStockLines(
  tx: Tx,
  lines: StockLine[],
  orderId: string,
  actorId: string | null,
  reason: (typeof stockMovements.reason.enumValues)[number],
): Promise<void> {
  for (const line of lines) await decrementStockLine(tx, line, orderId, actorId, reason);
}

/**
 * Runs `fn` in one transaction and translates the one error that is not a
 * fault — a line the shop cannot actually supply — into the result the caller
 * reports. Anything else propagates, having already rolled back.
 */
async function inOrderTransaction<T>(
  messages: OrderAdminMessages,
  fn: (tx: Tx) => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await withTransaction(fn);
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: messages.insufficientStock, details: { itemName: error.itemLabel } },
      };
    }
    throw error;
  }
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
async function recomputeOrderTotals(tx: Tx, orderId: string): Promise<void> {
  const items = await tx
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
      ? tx.select({ id: products.id, price: products.price }).from(products).where(inArray(products.id, productIds))
      : Promise.resolve([]),
    bundleIds.length
      ? tx.select({ id: bundles.id, price: bundles.price }).from(bundles).where(inArray(bundles.id, bundleIds))
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

  await tx.update(orders).set({ subtotal, discountTotal: subtotal - total, total }).where(eq(orders.id, orderId));
}

/**
 * Atomically move an order from one exact status to another, returning
 * `false` when it was no longer in `from` — because someone else got there
 * first.
 *
 * A read-then-write status guard is not a guard: under `READ COMMITTED` two
 * operators can both pass the read inside their own transactions. This
 * conditional update is what makes a lifecycle transition exclusive, and it is
 * the same idiom `decrementStockLine` uses for stock. There is no longer a
 * `releaseOrderStatus` counterpart — when the work behind a claim fails, the
 * transaction rolls the claim back along with everything else.
 */
async function claimOrderStatus(
  tx: Tx,
  id: string,
  from: OrderStatusValue,
  to: OrderStatusValue,
  extra?: Partial<{ busCompany: string; busNote: string | null }>,
): Promise<boolean> {
  const rows = await tx
    .update(orders)
    .set({ status: to, ...extra })
    .where(and(eq(orders.id, id), eq(orders.status, from)))
    .returning({ id: orders.id });
  return rows.length > 0;
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
  return inOrderTransaction(messages, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
    if (order.status !== "pending") {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    if (order.source === "web" && !input?.paymentMethod) {
      return { ok: false, error: { code: "VALIDATION", message: messages.paymentMethodRequired } };
    }

    // Claim the transition before touching stock. The read above is advisory —
    // it produces the good error message and decides whether a payment method is
    // required — but this conditional update is what actually makes the
    // transition exclusive. Without it, two operators confirming the same order
    // from two devices both passed the read and both decremented.
    if (!(await claimOrderStatus(tx, id, "pending", "confirmed"))) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    const itemRows = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    const lines = await loadStockLines(
      tx,
      itemRows.map((row) => ({
        productId: row.productId,
        variantId: row.variantId,
        bundleId: row.bundleId,
        qty: row.qty,
        nameSnapshot: row.nameSnapshot,
      })),
    );

    // A short line throws, which takes the claim above back out with it.
    await decrementStockLines(tx, lines, id, actorId, order.source === "pos" ? "pos_sale" : "web_sale");

    const patch: { paymentMethod?: PaymentMethodValue; paymentNote?: string } = {};
    if (input?.paymentMethod) patch.paymentMethod = input.paymentMethod;
    if (input?.paymentNote) patch.paymentNote = input.paymentNote;
    if (Object.keys(patch).length) await tx.update(orders).set(patch).where(eq(orders.id, id));

    await tx.insert(orderEvents).values({
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
  });
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

  // No stock effect, but the claim and its audit event still have to land
  // together — a transition with no `status_changed` behind it is a silent one.
  return withTransaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

    const current = order.status as OrderStatusValue;
    const delivery = order.delivery as "pickup" | "bus" | null;
    if (!isValidAdvance(current, delivery, parsed.data.target)) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    const extra: Partial<{ busCompany: string; busNote: string | null }> = {};

    if (parsed.data.target === "shipped") {
      if (!parsed.data.busCompany) {
        return { ok: false, error: { code: "VALIDATION", message: messages.busCompanyRequired } };
      }
      extra.busCompany = parsed.data.busCompany;
      extra.busNote = parsed.data.busNote ?? null;
    }

    if (!(await claimOrderStatus(tx, id, current, parsed.data.target, extra))) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    await tx.insert(orderEvents).values({
      orderId: id,
      actorId,
      type: "status_changed",
      payload: { from: current, to: parsed.data.target },
    });

    return { ok: true, data: { id } };
  });
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

  return inOrderTransaction(messages, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

    const current = order.status as OrderStatusValue;
    if (current === "delivered" || current === "cancelled" || current === "voided") {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    // Claim first, restock second — the reverse order let two concurrent
    // cancels each pass the status read and each restock the same lines,
    // inventing inventory that was never returned.
    if (!(await claimOrderStatus(tx, id, current, "cancelled"))) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    if (current !== "pending") {
      const itemRows = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      const lines = await loadStockLines(
        tx,
        itemRows.map((row) => ({
          productId: row.productId,
          variantId: row.variantId,
          bundleId: row.bundleId,
          qty: row.qty,
          nameSnapshot: row.nameSnapshot,
        })),
      );
      for (const line of lines) await incrementStockLine(tx, line, id, actorId, "cancel_restock");
    }

    await tx.insert(orderEvents).values({
      orderId: id,
      actorId,
      type: "cancelled",
      payload: { reason: parsed.data.reason, from: current },
    });

    return { ok: true, data: { id } };
  });
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

  return inOrderTransaction(messages, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

    if (order.source !== "pos" || order.status !== "delivered") {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    if (!(await claimOrderStatus(tx, id, "delivered", "voided"))) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    const itemRows = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    const lines = await loadStockLines(
      tx,
      itemRows.map((row) => ({
        productId: row.productId,
        variantId: row.variantId,
        bundleId: row.bundleId,
        qty: row.qty,
        nameSnapshot: row.nameSnapshot,
      })),
    );
    for (const line of lines) await incrementStockLine(tx, line, id, actorId, "void_restock");

    await tx.insert(orderEvents).values({
      orderId: id,
      actorId,
      type: "voided",
      payload: { reason: parsed.data.reason },
    });

    return { ok: true, data: { id } };
  });
}

// --- Item picker options ----------------------------------------------------

export type OrderItemOption = {
  kind: "product" | "bundle";
  /** Stable option key; also the `productId`/`bundleId` sent to `addOrderItem`. */
  id: string;
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  nameAr: string;
  nameFr: string;
  sku: string;
  price: number;
};

/**
 * What the order detail page's "add item" picker offers, gated on
 * `orders.manage` — the permission the operator already needs to edit an
 * order at all.
 *
 * It used to call `listProducts`, which gates on `catalog.view`, and
 * `PERMISSION_REQUIRES` does not imply that from `orders.manage`: an account
 * granted order management got a permanently empty dropdown with no way to
 * tell a permission problem from an empty catalog.
 *
 * Variants are first-class entries. The picker only ever offered bare
 * products, so adding a variant-tracked item to an order decremented the
 * parent's shared pool and lost the colour or size the customer asked for.
 */
export async function listOrderItemOptions(): Promise<ServiceResult<OrderItemOption[]>> {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) return auth;

  const [productRows, variantRows, bundleRows] = await Promise.all([
    db
      .select({
        id: products.id,
        nameAr: products.nameAr,
        nameFr: products.nameFr,
        sku: products.sku,
        price: products.price,
        discountPrice: products.discountPrice,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.nameFr)),
    db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        variantNameAr: productVariants.nameAr,
        variantNameFr: productVariants.nameFr,
        sku: productVariants.sku,
        productNameAr: products.nameAr,
        productNameFr: products.nameFr,
        price: products.price,
        discountPrice: products.discountPrice,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(eq(productVariants.isActive, true), eq(products.isActive, true)))
      .orderBy(asc(products.nameFr)),
    db
      .select({ id: bundles.id, nameAr: bundles.nameAr, nameFr: bundles.nameFr, sku: bundles.sku, price: bundles.price })
      .from(bundles)
      .where(eq(bundles.isActive, true))
      .orderBy(asc(bundles.nameFr)),
  ]);

  return {
    ok: true,
    data: [
      ...productRows.map((row): OrderItemOption => ({
        kind: "product",
        id: row.id,
        productId: row.id,
        variantId: null,
        bundleId: null,
        nameAr: row.nameAr,
        nameFr: row.nameFr,
        sku: row.sku,
        price: row.discountPrice ?? row.price,
      })),
      ...variantRows.map((row): OrderItemOption => ({
        kind: "product",
        id: row.id,
        productId: row.productId,
        variantId: row.id,
        bundleId: null,
        nameAr: `${row.productNameAr} — ${row.variantNameAr}`,
        nameFr: `${row.productNameFr} — ${row.variantNameFr}`,
        sku: row.sku,
        price: row.discountPrice ?? row.price,
      })),
      ...bundleRows.map((row): OrderItemOption => ({
        kind: "bundle",
        id: row.id,
        productId: null,
        variantId: null,
        bundleId: row.id,
        nameAr: row.nameAr,
        nameFr: row.nameFr,
        sku: row.sku,
        price: row.price,
      })),
    ],
  };
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

  const now = new Date();

  return inOrderTransaction(messages, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
    const status = order.status as OrderStatusValue;
    if (!EDITABLE_STATUSES.includes(status)) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    let resolvedLine: {
      productId: string | null;
      variantId: string | null;
      bundleId: string | null;
      nameSnapshot: string;
      unitPrice: number;
    };

    if (parsed.data.kind === "product") {
      const [product] = await tx.select().from(products).where(eq(products.id, parsed.data.productId!)).limit(1);
      if (!product || !product.isActive) {
        return { ok: false, error: { code: "CONFLICT", message: messages.insufficientStock } };
      }
      let variant: typeof productVariants.$inferSelect | null = null;
      if (parsed.data.variantId) {
        const rows = await tx.select().from(productVariants).where(eq(productVariants.id, parsed.data.variantId)).limit(1);
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
      const [bundle] = await tx.select().from(bundles).where(eq(bundles.id, parsed.data.bundleId!)).limit(1);
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
      const lines = await loadStockLines(tx, [
        { ...resolvedLine, qty: parsed.data.qty, nameSnapshot: resolvedLine.nameSnapshot },
      ]);
      await decrementStockLines(tx, lines, orderId, actorId, order.source === "pos" ? "pos_sale" : "web_sale");
    }

    const [inserted] = await tx
      .insert(orderItems)
      .values({ orderId, ...resolvedLine, qty: parsed.data.qty })
      .returning({ id: orderItems.id });

    await tx.insert(orderEvents).values({
      orderId,
      actorId,
      type: "items_edited",
      payload: {
        itemId: inserted.id,
        before: null,
        after: { nameSnapshot: resolvedLine.nameSnapshot, unitPrice: resolvedLine.unitPrice, qty: parsed.data.qty },
      },
    });

    await recomputeOrderTotals(tx, orderId);

    return { ok: true, data: { id: inserted.id } };
  });
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

  return inOrderTransaction(messages, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
    const status = order.status as OrderStatusValue;
    if (!EDITABLE_STATUSES.includes(status)) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    const [item] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
      .limit(1);
    if (!item) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };

    const oldQty = item.qty;
    const newQty = parsed.data.qty;
    if (newQty === oldQty) return { ok: true, data: { id: item.id } };

    // The line keeps the price it was sold at. Re-deriving it here moved what
    // the customer owes every time an admin nudged a quantity — including
    // downwards, on an order already confirmed and paid for over WhatsApp —
    // with nothing but a generic `items_edited` event to explain the change.
    // Adding a line still prices at today's rate; that is a new agreement.
    const newUnitPrice = item.unitPrice;

    const delta = newQty - oldQty;
    if (status !== "pending" && delta !== 0) {
      const lines = await loadStockLines(tx, [
        {
          productId: item.productId,
          variantId: item.variantId,
          bundleId: item.bundleId,
          qty: Math.abs(delta),
          nameSnapshot: item.nameSnapshot,
        },
      ]);
      if (delta > 0) {
        await decrementStockLines(tx, lines, orderId, actorId, order.source === "pos" ? "pos_sale" : "web_sale");
      } else {
        for (const line of lines) await incrementStockLine(tx, line, orderId, actorId, "correction");
      }
    }

    await tx.update(orderItems).set({ qty: newQty, unitPrice: newUnitPrice }).where(eq(orderItems.id, itemId));

    await tx.insert(orderEvents).values({
      orderId,
      actorId,
      type: "items_edited",
      payload: {
        itemId,
        before: { qty: oldQty, unitPrice: item.unitPrice },
        after: { qty: newQty, unitPrice: newUnitPrice },
      },
    });

    await recomputeOrderTotals(tx, orderId);

    return { ok: true, data: { id: itemId } };
  });
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
  return inOrderTransaction(messages, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
    const status = order.status as OrderStatusValue;
    if (!EDITABLE_STATUSES.includes(status)) {
      return { ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } };
    }

    const itemRows = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const item = itemRows.find((row) => row.id === itemId);
    if (!item) return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
    if (itemRows.length <= 1) {
      return { ok: false, error: { code: "VALIDATION", message: messages.cannotRemoveOnlyItem } };
    }

    if (status !== "pending") {
      const lines = await loadStockLines(tx, [
        {
          productId: item.productId,
          variantId: item.variantId,
          bundleId: item.bundleId,
          qty: item.qty,
          nameSnapshot: item.nameSnapshot,
        },
      ]);
      for (const line of lines) await incrementStockLine(tx, line, orderId, actorId, "correction");
    }

    await tx.delete(orderItems).where(eq(orderItems.id, itemId));

    await tx.insert(orderEvents).values({
      orderId,
      actorId,
      type: "line_removed",
      payload: { itemId, before: { nameSnapshot: item.nameSnapshot, unitPrice: item.unitPrice, qty: item.qty }, after: null },
    });

    await recomputeOrderTotals(tx, orderId);

    return { ok: true, data: { id: itemId } };
  });
}
