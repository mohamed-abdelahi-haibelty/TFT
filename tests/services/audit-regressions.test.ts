import { eq, inArray, like, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, withTransaction } from "@/src/db/client";
import {
  bundleItems,
  bundles,
  categories,
  orderEvents,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
  promotionItems,
  promotions,
  stockMovements,
  users,
  variantImages,
} from "@/src/db/schema";
import { insertWithUniqueSku } from "@/src/lib/sku";
import { insertWithUniqueOrderCode, orderCodeMonthPrefix } from "@/src/lib/order-code";
import { adjustStockCore, type InventoryMessages } from "@/src/services/inventory";
import { getEffectivePrice } from "@/src/services/pricing";
import {
  confirmOrderCore,
  createOrderCore,
  type OrderAdminMessages,
  type OrderMessages,
} from "@/src/services/orders";
import { getStorefrontProductBySlugCore } from "@/src/services/storefront";

/**
 * Regression coverage for the audit fixes. Every case here is a behaviour the
 * suite did not previously exercise — which is precisely why each of these
 * shipped: they are all correct-looking code whose failure mode only appears
 * under a gap, a race, or a retry.
 */

const orderMessages: OrderMessages = { invalidInput: "invalid input", itemsUnavailable: "items unavailable" };

const adminMessages: OrderAdminMessages = {
  notFound: "not-found",
  invalidTransition: "invalid-transition",
  insufficientStock: "insufficient-stock",
  reasonRequired: "reason-required",
  busCompanyRequired: "bus-company-required",
  paymentMethodRequired: "payment-method-required",
  cannotRemoveOnlyItem: "cannot-remove-only-item",
  invalidInput: "invalid-input",
};

const inventoryMessages: InventoryMessages = {
  invalidInput: "invalid-input",
  notFound: "not-found",
  belowZero: "below-zero",
  stockMoved: "stock-moved",
};

