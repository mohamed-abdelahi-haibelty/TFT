import { eq, like } from "drizzle-orm";
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
} from "@/src/db/schema";
import { createOrderCore, type OrderMessages } from "@/src/services/orders";

const messages: OrderMessages = { invalidInput: "invalid input", itemsUnavailable: "items unavailable" };

describe("orders service — createOrderCore", () => {
  let categoryId: string;
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdBundleIds: string[] = [];
  const createdOrderIds: string[] = [];

  function unique() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function makeProduct(overrides: Partial<{ price: number; discountPrice: number | null; stockQty: number; allowBackorder: boolean; isActive: boolean }> = {}) {
    const id = unique();
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج اختبار الطلب",
        nameFr: `Produit commande ${id}`,
        slug: `order-test-product-${id}`,
        categoryId,
        price: overrides.price ?? 1000,
        discountPrice: overrides.discountPrice ?? null,
        sku: `ORD-P-${id}`,
        stockQty: overrides.stockQty ?? 10,
        allowBackorder: overrides.allowBackorder ?? false,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function makeVariant(productId: string, overrides: Partial<{ stockQty: number | null }> = {}) {
    const id = unique();
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        nameAr: "متغير",
        nameFr: `Variante ${id}`,
        sku: `ORD-V-${id}`,
        stockQty: overrides.stockQty ?? 5,
      })
      .returning({ id: productVariants.id });
    createdVariantIds.push(variant.id);
    return variant.id;
  }

  async function makeBundle(productId: string, overrides: Partial<{ price: number; qty: number; isActive: boolean }> = {}) {
    const id = unique();
    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "صندوق اختبار الطلب",
        nameFr: `Boîte commande ${id}`,
        slug: `order-test-bundle-${id}`,
        price: overrides.price ?? 1500,
        sku: `ORD-B-${id}`,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: bundles.id });
    createdBundleIds.push(bundle.id);

    await db.insert(bundleItems).values({
      bundleId: bundle.id,
      productId,
      qty: overrides.qty ?? 1,
    });

    return bundle.id;
  }

  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      locale: "ar",
      customerName: "فاطمتو",
      phone: "22345678",
      city: "ndb",
      items: [],
      ...overrides,
    };
  }

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار الطلب", nameFr: "Catégorie commande test", slug: `order-test-category-${unique()}` })
      .returning({ id: categories.id });
    categoryId = category.id;
  });

  afterAll(async () => {
    for (const orderId of createdOrderIds) {
      await db.delete(orders).where(eq(orders.id, orderId));
    }
    for (const bundleId of createdBundleIds) {
      await db.delete(bundleItems).where(eq(bundleItems.bundleId, bundleId));
      await db.delete(bundles).where(eq(bundles.id, bundleId));
    }
    for (const variantId of createdVariantIds) {
      await db.delete(productVariants).where(eq(productVariants.id, variantId));
    }
    for (const productId of createdProductIds) {
      await db.delete(products).where(eq(products.id, productId));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
  });

  it("rejects an empty cart", async () => {
    const result = await createOrderCore(baseInput({ items: [] }), messages);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an invalid phone number", async () => {
    const productId = await makeProduct();
    const result = await createOrderCore(
      baseInput({ phone: "12345678", items: [{ key: "k1", kind: "product", productId, qty: 1 }] }),
      messages,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("re-prices server-side and ignores any client-supplied price, creating order + items + a created event", async () => {
    const productId = await makeProduct({ price: 1000, discountPrice: 800 });
    const bundleProductId = await makeProduct({ price: 500 });
    const bundleId = await makeBundle(bundleProductId, { price: 1500 });

    const result = await createOrderCore(
      baseInput({
        city: "nkc",
        items: [
          // A client-supplied `unitPrice` is not even part of the schema —
          // stray fields like this are silently stripped by Zod, proving
          // the server can't be steered by anything the client sends.
          { key: "k1", kind: "product", productId, qty: 2, unitPrice: 1 },
          { key: "k2", kind: "bundle", bundleId, qty: 1, unitPrice: 1 },
        ],
      }),
      messages,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push((await db.select({ id: orders.id }).from(orders).where(eq(orders.code, result.data.code)))[0].id);

    // Product has an active discount (800 < 1000) and no promotion, so the
    // discount price wins per the pricing service's own precedence rule.
    expect(result.data.total).toBe(800 * 2 + 1500);
    expect(result.data.subtotal).toBe(1000 * 2 + 1500);
    expect(result.data.discountTotal).toBe(200 * 2);

    const [orderRow] = await db.select().from(orders).where(eq(orders.code, result.data.code));
    expect(orderRow.status).toBe("pending");
    expect(orderRow.source).toBe("web");
    expect(orderRow.delivery).toBe("bus");
    expect(orderRow.total).toBe(result.data.total);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderRow.id));
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.productId === productId)?.unitPrice).toBe(800);
    expect(items.find((item) => item.bundleId === bundleId)?.unitPrice).toBe(1500);

    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderRow.id));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("created");
  });

  it("derives pickup delivery for ndb and bus delivery for other cities", async () => {
    const productId = await makeProduct();
    const result = await createOrderCore(
      baseInput({ city: "ndb", items: [{ key: "k1", kind: "product", productId, qty: 1 }] }),
      messages,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [orderRow] = await db.select().from(orders).where(eq(orders.code, result.data.code));
    createdOrderIds.push(orderRow.id);
    expect(orderRow.delivery).toBe("pickup");
  });

  it("rejects a non-backorder product that is out of stock — all-or-nothing, nothing saved", async () => {
    const availableProductId = await makeProduct({ stockQty: 10 });
    const outOfStockProductId = await makeProduct({ stockQty: 0, allowBackorder: false });

    const orderCountBefore = (await db.select().from(orders)).length;

    const result = await createOrderCore(
      baseInput({
        items: [
          { key: "k1", kind: "product", productId: availableProductId, qty: 1 },
          { key: "k2", kind: "product", productId: outOfStockProductId, qty: 1 },
        ],
      }),
      messages,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.details).toEqual({ unavailableKeys: ["k2"] });

    const orderCountAfter = (await db.select().from(orders)).length;
    expect(orderCountAfter).toBe(orderCountBefore);
  });

  it("allows a backorder product regardless of stock", async () => {
    const productId = await makeProduct({ stockQty: 0, allowBackorder: true });
    const result = await createOrderCore(
      baseInput({ items: [{ key: "k1", kind: "product", productId, qty: 3 }] }),
      messages,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [orderRow] = await db.select().from(orders).where(eq(orders.code, result.data.code));
    createdOrderIds.push(orderRow.id);
  });

  it("rejects a bundle whose components can't cover the requested qty", async () => {
    const componentProductId = await makeProduct({ stockQty: 1, allowBackorder: false });
    const bundleId = await makeBundle(componentProductId, { qty: 1 });

    const result = await createOrderCore(
      baseInput({ items: [{ key: "k1", kind: "bundle", bundleId, qty: 2 }] }),
      messages,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.details).toEqual({ unavailableKeys: ["k1"] });
  });

  it("prices a variant from its parent product and stamps a combined name snapshot", async () => {
    const productId = await makeProduct({ price: 2000 });
    const variantId = await makeVariant(productId, { stockQty: 3 });

    const result = await createOrderCore(
      baseInput({ items: [{ key: "k1", kind: "product", productId, variantId, qty: 1 }] }),
      messages,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdOrderIds.push((await db.select({ id: orders.id }).from(orders).where(eq(orders.code, result.data.code)))[0].id);

    expect(result.data.items[0].unitPrice).toBe(2000);
    expect(result.data.items[0].name).toContain("—");
  });

  it("generates sequential TFT-YYMM-NNN codes within the same month", async () => {
    const productId = await makeProduct();

    const first = await createOrderCore(baseInput({ items: [{ key: "k1", kind: "product", productId, qty: 1 }] }), messages);
    const second = await createOrderCore(baseInput({ items: [{ key: "k1", kind: "product", productId, qty: 1 }] }), messages);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const [firstRow] = await db.select({ id: orders.id }).from(orders).where(eq(orders.code, first.data.code));
    const [secondRow] = await db.select({ id: orders.id }).from(orders).where(eq(orders.code, second.data.code));
    createdOrderIds.push(firstRow.id, secondRow.id);

    const prefix = first.data.code.slice(0, first.data.code.lastIndexOf("-"));
    expect(second.data.code.startsWith(prefix)).toBe(true);

    const firstSeq = Number.parseInt(first.data.code.slice(first.data.code.lastIndexOf("-") + 1), 10);
    const secondSeq = Number.parseInt(second.data.code.slice(second.data.code.lastIndexOf("-") + 1), 10);
    expect(secondSeq).toBe(firstSeq + 1);
    expect(first.data.code).toMatch(/^TFT-\d{4}-\d{3,}$/);

    const monthRows = await db.select().from(orders).where(like(orders.code, `${prefix}-%`));
    expect(monthRows.length).toBeGreaterThanOrEqual(2);
  });
});
