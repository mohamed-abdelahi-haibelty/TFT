import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { categories, productVariants, products, stockMovements, users } from "@/src/db/schema";
import { adjustStockCore, type InventoryMessages } from "@/src/services/inventory";

const messages: InventoryMessages = {
  invalidInput: "invalid-input",
  notFound: "not-found",
  belowZero: "below-zero",
};

// `listInventoryItems`/`listStockMovements`/`getInventoryItemName` call
// `requireUser()` directly (no `Core` split, same as `listProducts` /
// `getProduct` / `listCategories`) — they need a real Next.js request scope
// (`next/headers`) and are exercised manually/in the browser instead, same
// convention every other list-style service function in this codebase
// follows (see products.test.ts, categories.test.ts).
describe("inventory service — adjustStockCore", () => {
  let actorId: string;
  let categoryId: string;
  let productId: string;
  let backorderProductId: string;
  let variantParentId: string;
  let variantId: string;
  let sharedStockVariantId: string;

  beforeAll(async () => {
    const [actor] = await db
      .insert(users)
      .values({
        name: "Inventory Test Actor",
        email: `inventory-test-actor-${Date.now()}@example.com`,
        emailVerified: true,
        role: "admin",
      })
      .returning({ id: users.id });
    actorId = actor.id;

    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار الجرد", nameFr: "Categorie test inventaire", slug: `inv-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج الجرد",
        nameFr: "Produit inventaire",
        slug: `inv-test-product-${Date.now()}`,
        categoryId,
        price: 500,
        sku: `ITEST-${Date.now()}`,
        stockQty: 10,
        lowStockThreshold: 5,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    productId = product.id;

    const [backorderProduct] = await db
      .insert(products)
      .values({
        nameAr: "منتج بطلب مسبق",
        nameFr: "Produit en précommande",
        slug: `inv-test-backorder-${Date.now()}`,
        categoryId,
        price: 500,
        sku: `ITEST-BO-${Date.now()}`,
        stockQty: 2,
        lowStockThreshold: 5,
        allowBackorder: true,
        isActive: true,
      })
      .returning({ id: products.id });
    backorderProductId = backorderProduct.id;

    const [variantParent] = await db
      .insert(products)
      .values({
        nameAr: "منتج بمتغيرات الجرد",
        nameFr: "Produit avec variante inventaire",
        slug: `inv-test-variant-parent-${Date.now()}`,
        categoryId,
        price: 700,
        sku: `ITEST-VP-${Date.now()}`,
        stockQty: 3,
        lowStockThreshold: 5,
        allowBackorder: false,
        isActive: true,
      })
      .returning({ id: products.id });
    variantParentId = variantParent.id;

    const [variant] = await db
      .insert(productVariants)
      .values({
        productId: variantParentId,
        nameAr: "أزرق",
        nameFr: "Bleu",
        sku: `IVTEST-${Date.now()}`,
        stockQty: 6,
        isActive: true,
      })
      .returning({ id: productVariants.id });
    variantId = variant.id;

    // A variant with no own stock (shares the parent product's stock) —
    // must never surface as its own inventory row (task 15 scope: only
    // variants that track their own stock get a row).
    const [sharedStockVariant] = await db
      .insert(productVariants)
      .values({
        productId: variantParentId,
        nameAr: "أخضر",
        nameFr: "Vert",
        sku: `IVTEST-SHARED-${Date.now()}`,
        stockQty: null,
        isActive: true,
      })
      .returning({ id: productVariants.id });
    sharedStockVariantId = sharedStockVariant.id;
  });

  afterAll(async () => {
    for (const id of [productId, backorderProductId, variantParentId]) {
      await db.delete(stockMovements).where(eq(stockMovements.productId, id));
    }
    await db.delete(productVariants).where(eq(productVariants.id, variantId));
    await db.delete(productVariants).where(eq(productVariants.id, sharedStockVariantId));
    for (const id of [productId, backorderProductId, variantParentId]) {
      await db.delete(products).where(eq(products.id, id));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(users).where(eq(users.id, actorId));
  });

  describe("adjustStockCore", () => {
    it("delta mode: increments qty and logs a movement with actor + reason", async () => {
      const result = await adjustStockCore(
        { productId, variantId: null, mode: "delta", value: 5, reason: "restock", note: "Livraison fournisseur" },
        actorId,
        messages,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.stockQty).toBe(15);

      const [productRow] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      expect(productRow.stockQty).toBe(15);

      const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, productId));
      const movement = movements.find((m) => m.reason === "restock");
      expect(movement).toMatchObject({ delta: 5, reason: "restock", actorId, note: "Livraison fournisseur" });
    });

    it("absolute mode: sets qty to the given value and logs the derived delta", async () => {
      const result = await adjustStockCore(
        { productId, variantId: null, mode: "absolute", value: 12, reason: "correction", note: null },
        actorId,
        messages,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.stockQty).toBe(12);

      const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, productId));
      const movement = movements.find((m) => m.reason === "correction");
      expect(movement).toMatchObject({ delta: -3 });
    });

    it("refuses to adjust a non-backorder item below zero, and persists nothing", async () => {
      const [before] = await db.select().from(products).where(eq(products.id, productId)).limit(1);

      const result = await adjustStockCore(
        { productId, variantId: null, mode: "delta", value: -1000, reason: "manual_adjust", note: null },
        actorId,
        messages,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("CONFLICT");

      const [after] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      expect(after.stockQty).toBe(before.stockQty);
    });

    it("allows a backorder item to go negative", async () => {
      const result = await adjustStockCore(
        { productId: backorderProductId, variantId: null, mode: "delta", value: -5, reason: "manual_adjust", note: null },
        actorId,
        messages,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.stockQty).toBe(-3);
    });

    it("adjusts a variant's own stock, not the parent product's", async () => {
      const [parentBefore] = await db.select().from(products).where(eq(products.id, variantParentId)).limit(1);

      const result = await adjustStockCore(
        { productId: variantParentId, variantId, mode: "delta", value: 4, reason: "restock", note: null },
        actorId,
        messages,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.stockQty).toBe(10);

      const [variantRow] = await db.select().from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
      expect(variantRow.stockQty).toBe(10);

      const [parentAfter] = await db.select().from(products).where(eq(products.id, variantParentId)).limit(1);
      expect(parentAfter.stockQty).toBe(parentBefore.stockQty);

      const movements = await db.select().from(stockMovements).where(eq(stockMovements.variantId, variantId));
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ productId: variantParentId, variantId, delta: 4 });
    });

    it("a zero-delta absolute adjustment is a no-op and writes no movement", async () => {
      const [before] = await db.select().from(products).where(eq(products.id, productId)).limit(1);

      const result = await adjustStockCore(
        { productId, variantId: null, mode: "absolute", value: before.stockQty, reason: "manual_adjust", note: null },
        actorId,
        messages,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, productId));
      expect(movements.filter((m) => m.delta === 0)).toHaveLength(0);
    });

    it("rejects a variant that shares its parent's stock (no own stockQty)", async () => {
      const result = await adjustStockCore(
        { productId: variantParentId, variantId: sharedStockVariantId, mode: "delta", value: 1, reason: "restock", note: null },
        actorId,
        messages,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("NOT_FOUND");
    });

    it("the sum of an item's movements equals its current stock", async () => {
      const [productRow] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, productId));
      const sum = movements.filter((m) => m.variantId === null).reduce((total, m) => total + m.delta, 0);
      // The seeded initial stock (10) was never itself logged as a movement
      // (only `createProductCore`'s own insert would have done that) — so
      // the invariant here is starting stock + Σ(movement deltas) = current.
      expect(10 + sum).toBe(productRow.stockQty);
    });
  });
});
