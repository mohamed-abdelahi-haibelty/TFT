import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { categories, orderEvents, orderItems, orders, products, stockMovements, users } from "@/src/db/schema";
import {
  advanceOrderStatusCore,
  cancelOrderCore,
  confirmOrderCore,
  removeOrderItemCore,
  type OrderAdminMessages,
} from "@/src/services/orders";

const messages: OrderAdminMessages = {
  notFound: "not-found",
  invalidTransition: "invalid-transition",
  insufficientStock: "insufficient-stock",
  reasonRequired: "reason-required",
  busCompanyRequired: "bus-company-required",
  paymentMethodRequired: "payment-method-required",
  cannotRemoveOnlyItem: "cannot-remove-only-item",
  invalidInput: "invalid-input",
};

describe("orders-admin service — confirm / cancel / edit state machine", () => {
  let actorId: string;
  let categoryId: string;
  let productAId: string;
  let productBId: string;
  let backorderProductId: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    const [actor] = await db
      .insert(users)
      .values({
        name: "Orders Admin Test Actor",
        email: `orders-admin-test-actor-${Date.now()}@example.com`,
        emailVerified: true,
        role: "admin",
      })
      .returning({ id: users.id });
    actorId = actor.id;

    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار الطلبات", nameFr: "Categorie test commandes", slug: `orders-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [productA] = await db
      .insert(products)
      .values({
        nameAr: "منتج أ",
        nameFr: "Produit A",
        slug: `orders-test-product-a-${Date.now()}`,
        categoryId,
        price: 1000,
        sku: `OTEST-A-${Date.now()}`,
        stockQty: 10,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    productAId = productA.id;

    const [productB] = await db
      .insert(products)
      .values({
        nameAr: "منتج ب",
        nameFr: "Produit B",
        slug: `orders-test-product-b-${Date.now()}`,
        categoryId,
        price: 500,
        sku: `OTEST-B-${Date.now()}`,
        stockQty: 10,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    productBId = productB.id;

    const [backorderProduct] = await db
      .insert(products)
      .values({
        nameAr: "منتج بالطلب المسبق",
        nameFr: "Produit sur commande",
        slug: `orders-test-product-backorder-${Date.now()}`,
        categoryId,
        price: 500,
        sku: `OTEST-BO-${Date.now()}`,
        stockQty: 2,
        allowBackorder: true,
        isActive: true,
      })
      .returning({ id: products.id });
    backorderProductId = backorderProduct.id;
  });

  afterAll(async () => {
    for (const id of createdOrderIds) {
      await db.delete(stockMovements).where(eq(stockMovements.orderId, id));
      await db.delete(orderEvents).where(eq(orderEvents.orderId, id));
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    for (const id of [productAId, productBId, backorderProductId]) {
      await db.delete(stockMovements).where(eq(stockMovements.productId, id));
      await db.delete(products).where(eq(products.id, id));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(users).where(eq(users.id, actorId));
  });

  async function createTestOrder(
    lines: { productId: string; qty: number; unitPrice: number; nameSnapshot: string }[],
  ): Promise<string> {
    const total = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
    const [order] = await db
      .insert(orders)
      .values({
        code: `OTEST-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        source: "web",
        status: "pending",
        customerName: "Test Customer",
        customerPhone: "22212345678",
        city: "ndb",
        delivery: "pickup",
        subtotal: total,
        discountTotal: 0,
        total,
      })
      .returning({ id: orders.id });
    createdOrderIds.push(order.id);

    await db.insert(orderItems).values(
      lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        nameSnapshot: line.nameSnapshot,
        unitPrice: line.unitPrice,
        qty: line.qty,
      })),
    );
    await db.insert(orderEvents).values({ orderId: order.id, type: "created", payload: { source: "web" } });

    return order.id;
  }

  it("confirm decrements stock and writes a web_sale movement; cancel afterwards restores exactly", async () => {
    const orderId = await createTestOrder([{ productId: productAId, qty: 3, unitPrice: 1000, nameSnapshot: "Produit A" }]);

    const confirmResult = await confirmOrderCore(orderId, actorId, messages, { paymentMethod: "bankily" });
    expect(confirmResult.ok).toBe(true);

    const [afterConfirm] = await db.select().from(products).where(eq(products.id, productAId)).limit(1);
    expect(afterConfirm.stockQty).toBe(7);

    const movementsAfterConfirm = await db.select().from(stockMovements).where(eq(stockMovements.orderId, orderId));
    expect(movementsAfterConfirm).toHaveLength(1);
    expect(movementsAfterConfirm[0]).toMatchObject({ productId: productAId, delta: -3, reason: "web_sale" });

    const cancelResult = await cancelOrderCore(orderId, { reason: "customer changed their mind" }, actorId, messages);
    expect(cancelResult.ok).toBe(true);

    const [afterCancel] = await db.select().from(products).where(eq(products.id, productAId)).limit(1);
    expect(afterCancel.stockQty).toBe(10);

    const movementsAfterCancel = await db.select().from(stockMovements).where(eq(stockMovements.orderId, orderId));
    expect(movementsAfterCancel).toHaveLength(2);
    expect(movementsAfterCancel.find((m) => m.reason === "cancel_restock")).toMatchObject({
      productId: productAId,
      delta: 3,
    });

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(orderRow.status).toBe("cancelled");
  });

  it("rejects an invalid transition (pending straight to preparing) with CONFLICT and never mutates the order", async () => {
    const orderId = await createTestOrder([{ productId: productAId, qty: 1, unitPrice: 1000, nameSnapshot: "Produit A" }]);

    const result = await advanceOrderStatusCore(orderId, { target: "preparing" }, actorId, messages);
    expect(result).toEqual({ ok: false, error: { code: "CONFLICT", message: messages.invalidTransition } });

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(orderRow.status).toBe("pending");
  });

  it("confirming with insufficient non-backorder stock conflicts, names the item, and leaves the order pending with stock untouched", async () => {
    const orderId = await createTestOrder([
      { productId: productAId, qty: 999, unitPrice: 1000, nameSnapshot: "Produit A (trop grande quantité)" },
    ]);

    const result = await confirmOrderCore(orderId, actorId, messages, { paymentMethod: "bankily" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.details).toEqual({ itemName: "Produit A (trop grande quantité)" });

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(orderRow.status).toBe("pending");

    const [productRow] = await db.select().from(products).where(eq(products.id, productAId)).limit(1);
    expect(productRow.stockQty).toBe(10);

    const movements = await db.select().from(stockMovements).where(eq(stockMovements.orderId, orderId));
    expect(movements).toHaveLength(0);
  });

  it("a backorder line is allowed to drive stock negative on confirm", async () => {
    const orderId = await createTestOrder([
      { productId: backorderProductId, qty: 5, unitPrice: 500, nameSnapshot: "Produit sur commande" },
    ]);

    const result = await confirmOrderCore(orderId, actorId, messages, { paymentMethod: "bankily" });
    expect(result.ok).toBe(true);

    const [productRow] = await db.select().from(products).where(eq(products.id, backorderProductId)).limit(1);
    expect(productRow.stockQty).toBe(-3);
  });

  it("a web order requires a payment method at confirm, and confirm records it with a note on the order and the event", async () => {
    const orderId = await createTestOrder([{ productId: productAId, qty: 2, unitPrice: 1000, nameSnapshot: "Produit A" }]);

    const noPayment = await confirmOrderCore(orderId, actorId, messages);
    expect(noPayment).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.paymentMethodRequired } });

    const [stillPending] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(stillPending.status).toBe("pending");
    expect(stillPending.paymentMethod).toBeNull();

    const [productRow] = await db.select().from(products).where(eq(products.id, productAId)).limit(1);
    expect(productRow.stockQty).toBe(10);

    const confirmResult = await confirmOrderCore(orderId, actorId, messages, {
      paymentMethod: "bankily",
      paymentNote: "screenshot received",
    });
    expect(confirmResult.ok).toBe(true);

    const [confirmedRow] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(confirmedRow.status).toBe("confirmed");
    expect(confirmedRow.paymentMethod).toBe("bankily");
    expect(confirmedRow.paymentNote).toBe("screenshot received");

    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId));
    const statusEvent = events.find((event) => event.type === "status_changed");
    expect(statusEvent!.payload).toEqual({
      from: "pending",
      to: "confirmed",
      paymentMethod: "bankily",
      paymentNote: "screenshot received",
    });

    await cancelOrderCore(orderId, { reason: "test teardown" }, actorId, messages);
  });

  it("removing a line from a confirmed order restores that line's stock and logs a line_removed event", async () => {
    const orderId = await createTestOrder([
      { productId: productAId, qty: 2, unitPrice: 1000, nameSnapshot: "Produit A" },
      { productId: productBId, qty: 1, unitPrice: 500, nameSnapshot: "Produit B" },
    ]);

    const confirmResult = await confirmOrderCore(orderId, actorId, messages, { paymentMethod: "bankily" });
    expect(confirmResult.ok).toBe(true);

    const [productAAfterConfirm] = await db.select().from(products).where(eq(products.id, productAId)).limit(1);
    expect(productAAfterConfirm.stockQty).toBe(8);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const productALine = items.find((item) => item.productId === productAId)!;

    const removeResult = await removeOrderItemCore(orderId, productALine.id, actorId, messages);
    expect(removeResult.ok).toBe(true);

    const [productAAfterRemove] = await db.select().from(products).where(eq(products.id, productAId)).limit(1);
    expect(productAAfterRemove.stockQty).toBe(10);

    const remainingItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    expect(remainingItems).toHaveLength(1);
    expect(remainingItems[0].productId).toBe(productBId);

    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId));
    const removedEvent = events.find((event) => event.type === "line_removed");
    expect(removedEvent).toBeDefined();
    expect((removedEvent!.payload as { before: { nameSnapshot: string } }).before.nameSnapshot).toBe("Produit A");

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(orderRow.total).toBe(500);
  });

  it("refuses to remove the only remaining line on an order", async () => {
    const orderId = await createTestOrder([{ productId: productAId, qty: 1, unitPrice: 1000, nameSnapshot: "Produit A" }]);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const result = await removeOrderItemCore(orderId, items[0].id, actorId, messages);

    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.cannotRemoveOnlyItem } });
  });
});
