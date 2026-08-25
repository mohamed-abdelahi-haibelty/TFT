import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { categories, orderItems, orders, products } from "@/src/db/schema";
import { getDashboardStatsCore } from "@/src/services/dashboard";

// A fixed, past month keeps this test's revenue/status/channel/top-product
// figures exact — no other suite writes orders dated here — while low-stock
// and pending-order reads are unavoidably global (task 16's own scope: "not
// month scoped"), so those are checked by inclusion rather than exact
// equality against a live dev database that other tests also touch.
const TEST_MONTH = "2023-06";
const TEST_MONTH_START = new Date(Date.UTC(2023, 5, 1));
const TEST_MONTH_END = new Date(Date.UTC(2023, 6, 1));

/**
 * This suite owns `TEST_MONTH` outright, so it enforces that rather than
 * assuming it: every order dated inside the window is removed before the
 * fixtures go in and again after they come out.
 *
 * Tracking ids alone was not enough. A run that failed an assertion and then
 * hit an error partway through its own teardown left three orders behind in
 * 2023-06, and every later run of this file failed on counts it could not see
 * the cause of — an exact-count assertion over a shared dev database has to be
 * able to heal itself.
 */
async function purgeTestMonthOrders() {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(gte(orders.createdAt, TEST_MONTH_START), lt(orders.createdAt, TEST_MONTH_END)));

  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);
  await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
  await db.delete(orders).where(inArray(orders.id, ids));
}

