import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, lt, ne, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/src/db/client";
import { orderItems, orders, productVariants, products } from "@/src/db/schema";
import type { ServiceResult } from "@/src/lib/errors";
import type { OrderStatusValue } from "@/src/lib/order-tracking";
import { requirePermission } from "@/src/services/authz";

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Falls back to the current month for a missing or malformed `?month=` value — never throws on a crafted query string. */
export function normalizeMonthKey(input: string | undefined, now: Date = new Date()): string {
  return input && MONTH_KEY_RE.test(input) ? input : currentMonthKey(now);
}

/**
 * UTC month boundaries. These were the server's *local* calendar while order
 * codes (`order-code.ts`) and the list date filters were UTC, so on any
 * non-UTC deployment the dashboard's "this month" and the order codes stamped
 * `TFT-YYMM` disagreed about where the month started.
 */
function monthRange(monthKey: string): { start: Date; end: Date } {
  const [year, month] = monthKey.split("-").map(Number);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

/** Cache tag scoped to one month — order mutations only revalidate the current month's tag (see order-actions.ts / pos-actions.ts), leaving historical months' cached numbers untouched. */
export function dashboardMonthTag(monthKey: string): string {
  return `admin-dashboard-${monthKey}`;
}

const DASHBOARD_STATUS_VALUES = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "arrived",
  "ready",
  "delivered",
  "cancelled",
] as const satisfies readonly Exclude<OrderStatusValue, "voided">[];

export type DashboardStatusCounts = Record<(typeof DASHBOARD_STATUS_VALUES)[number], number>;

export type DashboardChannelSplit = {
  web: { count: number; revenue: number };
  pos: { count: number; revenue: number };
};

export type DashboardTopProduct = { productId: string; nameAr: string; nameFr: string; qty: number };

export type DashboardLowStockItem = {
  key: string;
  productId: string;
  variantId: string | null;
  nameAr: string;
  nameFr: string;
  variantNameAr: string | null;
  variantNameFr: string | null;
  sku: string;
  stockQty: number;
  lowStockThreshold: number;
};

export type DashboardPendingOrder = {
  id: string;
  code: string;
  status: OrderStatusValue;
  customerName: string | null;
  total: number;
  // ISO string, not `Date` — `unstable_cache` JSON-serializes its cached
  // return value, so a `Date` here would come back a bare string on every
  // read after the first, only failing once a cache entry is actually
  // reused (a `new Date(order.createdAt)` at the render site is the fix,
  // never trusting the type through a cache boundary).
  createdAt: string;
};

export type DashboardStats = {
  month: string;
  revenue: number;
  deliveredCount: number;
  averageOrderValue: number;
  channelSplit: DashboardChannelSplit;
  statusCounts: DashboardStatusCounts;
  topProducts: DashboardTopProduct[];
  lowStock: DashboardLowStockItem[];
  pendingOrders: DashboardPendingOrder[];
};

const PENDING_ORDERS_LIMIT = 10;
const LOW_STOCK_LIMIT = 10;
const TOP_PRODUCTS_LIMIT = 10;

/**
 * The pure aggregation core (task 16) — every query is a SQL aggregate
 * (sum/count/group by), never a full order/order-items scan pulled into JS.
 * No permission gate here so this stays directly callable from Vitest, same
 * split every other `src/services/*` module uses; `getDashboardStats` below
 * is the auth-gated, cached entry point real pages call.
 *
 * Voided orders are excluded from every figure (they never counted as a
 * real sale); cancelled orders show up only in `statusCounts`, never in
 * revenue, the channel split, or top products, since those all key off
 * `status = 'delivered'`.
 */
