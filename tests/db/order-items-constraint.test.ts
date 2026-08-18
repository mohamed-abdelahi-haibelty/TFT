import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { bundles, categories, orderItems, orders, products } from "@/src/db/schema";

describe("order_items product/bundle XOR check constraint", () => {
  let categoryId: string;
  let productId: string;
  let bundleId: string;
  let orderId: string;

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "اختبار", nameFr: "Test", slug: `test-category-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج اختبار",
        nameFr: "Produit test",
        slug: `test-product-${Date.now()}`,
        categoryId,
        price: 100,
        sku: `TEST-${Date.now()}`,
      })
      .returning({ id: products.id });
    productId = product.id;

    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "حزمة اختبار",
        nameFr: "Bundle test",
        slug: `test-bundle-${Date.now()}`,
        price: 100,
        sku: `TEST-B-${Date.now()}`,
      })
      .returning({ id: bundles.id });
    bundleId = bundle.id;

    const [order] = await db
      .insert(orders)
      .values({
        code: `TEST-${Date.now()}`,
        source: "pos",
        status: "delivered",
        subtotal: 100,
        total: 100,
      })
      .returning({ id: orders.id });
    orderId = order.id;
  });

  afterAll(async () => {
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(bundles).where(eq(bundles.id, bundleId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(categories).where(eq(categories.id, categoryId));
  });

  it("rejects a row with both product_id and bundle_id set", async () => {
    await expect(
      db.insert(orderItems).values({
        orderId,
        productId,
        bundleId,
        nameSnapshot: "Both set",
        unitPrice: 100,
        qty: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects a row with neither product_id nor bundle_id set", async () => {
    await expect(
      db.insert(orderItems).values({
        orderId,
        nameSnapshot: "Neither set",
        unitPrice: 100,
        qty: 1,
      }),
    ).rejects.toThrow();
  });

  it("accepts a row with only product_id set", async () => {
    const [row] = await db
      .insert(orderItems)
      .values({
        orderId,
        productId,
        nameSnapshot: "Product only",
        unitPrice: 100,
        qty: 1,
      })
      .returning({ id: orderItems.id });

    expect(row.id).toBeDefined();

    await db.delete(orderItems).where(eq(orderItems.id, row.id));
  });
});
