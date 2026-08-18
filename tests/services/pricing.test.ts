import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { bundles, categories, products, promotionItems, promotions } from "@/src/db/schema";
import { computePromoPrice, getEffectivePrice } from "@/src/services/pricing";
import { togglePromotionActiveCore } from "@/src/services/promotions";

describe("pricing service — computePromoPrice (pure)", () => {
  it("rounds a percent discount to the nearest whole MRU", () => {
    expect(computePromoPrice("percent", 33, 999)).toBe(Math.round((999 * 67) / 100)); // 669.33 -> 669
    expect(computePromoPrice("percent", 50, 1001)).toBe(501); // 500.5 -> 501 (round-half-up)
  });

  it("floors a fixed discount at zero", () => {
    expect(computePromoPrice("fixed", 150, 100)).toBe(0);
    expect(computePromoPrice("fixed", 300, 1000)).toBe(700);
  });
});

describe("pricing service — getEffectivePrice", () => {
  let categoryId: string;
  const createdProductIds: string[] = [];
  const createdBundleIds: string[] = [];
  const createdPromotionIds: string[] = [];

  async function makeProduct(price: number, discountPrice: number | null = null) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج تسعير",
        nameFr: `Produit prix ${unique}`,
        slug: `pricing-test-product-${unique}`,
        categoryId,
        price,
        discountPrice,
        sku: `PRICEP-${unique}`,
        stockQty: 10,
        isActive: true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function makeBundle(price: number, componentProductId: string) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "صندوق تسعير",
        nameFr: `Boîte prix ${unique}`,
        slug: `pricing-test-bundle-${unique}`,
        price,
        sku: `PRICEB-${unique}`,
        isActive: true,
      })
      .returning({ id: bundles.id });
    createdBundleIds.push(bundle.id);
    // bundle_items isn't relevant to pricing coverage, only bundle id/price is — skip inserting items.
    void componentProductId;
    return bundle.id;
  }

  async function makePromo(overrides: {
    kind: "percent" | "fixed";
    value: number;
    startsAt: Date;
    endsAt: Date;
    channel: "web" | "pos" | "both";
    isActive?: boolean;
    productId?: string;
    bundleId?: string;
  }) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [promo] = await db
      .insert(promotions)
      .values({
        nameAr: "عرض اختبار",
        nameFr: `Promo test ${unique}`,
        kind: overrides.kind,
        value: overrides.value,
        startsAt: overrides.startsAt,
        endsAt: overrides.endsAt,
        channel: overrides.channel,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: promotions.id });
    createdPromotionIds.push(promo.id);

    await db.insert(promotionItems).values({
      promotionId: promo.id,
      productId: overrides.productId ?? null,
      bundleId: overrides.bundleId ?? null,
    });

    return promo.id;
  }

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة تسعير", nameFr: "Categorie prix", slug: `pricing-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;
  });

  afterAll(async () => {
    for (const id of createdPromotionIds) {
      await db.delete(promotionItems).where(eq(promotionItems.promotionId, id));
      await db.delete(promotions).where(eq(promotions.id, id));
    }
    for (const id of createdBundleIds) {
      await db.delete(bundles).where(eq(bundles.id, id));
    }
    for (const id of createdProductIds) {
      await db.delete(products).where(eq(products.id, id));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
  });

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  it("falls back to base price with no promo and no discount_price", async () => {
    const productId = await makeProduct(1000);
    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", new Date());
    expect(result).toEqual({ price: 1000, base: 1000 });
  });

  it("falls back to discount_price when no promo covers the item", async () => {
    const productId = await makeProduct(1000, 800);
    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: 800 }, "web", new Date());
    expect(result).toEqual({ price: 800, base: 1000 });
  });

  it("an active promo wins outright over discount_price, even when discount_price is cheaper", async () => {
    const now = new Date();
    const productId = await makeProduct(1000, 500); // discount_price is cheaper than the promo below
    await makePromo({
      kind: "percent",
      value: 20,
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + HOUR),
      channel: "both",
      productId,
    });

    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: 500 }, "web", now);
    expect(result.price).toBe(800); // 20% off 1000, not the 500 discount_price
    expect(result.promo?.endsAt).toBeInstanceOf(Date);
  });

  it("filters by channel: a web-only promo does not apply to a pos read", async () => {
    const now = new Date();
    const productId = await makeProduct(1000);
    await makePromo({
      kind: "percent",
      value: 50,
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + HOUR),
      channel: "web",
      productId,
    });

    const posResult = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "pos", now);
    expect(posResult).toEqual({ price: 1000, base: 1000 });

    const webResult = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", now);
    expect(webResult.price).toBe(500);
  });

  it("a 'both'-channel promo applies to both web and pos", async () => {
    const now = new Date();
    const productId = await makeProduct(1000);
    await makePromo({
      kind: "fixed",
      value: 300,
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + HOUR),
      channel: "both",
      productId,
    });

    expect((await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", now)).price).toBe(700);
    expect((await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "pos", now)).price).toBe(700);
  });

  it("starts_at is inclusive: a promo applies at the exact instant it starts", async () => {
    const startsAt = new Date();
    const productId = await makeProduct(1000);
    await makePromo({
      kind: "percent",
      value: 10,
      startsAt,
      endsAt: new Date(startsAt.getTime() + DAY),
      channel: "both",
      productId,
    });

    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", startsAt);
    expect(result.price).toBe(900);
  });

  it("ends_at is exclusive: a promo no longer applies at the exact instant it ends", async () => {
    const endsAt = new Date();
    const productId = await makeProduct(1000);
    await makePromo({
      kind: "percent",
      value: 10,
      startsAt: new Date(endsAt.getTime() - DAY),
      endsAt,
      channel: "both",
      productId,
    });

    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", endsAt);
    expect(result).toEqual({ price: 1000, base: 1000 });
  });

  it("a scheduled (not-yet-started) promo does not apply", async () => {
    const now = new Date();
    const productId = await makeProduct(1000);
    await makePromo({
      kind: "percent",
      value: 10,
      startsAt: new Date(now.getTime() + HOUR),
      endsAt: new Date(now.getTime() + DAY),
      channel: "both",
      productId,
    });

    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", now);
    expect(result).toEqual({ price: 1000, base: 1000 });
  });

  it("a disabled promo does not apply even inside its time window", async () => {
    const now = new Date();
    const productId = await makeProduct(1000);
    await makePromo({
      kind: "percent",
      value: 10,
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + HOUR),
      channel: "both",
      isActive: false,
      productId,
    });

    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", now);
    expect(result).toEqual({ price: 1000, base: 1000 });
  });

  it("overlapping promos on the same item resolve to the cheapest price", async () => {
    const now = new Date();
    const productId = await makeProduct(1000);
    const window = { startsAt: new Date(now.getTime() - HOUR), endsAt: new Date(now.getTime() + HOUR) };

    await makePromo({ kind: "percent", value: 10, ...window, channel: "both", productId }); // -> 900
    await makePromo({ kind: "fixed", value: 300, ...window, channel: "both", productId }); // -> 700, cheapest
    await makePromo({ kind: "percent", value: 20, ...window, channel: "both", productId }); // -> 800

    const result = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", now);
    expect(result.price).toBe(700);
  });

  it("disabling an active promo removes its pricing effect on the next evaluation", async () => {
    const now = new Date();
    const productId = await makeProduct(1000);
    const promoId = await makePromo({
      kind: "percent",
      value: 30,
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + HOUR),
      channel: "both",
      productId,
    });

    const before = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", now);
    expect(before.price).toBe(700);

    await togglePromotionActiveCore(promoId, false);

    const after = await getEffectivePrice({ kind: "product", id: productId, price: 1000, discountPrice: null }, "web", now);
    expect(after).toEqual({ price: 1000, base: 1000 });
  });

  it("prices a bundle covered by a promo the same way as a product", async () => {
    const now = new Date();
    const productId = await makeProduct(500);
    const bundleId = await makeBundle(2000, productId);
    await makePromo({
      kind: "percent",
      value: 25,
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + HOUR),
      channel: "both",
      bundleId,
    });

    const result = await getEffectivePrice({ kind: "bundle", id: bundleId, price: 2000 }, "web", now);
    expect(result.price).toBe(1500);
    expect(result.base).toBe(2000);
  });
});