export async function getDashboardStatsCore(monthKey: string): Promise<DashboardStats> {
  const { start, end } = monthRange(monthKey);
  const inMonth = and(gte(orders.createdAt, start), lt(orders.createdAt, end));

  const [channelRows, statusRows, topProductRows, lowStockProductRows, lowStockVariantRows, pendingRows] =
    await Promise.all([
      db
        .select({
          source: orders.source,
          count: count(),
          revenue: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
        })
        .from(orders)
        .where(and(inMonth, eq(orders.status, "delivered")))
        .groupBy(orders.source),

      db
        .select({ status: orders.status, count: count() })
        .from(orders)
        .where(and(inMonth, ne(orders.status, "voided")))
        .groupBy(orders.status),

      db
        .select({
          productId: orderItems.productId,
          nameAr: products.nameAr,
          nameFr: products.nameFr,
          qty: sql<number>`sum(${orderItems.qty})::int`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(inMonth, eq(orders.status, "delivered")))
        .groupBy(orderItems.productId, products.nameAr, products.nameFr)
        .orderBy(desc(sql`sum(${orderItems.qty})`))
        .limit(TOP_PRODUCTS_LIMIT),

      db
        .select({
          productId: products.id,
          nameAr: products.nameAr,
          nameFr: products.nameFr,
          sku: products.sku,
          stockQty: products.stockQty,
          lowStockThreshold: products.lowStockThreshold,
        })
        .from(products)
        .where(lte(products.stockQty, products.lowStockThreshold)),

      db
        .select({
          productId: productVariants.productId,
          variantId: productVariants.id,
          nameAr: products.nameAr,
          nameFr: products.nameFr,
          variantNameAr: productVariants.nameAr,
          variantNameFr: productVariants.nameFr,
          sku: productVariants.sku,
          stockQty: productVariants.stockQty,
          lowStockThreshold: products.lowStockThreshold,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(and(isNotNull(productVariants.stockQty), lte(productVariants.stockQty, products.lowStockThreshold))),

      db
        .select({
          id: orders.id,
          code: orders.code,
          status: orders.status,
          customerName: orders.customerName,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(inArray(orders.status, ["pending", "confirmed"]))
        .orderBy(asc(orders.createdAt))
        .limit(PENDING_ORDERS_LIMIT),
    ]);

  const channelSplit: DashboardChannelSplit = {
    web: { count: 0, revenue: 0 },
    pos: { count: 0, revenue: 0 },
  };
  for (const row of channelRows) {
    channelSplit[row.source as "web" | "pos"] = { count: Number(row.count), revenue: Number(row.revenue) };
  }
  const revenue = channelSplit.web.revenue + channelSplit.pos.revenue;
  const deliveredCount = channelSplit.web.count + channelSplit.pos.count;
  const averageOrderValue = deliveredCount > 0 ? Math.round(revenue / deliveredCount) : 0;

  const statusCounts = Object.fromEntries(
    DASHBOARD_STATUS_VALUES.map((status) => [status, 0]),
  ) as DashboardStatusCounts;
  for (const row of statusRows) {
    if (row.status !== "voided") statusCounts[row.status as (typeof DASHBOARD_STATUS_VALUES)[number]] = Number(row.count);
  }

  const topProducts: DashboardTopProduct[] = topProductRows.map((row) => ({
    productId: row.productId as string,
    nameAr: row.nameAr,
    nameFr: row.nameFr,
    qty: Number(row.qty),
  }));

  const lowStock: DashboardLowStockItem[] = [
    ...lowStockProductRows.map((row) => ({
      key: row.productId,
      productId: row.productId,
      variantId: null,
      nameAr: row.nameAr,
      nameFr: row.nameFr,
      variantNameAr: null,
      variantNameFr: null,
      sku: row.sku,
      stockQty: row.stockQty,
      lowStockThreshold: row.lowStockThreshold,
    })),
    ...lowStockVariantRows.map((row) => ({
      key: `${row.productId}:${row.variantId}`,
      productId: row.productId,
      variantId: row.variantId,
      nameAr: row.nameAr,
      nameFr: row.nameFr,
      variantNameAr: row.variantNameAr,
      variantNameFr: row.variantNameFr,
      sku: row.sku,
      stockQty: row.stockQty as number,
      lowStockThreshold: row.lowStockThreshold,
    })),
  ]
    .sort((a, b) => a.stockQty - b.stockQty)
    .slice(0, LOW_STOCK_LIMIT);

  const pendingOrders: DashboardPendingOrder[] = pendingRows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status as OrderStatusValue,
    customerName: row.customerName,
    total: row.total,
    createdAt: row.createdAt.toISOString(),
  }));

  return { month: monthKey, revenue, deliveredCount, averageOrderValue, channelSplit, statusCounts, topProducts, lowStock, pendingOrders };
}

async function getDashboardStatsCached(monthKey: string): Promise<DashboardStats> {
  return unstable_cache(() => getDashboardStatsCore(monthKey), ["admin-dashboard-stats", monthKey], {
    tags: [dashboardMonthTag(monthKey)],
    revalidate: 300,
  })();
}

export async function getDashboardStats(monthParam?: string): Promise<ServiceResult<DashboardStats>> {
  const auth = await requirePermission("dashboard.view");
  if (!auth.ok) return auth;

  const monthKey = normalizeMonthKey(monthParam);
  const data = await getDashboardStatsCached(monthKey);
  return { ok: true, data };
}