describe("audit regressions", () => {
  let categoryId: string;
  let actorId: string;
  const createdProductIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPromotionIds: string[] = [];

  function unique() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function makeProduct(
    overrides: Partial<{ price: number; discountPrice: number | null; stockQty: number; allowBackorder: boolean }> = {},
  ) {
    const id = unique();
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج تراجع",
        nameFr: `Produit regression ${id}`,
        slug: `regression-product-${id}`,
        categoryId,
        price: overrides.price ?? 1000,
        discountPrice: overrides.discountPrice ?? null,
        sku: `REG-P-${id}`,
        stockQty: overrides.stockQty ?? 5,
        allowBackorder: overrides.allowBackorder ?? false,
        isActive: true,
      })
      .returning({ id: products.id, slug: products.slug });
    createdProductIds.push(product.id);
    return product;
  }

  beforeAll(async () => {
    await purgeFixtures();

    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة تراجع", nameFr: "Catégorie regression", slug: `regression-category-${unique()}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [actor] = await db
      .insert(users)
      .values({ name: "Regression actor", email: `regression-${unique()}@example.test`, role: "admin" })
      .returning({ id: users.id });
    actorId = actor.id;
  });

  /**
   * Removes everything this suite creates, found by its own naming prefixes
   * rather than by a list of tracked ids.
   *
   * Tracking ids alone was not enough, and the failure was not hypothetical:
   * one delete throwing partway through a sequential teardown loop stranded
   * every row after it, and because this suite runs against the same Neon
   * branch the deployed site reads, six `isActive` test products ended up on
   * the live customer catalog and in `sitemap.xml`. Prefix-scoped cleanup on
   * both sides of the run is what makes that unrecoverable-by-hand outcome
   * impossible: a crashed run is cleaned by the next one.
   */
  async function purgeFixtures() {
    const leaked = await db
      .select({ id: products.id })
      .from(products)
      .where(or(like(products.slug, "regression-%"), like(products.sku, "REG-P-%")));
    const productIds = leaked.map((row) => row.id);

    if (productIds.length) {
      const variantIds = (
        await db.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.productId, productIds))
      ).map((row) => row.id);

      // `order_items.product_id` is restrict, not cascade, so any order
      // referencing a fixture product has to go before the product does.
      const orderIds = [
        ...new Set(
          (await db.select({ orderId: orderItems.orderId }).from(orderItems).where(inArray(orderItems.productId, productIds))).map(
            (row) => row.orderId,
          ),
        ),
      ];

      for (const orderId of orderIds) {
        await db.delete(stockMovements).where(eq(stockMovements.orderId, orderId));
        await db.delete(orderEvents).where(eq(orderEvents.orderId, orderId));
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(orders).where(eq(orders.id, orderId));
      }

      if (variantIds.length) {
        await db.delete(variantImages).where(inArray(variantImages.variantId, variantIds));
        await db.delete(stockMovements).where(inArray(stockMovements.variantId, variantIds));
        await db.delete(productVariants).where(inArray(productVariants.id, variantIds));
      }

      await db.delete(promotionItems).where(inArray(promotionItems.productId, productIds));
      await db.delete(bundleItems).where(inArray(bundleItems.productId, productIds));
      await db.delete(productImages).where(inArray(productImages.productId, productIds));
      await db.delete(stockMovements).where(inArray(stockMovements.productId, productIds));
      await db.delete(products).where(inArray(products.id, productIds));
    }

    for (const orderId of createdOrderIds) {
      await db.delete(stockMovements).where(eq(stockMovements.orderId, orderId));
      await db.delete(orderEvents).where(eq(orderEvents.orderId, orderId));
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }

    for (const promotionId of createdPromotionIds) {
      await db.delete(promotionItems).where(eq(promotionItems.promotionId, promotionId));
      await db.delete(promotions).where(eq(promotions.id, promotionId));
    }

    // `bundle_items.bundle_id` cascades, so removing the bundle takes its
    // component rows with it.
    await db.delete(bundles).where(like(bundles.slug, "regression-%"));
    await db.delete(users).where(like(users.email, "regression-%"));
    await db.delete(categories).where(like(categories.slug, "regression-%"));
  }

  afterAll(async () => {
    await purgeFixtures();
  });

  // --- C-3: sequences must survive a gap ---------------------------------

  /** Creates a product through the real SKU generator, as `createProductCore` does. */
  async function makeProductWithGeneratedSku() {
    const id = unique();
    const created = await insertWithUniqueSku(products, products.sku, "P", "products_sku_unique", (sku) =>
      db
        .insert(products)
        .values({
          nameAr: "منتج تسلسل",
          nameFr: `Produit sequence ${id}`,
          slug: `regression-sequence-${id}`,
          categoryId,
          price: 1000,
          sku,
          stockQty: 1,
          isActive: true,
        })
        .returning({ id: products.id, sku: products.sku })
        .then(([row]) => row),
    );
    createdProductIds.push(created.id);
    return created;
  }

  it("issues a SKU above the high-water mark even when earlier rows were deleted", async () => {
    // The old `COUNT(*) + 1` collided forever after any non-tail delete, and
    // the retry recomputed the same number each attempt, so product creation
    // stayed broken until the count caught back up.
    const first = await makeProductWithGeneratedSku();
    const second = await makeProductWithGeneratedSku();
    expect(second.sku > first.sku).toBe(true);

    // Delete the *earlier* of the two, leaving a gap below the mark.
    await db.delete(products).where(eq(products.id, first.id));
    createdProductIds.splice(createdProductIds.indexOf(first.id), 1);

    const third = await makeProductWithGeneratedSku();
    expect(third.sku > second.sku).toBe(true);
  });

  it("issues an order code above the month's high-water mark after a rollback deleted one", async () => {
    const now = new Date();
    const prefix = orderCodeMonthPrefix(now);

    const issueOrder = () =>
      withTransaction((tx) =>
        insertWithUniqueOrderCode(tx, now, (code) =>
          tx
            .insert(orders)
            .values({ code, source: "web", status: "pending", subtotal: 0, total: 0 })
            .returning({ id: orders.id, code: orders.code })
            .then(([row]) => row),
        ),
      );

    const first = await issueOrder();
    const second = await issueOrder();
    createdOrderIds.push(second.id);

    // A sale that fails partway now rolls back, taking its order row with it —
    // which is exactly the gap the high-water mark has to survive.
    await db.delete(orders).where(eq(orders.id, first.id));

    const third = await issueOrder();
    createdOrderIds.push(third.id);

    expect(third.code.startsWith(prefix)).toBe(true);
    expect(third.code > second.code).toBe(true);

    const [{ code: highest }] = await db
      .select({ code: orders.code })
      .from(orders)
      .where(like(orders.code, `${prefix}-%`))
      .orderBy(orders.code)
      .limit(1);
    expect(typeof highest).toBe("string");
  });

  // --- C-4: a status transition is exclusive -----------------------------

  it("confirms an order exactly once when two operators race", async () => {
    const product = await makeProduct({ stockQty: 10 });
    const created = await createOrderCore(
      {
        locale: "ar",
        customerName: "راسيه",
        phone: "22345678",
        city: "ndb",
        items: [{ key: "k1", kind: "product", productId: product.id, qty: 3 }],
      },
      orderMessages,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.code, created.data.code));
    createdOrderIds.push(order.id);

    const [a, b] = await Promise.all([
      confirmOrderCore(order.id, actorId, adminMessages, { paymentMethod: "cash" }),
      confirmOrderCore(order.id, actorId, adminMessages, { paymentMethod: "cash" }),
    ]);

    // Exactly one wins; the loser is a clean CONFLICT, not a second decrement.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser.ok).toBe(false);
    if (!loser.ok) expect(loser.error.code).toBe("CONFLICT");

    const [after] = await db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, product.id));
    expect(after.stockQty).toBe(7);

    const movements = await db
      .select({ delta: stockMovements.delta })
      .from(stockMovements)
      .where(eq(stockMovements.orderId, order.id));
    expect(movements).toHaveLength(1);
  });

  // --- M-4: availability is checked per stock pool, not per line ---------

  it("rejects a cart whose lines together exceed one product's stock", async () => {
    const product = await makeProduct({ stockQty: 1 });

    const result = await createOrderCore(
      {
        locale: "ar",
        customerName: "راسيه",
        phone: "22345678",
        city: "ndb",
        items: [
          { key: "line-a", kind: "product", productId: product.id, qty: 1 },
          { key: "line-b", kind: "product", productId: product.id, qty: 1 },
        ],
      },
      orderMessages,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
    expect((result.error.details as { unavailableKeys: string[] }).unavailableKeys).toEqual(["line-a", "line-b"]);
  });

  it("rejects two cart lines sharing one key", async () => {
    const product = await makeProduct({ stockQty: 10 });
    const result = await createOrderCore(
      {
        locale: "ar",
        customerName: "راسيه",
        phone: "22345678",
        city: "ndb",
        items: [
          { key: "same", kind: "product", productId: product.id, qty: 1 },
          { key: "same", kind: "product", productId: product.id, qty: 1 },
        ],
      },
      orderMessages,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  // --- M-12: a retried checkout is not a second order --------------------

  it("returns the original order when the same idempotency key is replayed", async () => {
    const product = await makeProduct({ stockQty: 10 });
    const idempotencyKey = crypto.randomUUID();
    const input = {
      locale: "ar",
      customerName: "راسيه",
      phone: "22345678",
      city: "ndb",
      idempotencyKey,
      items: [{ key: "k1", kind: "product", productId: product.id, qty: 2 }],
    };

    const first = await createOrderCore(input, orderMessages);
    const second = await createOrderCore(input, orderMessages);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.code).toBe(first.data.code);
    expect(second.data.total).toBe(first.data.total);
    expect(second.data.items).toEqual(first.data.items);

    const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.idempotencyKey, idempotencyKey));
    expect(rows).toHaveLength(1);
    createdOrderIds.push(rows[0].id);
  });

  it("collapses two concurrent submits of one checkout attempt into a single order", async () => {
    const product = await makeProduct({ stockQty: 10 });
    const idempotencyKey = crypto.randomUUID();
    const input = {
      locale: "ar",
      customerName: "راسيه",
      phone: "22345678",
      city: "ndb",
      idempotencyKey,
      items: [{ key: "k1", kind: "product", productId: product.id, qty: 1 }],
    };

    const [a, b] = await Promise.all([createOrderCore(input, orderMessages), createOrderCore(input, orderMessages)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.code).toBe(b.data.code);

    const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.idempotencyKey, idempotencyKey));
    expect(rows).toHaveLength(1);
    createdOrderIds.push(rows[0].id);
  });

  // --- M-3: "set stock to" asserts the value it read ---------------------

  it("refuses an absolute stock set when the value moved under it", async () => {
    const product = await makeProduct({ stockQty: 10 });

    // Two operators both read 10 and both set 4. Applying two −6 deltas would
    // land on −2; the second must be refused instead.
    const [a, b] = await Promise.all([
      adjustStockCore(
        { productId: product.id, mode: "absolute", value: 4, reason: "correction" },
        actorId,
        inventoryMessages,
      ),
      adjustStockCore(
        { productId: product.id, mode: "absolute", value: 4, reason: "correction" },
        actorId,
        inventoryMessages,
      ),
    ]);

    const succeeded = [a, b].filter((result) => result.ok);
    expect(succeeded).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser.ok).toBe(false);
    if (!loser.ok) {
      expect(loser.error.code).toBe("CONFLICT");
      expect(loser.error.message).toBe(inventoryMessages.stockMoved);
    }

    const [after] = await db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, product.id));
    expect(after.stockQty).toBe(4);
  });

  it("still composes relative adjustments, which do not assert a prior value", async () => {
    const product = await makeProduct({ stockQty: 10 });

    await Promise.all([
      adjustStockCore({ productId: product.id, mode: "delta", value: 3, reason: "restock" }, actorId, inventoryMessages),
      adjustStockCore({ productId: product.id, mode: "delta", value: 2, reason: "restock" }, actorId, inventoryMessages),
    ]);

    const [after] = await db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, product.id));
    expect(after.stockQty).toBe(15);
  });

  // --- C-1: the price a promo-expiring client falls back to --------------

  it("exposes a standing discount price as the post-promo fallback", async () => {
    // With `postPromoPrice` reading `basePrice`, the detail page quoted the
    // full list price for every permanently-discounted product — above what
    // its own catalog card advertised and above what the server charges.
    const product = await makeProduct({ price: 1000, discountPrice: 700 });

    const detail = await getStorefrontProductBySlugCore(product.slug);
    expect(detail).not.toBeNull();
    expect(detail!.basePrice).toBe(1000);
    expect(detail!.effectivePrice).toBe(700);
    expect(detail!.postPromoPrice).toBe(700);
    expect(detail!.promo).toBeNull();
  });

  it("falls back to the list price when there is no standing discount", async () => {
    const product = await makeProduct({ price: 1000, discountPrice: null });
    const detail = await getStorefrontProductBySlugCore(product.slug);
    expect(detail!.postPromoPrice).toBe(1000);
  });

  // --- M-17: a promotion may never make an item free ---------------------

  it("ignores a fixed promotion that would take an item to zero", async () => {
    const product = await makeProduct({ price: 400 });

    const [promotion] = await db
      .insert(promotions)
      .values({
        nameAr: "تخفيض ثابت",
        nameFr: "Remise fixe",
        kind: "fixed",
        // Saved when the product cost more; the price was lowered afterwards.
        value: 500,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 86_400_000),
        channel: "both",
        isActive: true,
      })
      .returning({ id: promotions.id });
    createdPromotionIds.push(promotion.id);
    await db.insert(promotionItems).values({ promotionId: promotion.id, productId: product.id });

    const effective = await getEffectivePrice(
      { kind: "product", id: product.id, price: 400, discountPrice: null },
      "web",
      new Date(),
    );

    expect(effective.price).toBe(400);
    expect(effective.promo).toBeUndefined();
  });
});
