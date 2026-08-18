import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { bundleItems, bundles, categories, products } from "@/src/db/schema";
import {
  createBundleCore,
  deactivateDependentBundlesCore,
  getBundleCore,
  updateBundleCore,
} from "@/src/services/bundles";
import { toggleProductActiveCore } from "@/src/services/products";

const bundleMessages = { invalidInput: "invalid", slugTaken: "slug-taken" };
const notFoundMessage = { notFound: "not-found" };

describe("bundles service — createBundleCore / updateBundleCore / getBundleCore", () => {
  let categoryId: string;
  const createdProductIds: string[] = [];
  const createdBundleIds: string[] = [];

  async function makeProduct(overrides: Partial<{ stockQty: number; allowBackorder: boolean }> = {}) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج اختبار",
        nameFr: `Produit test ${unique}`,
        slug: `bundles-test-product-${unique}`,
        categoryId,
        price: 500,
        sku: `TESTP-${unique}`,
        stockQty: overrides.stockQty ?? 10,
        allowBackorder: overrides.allowBackorder ?? false,
        isActive: true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);
    return product.id;
  }

  function baseInput(items: { productId: string; variantId?: string | null; qty: number }[], overrides: Record<string, unknown> = {}) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      nameAr: "صندوق اختبار",
      nameFr: `Boîte test ${unique}`,
      price: 1000,
      isActive: true,
      slug: `test-bundle-${unique}`,
      images: [],
      items,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار", nameFr: "Categorie test", slug: `bundles-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;
  });

  afterAll(async () => {
    for (const id of createdBundleIds) {
      await db.delete(bundleItems).where(eq(bundleItems.bundleId, id));
      await db.delete(bundles).where(eq(bundles.id, id));
    }
    for (const id of createdProductIds) {
      await db.delete(products).where(eq(products.id, id));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
  });

  it("rejects an empty item list with VALIDATION", async () => {
    const result = await createBundleCore(baseInput([]), bundleMessages);
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: bundleMessages.invalidInput } });
  });

  it("creates a bundle with an auto-assigned B- SKU and inserts its items", async () => {
    const productId = await makeProduct();

    const result = await createBundleCore(baseInput([{ productId, qty: 2 }]), bundleMessages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdBundleIds.push(result.data.id);

    const [bundle] = await db.select().from(bundles).where(eq(bundles.id, result.data.id)).limit(1);
    expect(bundle.sku).toMatch(/^B-\d{6}$/);

    const items = await db.select().from(bundleItems).where(eq(bundleItems.bundleId, result.data.id));
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(2);
  });

  it("rejects a duplicate slug with CONFLICT", async () => {
    const productId = await makeProduct();
    const slug = `dup-bundle-slug-${Date.now()}`;

    const first = await createBundleCore(baseInput([{ productId, qty: 1 }], { slug }), bundleMessages);
    expect(first.ok).toBe(true);
    if (first.ok) createdBundleIds.push(first.data.id);

    const second = await createBundleCore(baseInput([{ productId, qty: 1 }], { slug }), bundleMessages);
    expect(second).toEqual({ ok: false, error: { code: "CONFLICT", message: bundleMessages.slugTaken } });
  });

  it("updateBundleCore replaces the item set wholesale", async () => {
    const productA = await makeProduct();
    const productB = await makeProduct();

    const created = await createBundleCore(baseInput([{ productId: productA, qty: 1 }]), bundleMessages);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdBundleIds.push(created.data.id);

    const updated = await updateBundleCore(
      created.data.id,
      baseInput([{ productId: productB, qty: 3 }], { slug: `updated-${Date.now()}` }),
      bundleMessages,
    );
    expect(updated.ok).toBe(true);

    const items = await db.select().from(bundleItems).where(eq(bundleItems.bundleId, created.data.id));
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(productB);
    expect(items[0].qty).toBe(3);
  });

  it("getBundleCore returns NOT_FOUND for an unknown id", async () => {
    const result = await getBundleCore("00000000-0000-0000-0000-000000000000", notFoundMessage);
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND", message: notFoundMessage.notFound } });
  });

  it("derives correct availability for a 3-item bundle and reacts when a component's stock changes", async () => {
    const productA = await makeProduct({ stockQty: 10 }); // qty 1 -> 10 sellable
    const productB = await makeProduct({ stockQty: 9 }); // qty 2 -> floor(9/2) = 4 sellable, the binding one
    const productC = await makeProduct({ stockQty: 20 }); // qty 1 -> 20 sellable

    const created = await createBundleCore(
      baseInput([
        { productId: productA, qty: 1 },
        { productId: productB, qty: 2 },
        { productId: productC, qty: 1 },
      ]),
      bundleMessages,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdBundleIds.push(created.data.id);

    const before = await getBundleCore(created.data.id, notFoundMessage);
    expect(before.ok).toBe(true);
    if (before.ok) expect(before.data.maxSellable).toBe(4);

    // Product B's stock drops — the bundle's derived availability must follow.
    await db.update(products).set({ stockQty: 3 }).where(eq(products.id, productB));

    const after = await getBundleCore(created.data.id, notFoundMessage);
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.data.maxSellable).toBe(1); // floor(3/2) = 1
  });

  it("deactivating a component product deactivates its dependent bundle and reports it in the warning list", async () => {
    const productId = await makeProduct();

    const created = await createBundleCore(baseInput([{ productId, qty: 1 }]), bundleMessages);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdBundleIds.push(created.data.id);

    const toggled = await toggleProductActiveCore(productId, false);
    expect(toggled.ok).toBe(true);
    if (toggled.ok) {
      expect(toggled.data.deactivatedBundles.map((b) => b.id)).toContain(created.data.id);
    }

    const [bundle] = await db.select().from(bundles).where(eq(bundles.id, created.data.id)).limit(1);
    expect(bundle.isActive).toBe(false);
  });

  it("deactivateDependentBundlesCore is a no-op for a product with no bundle dependents", async () => {
    const productId = await makeProduct();
    const affected = await deactivateDependentBundlesCore(productId);
    expect(affected).toEqual([]);
  });
});
