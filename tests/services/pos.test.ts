import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import {
  bundleItems,
  bundles,
  categories,
  orderEvents,
  orderItems,
  orders,
  productVariants,
  products,
  stockMovements,
  users,
} from "@/src/db/schema";
import { completeSaleCore, resolvePosItemCore, type PosMessages } from "@/src/services/pos";
import { voidOrderCore, type OrderAdminMessages } from "@/src/services/orders";

const posMessages: PosMessages = {
  invalidInput: "invalid-input",
  itemUnavailable: "item-unavailable",
  insufficientStock: "insufficient-stock",
};

const orderAdminMessages: OrderAdminMessages = {
  notFound: "not-found",
  invalidTransition: "invalid-transition",
  insufficientStock: "insufficient-stock",
  reasonRequired: "reason-required",
  busCompanyRequired: "bus-company-required",
  paymentMethodRequired: "payment-method-required",
  cannotRemoveOnlyItem: "cannot-remove-only-item",
  invalidInput: "invalid-input",
};

describe("pos service — resolvePosItemCore / completeSaleCore / voidOrderCore", () => {
  let actorId: string;
  let categoryId: string;
  let productId: string;
  let lowStockProductId: string;
  let inactiveProductId: string;
  let variantId: string;
  let variantParentId: string;
  let bundleId: string;
  let bundleComponentId: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    const [actor] = await db
      .insert(users)
      .values({
        name: "POS Test Actor",
        email: `pos-test-actor-${Date.now()}@example.com`,
        emailVerified: true,
        role: "admin",
      })
      .returning({ id: users.id });
    actorId = actor.id;

    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار الكاشير", nameFr: "Categorie test caisse", slug: `pos-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج الكاشير",
        nameFr: "Produit caisse",
        slug: `pos-test-product-${Date.now()}`,
        categoryId,
        price: 1000,
        sku: `PTEST-${Date.now()}`,
        stockQty: 10,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    productId = product.id;

    const [lowStockProduct] = await db
      .insert(products)
      .values({
        nameAr: "منتج قليل المخزون",
        nameFr: "Produit stock faible",
        slug: `pos-test-lowstock-${Date.now()}`,
        categoryId,
        price: 300,
        sku: `PTEST-LOW-${Date.now()}`,
        stockQty: 1,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    lowStockProductId = lowStockProduct.id;

    const [inactiveProduct] = await db
      .insert(products)
      .values({
        nameAr: "منتج غير مفعل",
        nameFr: "Produit inactif",
        slug: `pos-test-inactive-${Date.now()}`,
        categoryId,
        price: 200,
        sku: `PTEST-INACTIVE-${Date.now()}`,
        stockQty: 5,
        allowBackorder: false,
        isActive: false,
      })
      .returning({ id: products.id });
    inactiveProductId = inactiveProduct.id;

    const [variantParent] = await db
      .insert(products)
      .values({
        nameAr: "منتج بمتغيرات",
        nameFr: "Produit avec variante",
        slug: `pos-test-variant-parent-${Date.now()}`,
        categoryId,
        price: 700,
        sku: `PTEST-VP-${Date.now()}`,
        stockQty: 5,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    variantParentId = variantParent.id;

    const [variant] = await db
      .insert(productVariants)
      .values({
        productId: variantParentId,
        nameAr: "أحمر",
        nameFr: "Rouge",
        sku: `VTEST-${Date.now()}`,
        stockQty: 4,
        isActive: true,
      })
      .returning({ id: productVariants.id });
    variantId = variant.id;

    const [bundleComponent] = await db
      .insert(products)
      .values({
        nameAr: "منتج ضمن الصندوق",
        nameFr: "Produit du kit",
        slug: `pos-test-bundle-component-${Date.now()}`,
        categoryId,
        price: 400,
        sku: `PTEST-BC-${Date.now()}`,
        stockQty: 20,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    bundleComponentId = bundleComponent.id;

    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "صندوق اختبار الكاشير",
        nameFr: "Kit test caisse",
        slug: `pos-test-bundle-${Date.now()}`,
        price: 900,
        sku: `BTEST-${Date.now()}`,
        isActive: true,
      })
      .returning({ id: bundles.id });
    bundleId = bundle.id;

    await db.insert(bundleItems).values({ bundleId, productId: bundleComponentId, qty: 2 });
  });

  afterAll(async () => {
    for (const id of createdOrderIds) {
      await db.delete(stockMovements).where(eq(stockMovements.orderId, id));
      await db.delete(orderEvents).where(eq(orderEvents.orderId, id));
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    await db.delete(bundleItems).where(eq(bundleItems.bundleId, bundleId));
    await db.delete(bundles).where(eq(bundles.id, bundleId));
    await db.delete(productVariants).where(eq(productVariants.id, variantId));
    for (const id of [productId, lowStockProductId, inactiveProductId, variantParentId, bundleComponentId]) {
      await db.delete(stockMovements).where(eq(stockMovements.productId, id));
      await db.delete(products).where(eq(products.id, id));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(users).where(eq(users.id, actorId));
  });

  describe("resolvePosItemCore", () => {
    it("resolves a plain product by SKU", async () => {
      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      const result = await resolvePosItemCore(product.sku, "fr", posMessages);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("found");
      if (result.data.status !== "found") return;
      expect(result.data.line.productId).toBe(productId);
      expect(result.data.line.variantId).toBeNull();
      expect(result.data.line.unitPrice).toBe(1000);
    });

    it("resolves a variant by SKU, combining the parent product and variant names", async () => {
      const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
      const result = await resolvePosItemCore(variant.sku, "fr", posMessages);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("found");
      if (result.data.status !== "found") return;
      expect(result.data.line.productId).toBe(variantParentId);
      expect(result.data.line.variantId).toBe(variantId);
      expect(result.data.line.name).toBe("Produit avec variante — Rouge");
    });

    it("resolves a bundle by SKU", async () => {
      const [bundle] = await db.select().from(bundles).where(eq(bundles.id, bundleId)).limit(1);
      const result = await resolvePosItemCore(bundle.sku, "fr", posMessages);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("found");
      if (result.data.status !== "found") return;
      expect(result.data.line.bundleId).toBe(bundleId);
      expect(result.data.line.unitPrice).toBe(900);
    });

    it("returns not_found for an unknown SKU", async () => {
      const result = await resolvePosItemCore("NO-SUCH-SKU", "fr", posMessages);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("not_found");
    });

    it("returns inactive for a deactivated product", async () => {
      const [product] = await db.select().from(products).where(eq(products.id, inactiveProductId)).limit(1);
      const result = await resolvePosItemCore(product.sku, "fr", posMessages);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("inactive");
    });
  });

  describe("completeSaleCore", () => {
    it("creates a delivered POS order with items, a created event, and pos_sale stock movements", async () => {
      const result = await completeSaleCore(
        {
          locale: "fr",
          paymentMethod: "cash",
          lines: [{ kind: "product", productId, qty: 2, overridden: false }],
          removedLines: [],
        },
        actorId,
        posMessages,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      createdOrderIds.push((await db.select({ id: orders.id }).from(orders).where(eq(orders.code, result.data.code)))[0].id);
      expect(result.data.total).toBe(2000);

      const [orderRow] = await db.select().from(orders).where(eq(orders.code, result.data.code)).limit(1);
      expect(orderRow.source).toBe("pos");
      expect(orderRow.status).toBe("delivered");
      expect(orderRow.paymentMethod).toBe("cash");
      expect(orderRow.createdBy).toBe(actorId);

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderRow.id));
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ productId, qty: 2, unitPrice: 1000 });

      const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderRow.id));
      expect(events.find((e) => e.type === "created")).toMatchObject({ payload: { source: "pos" } });

      const movements = await db.select().from(stockMovements).where(eq(stockMovements.orderId, orderRow.id));
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ productId, delta: -2, reason: "pos_sale" });

      const [productRow] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      expect(productRow.stockQty).toBe(8);
    });

    it("expands a bundle line into its component's stock movement", async () => {
      const result = await completeSaleCore(
        {
          locale: "fr",
          paymentMethod: "bankily",
          lines: [{ kind: "bundle", bundleId, qty: 1, overridden: false }],
          removedLines: [],
        },
        actorId,
        posMessages,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [orderRow] = await db.select().from(orders).where(eq(orders.code, result.data.code)).limit(1);
      createdOrderIds.push(orderRow.id);

      const movements = await db.select().from(stockMovements).where(eq(stockMovements.orderId, orderRow.id));
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ productId: bundleComponentId, delta: -2, reason: "pos_sale" });
    });

    it("records buffered line-removal events with their reason and excludes them from the sale", async () => {
      const result = await completeSaleCore(
        {
          locale: "fr",
          paymentMethod: "cash",
          lines: [{ kind: "product", productId, qty: 1, overridden: false }],
          removedLines: [{ nameSnapshot: "Stylo ajouté par erreur", unitPrice: 100, qty: 3, reason: "added_by_mistake" }],
        },
        actorId,
        posMessages,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [orderRow] = await db.select().from(orders).where(eq(orders.code, result.data.code)).limit(1);
      createdOrderIds.push(orderRow.id);

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderRow.id));
      expect(items).toHaveLength(1);

      const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderRow.id));
      const removedEvent = events.find((e) => e.type === "line_removed");
      expect(removedEvent).toBeDefined();
      expect(removedEvent!.payload).toMatchObject({
        before: { nameSnapshot: "Stylo ajouté par erreur", qty: 3 },
        reason: "added_by_mistake",
      });
    });

    it("rejects insufficient non-backorder stock without an override, and persists nothing", async () => {
      const result = await completeSaleCore(
        {
          locale: "fr",
          paymentMethod: "cash",
          lines: [{ kind: "product", productId: lowStockProductId, qty: 5, overridden: false }],
          removedLines: [],
        },
        actorId,
        posMessages,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("CONFLICT");

      const [productRow] = await db.select().from(products).where(eq(products.id, lowStockProductId)).limit(1);
      expect(productRow.stockQty).toBe(1);
    });

    it("an overridden line corrects the recorded stock to exactly cover the sale, then sells it", async () => {
      const result = await completeSaleCore(
        {
          locale: "fr",
          paymentMethod: "cash",
          lines: [{ kind: "product", productId: lowStockProductId, qty: 5, overridden: true }],
          removedLines: [],
        },
        actorId,
        posMessages,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [orderRow] = await db.select().from(orders).where(eq(orders.code, result.data.code)).limit(1);
      createdOrderIds.push(orderRow.id);

      const movements = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.orderId, orderRow.id));
      expect(movements.find((m) => m.reason === "correction")).toMatchObject({ productId: lowStockProductId, delta: 4 });
      expect(movements.find((m) => m.reason === "pos_sale")).toMatchObject({ productId: lowStockProductId, delta: -5 });

      const [productRow] = await db.select().from(products).where(eq(products.id, lowStockProductId)).limit(1);
      expect(productRow.stockQty).toBe(0);
    });
  });

  describe("voidOrderCore", () => {
    it("voids a delivered POS sale, restores stock, and logs a voided event with the reason", async () => {
      const saleResult = await completeSaleCore(
        {
          locale: "fr",
          paymentMethod: "cash",
          lines: [{ kind: "product", productId, qty: 3, overridden: false }],
          removedLines: [],
        },
        actorId,
        posMessages,
      );
      expect(saleResult.ok).toBe(true);
      if (!saleResult.ok) return;
      const [orderRow] = await db.select().from(orders).where(eq(orders.code, saleResult.data.code)).limit(1);
      createdOrderIds.push(orderRow.id);

      const [beforeVoid] = await db.select().from(products).where(eq(products.id, productId)).limit(1);

      const voidResult = await voidOrderCore(orderRow.id, { reason: "Erreur de caisse" }, actorId, orderAdminMessages);
      expect(voidResult.ok).toBe(true);

      const [afterVoid] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      expect(afterVoid.stockQty).toBe(beforeVoid.stockQty + 3);

      const [voidedOrder] = await db.select().from(orders).where(eq(orders.id, orderRow.id)).limit(1);
      expect(voidedOrder.status).toBe("voided");

      const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderRow.id));
      const voidedEvent = events.find((e) => e.type === "voided");
      expect(voidedEvent).toMatchObject({ payload: { reason: "Erreur de caisse" } });

      const movements = await db.select().from(stockMovements).where(eq(stockMovements.orderId, orderRow.id));
      expect(movements.find((m) => m.reason === "void_restock")).toMatchObject({ productId, delta: 3 });
    });

    it("refuses to void a non-POS or non-delivered order", async () => {
      const [webOrder] = await db
        .insert(orders)
        .values({
          code: `WTEST-${Date.now()}`,
          source: "web",
          status: "delivered",
          subtotal: 500,
          discountTotal: 0,
          total: 500,
        })
        .returning({ id: orders.id });
      createdOrderIds.push(webOrder.id);

      const result = await voidOrderCore(webOrder.id, { reason: "test" }, actorId, orderAdminMessages);
      expect(result).toEqual({ ok: false, error: { code: "CONFLICT", message: orderAdminMessages.invalidTransition } });
    });
  });
});
