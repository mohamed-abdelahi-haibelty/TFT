import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { bundles, categories, products, promotionItems, promotions } from "@/src/db/schema";
import { remainingUntil } from "@/src/lib/promotion-status";
import {
  createPromotionCore,
  getPromotionCore,
  listPromotionsCore,
  togglePromotionActiveCore,
  updatePromotionCore,
  type PromotionMessages,
} from "@/src/services/promotions";

const messages: PromotionMessages = {
  invalidInput: "invalid",
  fixedExceedsBase: (names: string) => `exceeds:${names}`,
};
const notFoundMessage = { notFound: "not-found" };

describe("promotions service — createPromotionCore / updatePromotionCore / getPromotionCore / listPromotionsCore", () => {
  let categoryId: string;
  const createdProductIds: string[] = [];
  const createdBundleIds: string[] = [];
  const createdPromotionIds: string[] = [];

  async function makeProduct(price: number) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج عرض",
        nameFr: `Produit promo ${unique}`,
        slug: `promo-test-product-${unique}`,
        categoryId,
        price,
        sku: `PROMOP-${unique}`,
        stockQty: 10,
        isActive: true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function makeBundle(price: number) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "صندوق عرض",
        nameFr: `Boîte promo ${unique}`,
        slug: `promo-test-bundle-${unique}`,
        price,
        sku: `PROMOB-${unique}`,
        isActive: true,
      })
      .returning({ id: bundles.id });
    createdBundleIds.push(bundle.id);
    return bundle.id;
  }

  function baseInput(overrides: Record<string, unknown> = {}) {
    const now = Date.now();
    const unique = `${now}-${Math.random().toString(36).slice(2)}`;
    return {
      nameAr: "عرض اختبار",
      nameFr: `Promo test ${unique}`,
      kind: "percent",
      value: 20,
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 60_000).toISOString(),
      channel: "both",
      isActive: true,
      productIds: [],
      bundleIds: [],
      ...overrides,
    };
  }

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة عرض", nameFr: "Categorie promo", slug: `promo-test-cat-${Date.now()}` })
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

  it("rejects a promo covering no items with VALIDATION", async () => {
    const result = await createPromotionCore(baseInput(), messages);
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.invalidInput } });
  });

  it("rejects endsAt <= startsAt with VALIDATION", async () => {
    const productId = await makeProduct(1000);
    const now = Date.now();
    const result = await createPromotionCore(
      baseInput({ productIds: [productId], startsAt: new Date(now).toISOString(), endsAt: new Date(now - 1000).toISOString() }),
      messages,
    );
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.invalidInput } });
  });

  it("rejects an out-of-range percent value with VALIDATION", async () => {
    const productId = await makeProduct(1000);
    const result = await createPromotionCore(baseInput({ productIds: [productId], value: 95 }), messages);
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.invalidInput } });
  });

  it("creates a percent promo covering a product and a bundle", async () => {
    const productId = await makeProduct(1000);
    const bundleId = await makeBundle(3000);

    const result = await createPromotionCore(baseInput({ productIds: [productId], bundleIds: [bundleId] }), messages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdPromotionIds.push(result.data.id);

    const items = await db.select().from(promotionItems).where(eq(promotionItems.promotionId, result.data.id));
    expect(items).toHaveLength(2);
  });

  it("rejects a fixed discount that meets or exceeds a covered item's base price, naming the violator", async () => {
    const cheapProduct = await makeProduct(200);

    const result = await createPromotionCore(
      baseInput({ kind: "fixed", value: 200, productIds: [cheapProduct] }),
      messages,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.message).toContain("exceeds:");
  });

  it("accepts a fixed discount strictly below every covered item's base price", async () => {
    const productId = await makeProduct(1000);

    const result = await createPromotionCore(baseInput({ kind: "fixed", value: 999, productIds: [productId] }), messages);
    expect(result.ok).toBe(true);
    if (result.ok) createdPromotionIds.push(result.data.id);
  });

  it("updatePromotionCore replaces the covered-item set wholesale", async () => {
    const productA = await makeProduct(1000);
    const productB = await makeProduct(1000);

    const created = await createPromotionCore(baseInput({ productIds: [productA] }), messages);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdPromotionIds.push(created.data.id);

    const updated = await updatePromotionCore(created.data.id, baseInput({ productIds: [productB] }), messages);
    expect(updated.ok).toBe(true);

    const items = await db.select().from(promotionItems).where(eq(promotionItems.promotionId, created.data.id));
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(productB);
  });

  it("getPromotionCore returns NOT_FOUND for an unknown id", async () => {
    const result = await getPromotionCore("00000000-0000-0000-0000-000000000000", notFoundMessage, new Date());
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND", message: notFoundMessage.notFound } });
  });

  it("togglePromotionActiveCore flips isActive", async () => {
    const productId = await makeProduct(1000);
    const created = await createPromotionCore(baseInput({ productIds: [productId] }), messages);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdPromotionIds.push(created.data.id);

    await togglePromotionActiveCore(created.data.id, false);
    const [row] = await db.select().from(promotions).where(eq(promotions.id, created.data.id));
    expect(row.isActive).toBe(false);
  });

  const DAY = 24 * 60 * 60 * 1000;

  it("a 2-day 'both' promo on 3 products: list shows it scheduled, then active with remaining time, as the simulated clock advances", async () => {
    const productIds = [await makeProduct(1000), await makeProduct(1000), await makeProduct(1000)];
    const t0 = new Date();
    const startsAt = new Date(t0.getTime() + 2 * DAY);
    const endsAt = new Date(t0.getTime() + 4 * DAY); // 2-day window

    const created = await createPromotionCore(
      baseInput({ channel: "both", productIds, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }),
      messages,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdPromotionIds.push(created.data.id);

    const beforeStart = await listPromotionsCore({}, t0);
    const scheduledRow = beforeStart.find((p) => p.id === created.data.id);
    expect(scheduledRow?.status).toBe("scheduled");
    expect(scheduledRow?.itemCount).toBe(3);

    // 1 day into the 2-day window — 1 day of remaining time left.
    const midWindow = new Date(t0.getTime() + 3 * DAY);
    const duringWindow = await listPromotionsCore({}, midWindow);
    const activeRow = duringWindow.find((p) => p.id === created.data.id);
    expect(activeRow?.status).toBe("active");
    expect(activeRow?.itemCount).toBe(3);
    expect(activeRow ? remainingUntil(activeRow.endsAt, midWindow).days : null).toBe(1);

    const afterEnd = await listPromotionsCore({}, new Date(t0.getTime() + 5 * DAY));
    expect(afterEnd.find((p) => p.id === created.data.id)?.status).toBe("ended");
  });

  it("listPromotionsCore filters by computed status", async () => {
    const productId = await makeProduct(1000);
    const t0 = new Date();
    const created = await createPromotionCore(
      baseInput({
        productIds: [productId],
        startsAt: new Date(t0.getTime() + DAY).toISOString(),
        endsAt: new Date(t0.getTime() + 2 * DAY).toISOString(),
      }),
      messages,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdPromotionIds.push(created.data.id);

    const scheduledOnly = await listPromotionsCore({ status: "scheduled" }, t0);
    expect(scheduledOnly.some((p) => p.id === created.data.id)).toBe(true);

    const activeOnly = await listPromotionsCore({ status: "active" }, t0);
    expect(activeOnly.some((p) => p.id === created.data.id)).toBe(false);
  });

  it("disabling an active promo reports it as disabled regardless of the clock", async () => {
    const productId = await makeProduct(1000);
    const t0 = new Date();
    const created = await createPromotionCore(
      baseInput({
        productIds: [productId],
        startsAt: new Date(t0.getTime() - 60_000).toISOString(),
        endsAt: new Date(t0.getTime() + DAY).toISOString(),
      }),
      messages,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdPromotionIds.push(created.data.id);

    const activeBefore = await listPromotionsCore({}, t0);
    expect(activeBefore.find((p) => p.id === created.data.id)?.status).toBe("active");

    await togglePromotionActiveCore(created.data.id, false);

    const disabledAfter = await listPromotionsCore({}, t0);
    expect(disabledAfter.find((p) => p.id === created.data.id)?.status).toBe("disabled");
  });
});