describe("dashboard service — month aggregation (task 16)", () => {
  let categoryId: string;
  let productAId: string;
  let productBId: string;
  let lowStockProductId: string;
  const createdOrderIds: string[] = [];
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    await purgeTestMonthOrders();

    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار اللوحة", nameFr: "Categorie test tableau de bord", slug: `dash-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [productA] = await db
      .insert(products)
      .values({
        nameAr: "منتج أ",
        nameFr: "Produit A",
        slug: `dash-test-product-a-${Date.now()}`,
        categoryId,
        price: 1000,
        sku: `DTEST-A-${Date.now()}`,
        stockQty: 50,
        isActive: true,
      })
      .returning({ id: products.id });
    productAId = productA.id;
    createdProductIds.push(productAId);

    const [productB] = await db
      .insert(products)
      .values({
        nameAr: "منتج ب",
        nameFr: "Produit B",
        slug: `dash-test-product-b-${Date.now()}`,
        categoryId,
        price: 500,
        sku: `DTEST-B-${Date.now()}`,
        stockQty: 50,
        isActive: true,
      })
      .returning({ id: products.id });
    productBId = productB.id;
    createdProductIds.push(productBId);

    const [lowStockProduct] = await db
      .insert(products)
      .values({
        nameAr: "منتج منخفض المخزون",
        nameFr: "Produit stock faible",
        slug: `dash-test-product-low-${Date.now()}`,
        categoryId,
        price: 300,
        sku: `DTEST-LOW-${Date.now()}`,
        stockQty: 2,
        lowStockThreshold: 5,
        isActive: true,
      })
      .returning({ id: products.id });
    lowStockProductId = lowStockProduct.id;
    createdProductIds.push(lowStockProductId);
  });

  afterAll(async () => {
    // Month-scoped, not id-scoped, so nothing survives a partial failure.
    await purgeTestMonthOrders();
    for (const id of createdOrderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    for (const id of createdProductIds) {
      await db.delete(products).where(eq(products.id, id));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
  });

  async function insertOrder(opts: {
    source: "web" | "pos";
    status: "pending" | "confirmed" | "delivered" | "cancelled" | "voided";
    createdAt: Date;
    items: { productId: string; qty: number; unitPrice: number; nameSnapshot: string }[];
  }): Promise<string> {
    const total = opts.items.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
    const [order] = await db
      .insert(orders)
      .values({
        code: `DTEST-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        source: opts.source,
        status: opts.status,
        customerName: "Dashboard Test Customer",
        customerPhone: "22212345678",
        city: "ndb",
        delivery: "pickup",
        subtotal: total,
        discountTotal: 0,
        total,
        createdAt: opts.createdAt,
      })
      .returning({ id: orders.id });
    createdOrderIds.push(order.id);

    if (opts.items.length > 0) {
      await db.insert(orderItems).values(
        opts.items.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          nameSnapshot: line.nameSnapshot,
          unitPrice: line.unitPrice,
          qty: line.qty,
        })),
      );
    }

    return order.id;
  }

  it("hand-computed fixture: revenue, AOV, channel split, status counts, and top products all match", async () => {
    // Web delivered #1 — Product A x3 @ 1000 = 3000
    await insertOrder({
      source: "web",
      status: "delivered",
      createdAt: new Date(2023, 5, 10),
      items: [{ productId: productAId, qty: 3, unitPrice: 1000, nameSnapshot: "Produit A" }],
    });
    // Web delivered #2 — Product B x2 @ 500 = 1000
    await insertOrder({
      source: "web",
      status: "delivered",
      createdAt: new Date(2023, 5, 15),
      items: [{ productId: productBId, qty: 2, unitPrice: 500, nameSnapshot: "Produit B" }],
    });
    // POS delivered — Product A x1 @ 1000 = 1000
    await insertOrder({
      source: "pos",
      status: "delivered",
      createdAt: new Date(2023, 5, 20),
      items: [{ productId: productAId, qty: 1, unitPrice: 1000, nameSnapshot: "Produit A" }],
    });
    // Cancelled — counts in statusCounts only, never revenue or top products
    const cancelledId = await insertOrder({
      source: "web",
      status: "cancelled",
      createdAt: new Date(2023, 5, 5),
      items: [{ productId: productAId, qty: 5, unitPrice: 1000, nameSnapshot: "Produit A" }],
    });
    // Voided — excluded everywhere, including statusCounts
    await insertOrder({
      source: "pos",
      status: "voided",
      createdAt: new Date(2023, 5, 25),
      items: [{ productId: productAId, qty: 9, unitPrice: 1000, nameSnapshot: "Produit A" }],
    });
    // Just outside the month (July 1st, the exclusive upper bound) — must not leak in
    await insertOrder({
      source: "web",
      status: "delivered",
      createdAt: new Date(2023, 6, 1),
      items: [{ productId: productAId, qty: 100, unitPrice: 1000, nameSnapshot: "Produit A" }],
    });

    expect(cancelledId).toBeTruthy();

    const stats = await getDashboardStatsCore(TEST_MONTH);

    expect(stats.month).toBe(TEST_MONTH);
    expect(stats.revenue).toBe(5000);
    expect(stats.deliveredCount).toBe(3);
    expect(stats.averageOrderValue).toBe(Math.round(5000 / 3));
    expect(stats.channelSplit).toEqual({
      web: { count: 2, revenue: 4000 },
      pos: { count: 1, revenue: 1000 },
    });
    expect(stats.statusCounts).toEqual({
      pending: 0,
      confirmed: 0,
      preparing: 0,
      shipped: 0,
      arrived: 0,
      ready: 0,
      delivered: 3,
      cancelled: 1,
    });
    expect(stats.statusCounts).not.toHaveProperty("voided");

    const topA = stats.topProducts.find((p) => p.productId === productAId);
    const topB = stats.topProducts.find((p) => p.productId === productBId);
    expect(topA?.qty).toBe(4);
    expect(topB?.qty).toBe(2);
    expect(stats.topProducts.indexOf(topA!)).toBeLessThan(stats.topProducts.indexOf(topB!));
  });

  it("surfaces a low-stock product and a pending order (both intentionally not month-scoped)", async () => {
    const pendingId = await insertOrder({
      source: "web",
      status: "pending",
      createdAt: new Date(2023, 5, 1),
      items: [{ productId: productAId, qty: 1, unitPrice: 1000, nameSnapshot: "Produit A" }],
    });

    const stats = await getDashboardStatsCore(TEST_MONTH);

    const lowStockEntry = stats.lowStock.find((item) => item.productId === lowStockProductId);
    expect(lowStockEntry).toMatchObject({ stockQty: 2, lowStockThreshold: 5 });

    expect(stats.pendingOrders.some((order) => order.id === pendingId)).toBe(true);
  });
});
