import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import {
  bundleItems,
  bundles,
  categories,
  productImages,
  products,
  productVariants,
  promotionItems,
  promotions,
  variantImages,
} from "@/src/db/schema";
import {
  getFeaturedProductsCore,
  getHomeBundlesCore,
  getSitemapCatalogCore,
  getStorefrontBundleBySlugCore,
  getStorefrontCategoriesCore,
  getStorefrontProductBySlugCore,
  listCatalogBundlesCore,
  listCatalogProductsCore,
} from "@/src/services/storefront";

describe("storefront service — public unauthenticated reads", () => {
  let categoryId: string;
  let categorySlug: string;
  const createdProductIds: string[] = [];
  const createdBundleIds: string[] = [];

  async function makeProduct(overrides: Partial<{ isActive: boolean; discountPrice: number | null }> = {}) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج المتجر",
        nameFr: `Produit vitrine ${unique}`,
        slug: `storefront-test-product-${unique}`,
        categoryId,
        price: 1000,
        discountPrice: overrides.discountPrice,
        sku: `STOREP-${unique}`,
        stockQty: 5,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function makeBundle(productId: string, overrides: Partial<{ isActive: boolean }> = {}) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "صندوق المتجر",
        nameFr: `Boîte vitrine ${unique}`,
        slug: `storefront-test-bundle-${unique}`,
        price: 1500,
        sku: `STOREB-${unique}`,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: bundles.id });
    createdBundleIds.push(bundle.id);
    await db.insert(bundleItems).values({ bundleId: bundle.id, productId, qty: 1 });
    return bundle.id;
  }

  beforeAll(async () => {
    categorySlug = `storefront-test-cat-${Date.now()}`;
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة المتجر", nameFr: "Categorie vitrine", slug: categorySlug })
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

  it("lists the seeded category among storefront categories", async () => {
    const result = await getStorefrontCategoriesCore();
    expect(result.some((category) => category.slug === categorySlug)).toBe(true);
  });

  it("includes an active product with its effective (discounted) price and excludes an inactive one", async () => {
    const activeId = await makeProduct({ discountPrice: 800 });
    const inactiveId = await makeProduct({ isActive: false });

    const result = await getFeaturedProductsCore(500);
    const active = result.find((product) => product.id === activeId);
    const inactive = result.find((product) => product.id === inactiveId);

    expect(active).toBeDefined();
    expect(active?.basePrice).toBe(1000);
    expect(active?.effectivePrice).toBe(800);
    expect(inactive).toBeUndefined();
  });

  it("includes an active bundle and excludes an inactive one", async () => {
    const productId = await makeProduct();
    const activeBundleId = await makeBundle(productId);
    const inactiveBundleId = await makeBundle(productId, { isActive: false });

    const result = await getHomeBundlesCore(500);
    expect(result.some((bundle) => bundle.id === activeBundleId)).toBe(true);
    expect(result.some((bundle) => bundle.id === inactiveBundleId)).toBe(false);
  });

  it("builds the sitemap catalog from active products/bundles and every category", async () => {
    const productId = await makeProduct();
    const bundleId = await makeBundle(productId);
    const inactiveProductId = await makeProduct({ isActive: false });

    const catalog = await getSitemapCatalogCore();
    expect(catalog.categories.some((category) => category.slug === categorySlug)).toBe(true);

    const [insertedProduct] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));
    const [insertedBundle] = await db.select({ slug: bundles.slug }).from(bundles).where(eq(bundles.id, bundleId));
    const [inactiveProduct] = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, inactiveProductId));

    expect(catalog.products.some((product) => product.slug === insertedProduct.slug)).toBe(true);
    expect(catalog.bundles.some((bundle) => bundle.slug === insertedBundle.slug)).toBe(true);
    expect(catalog.products.some((product) => product.slug === inactiveProduct.slug)).toBe(false);
  });
});

describe("storefront service — listCatalogProductsCore (task 09 catalog filters)", () => {
  let categoryAId: string;
  let categoryASlug: string;
  let categoryBId: string;
  let categoryBSlug: string;
  const createdProductIds: string[] = [];
  const createdPromotionIds: string[] = [];
  const createdCategoryIds: string[] = [];

  async function makeProduct(overrides: Partial<{
    categoryId: string;
    nameAr: string;
    nameFr: string;
    price: number;
    stockQty: number;
    allowBackorder: boolean;
    isActive: boolean;
  }> = {}) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: overrides.nameAr ?? "منتج الكتالوج",
        nameFr: overrides.nameFr ?? `Produit catalogue ${unique}`,
        slug: `catalog-test-product-${unique}`,
        categoryId: overrides.categoryId ?? categoryAId,
        price: overrides.price ?? 1000,
        sku: `CATP-${unique}`,
        stockQty: overrides.stockQty ?? 5,
        allowBackorder: overrides.allowBackorder ?? false,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function makePromo(productId: string, value: number) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date();
    const [promo] = await db
      .insert(promotions)
      .values({
        nameAr: "عرض الكتالوج",
        nameFr: `Promo catalogue ${unique}`,
        kind: "percent",
        value,
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 3_600_000),
        channel: "web",
        isActive: true,
      })
      .returning({ id: promotions.id });
    createdPromotionIds.push(promo.id);
    await db.insert(promotionItems).values({ promotionId: promo.id, productId, bundleId: null });
    return promo.id;
  }

  beforeAll(async () => {
    categoryASlug = `catalog-test-cat-a-${Date.now()}`;
    categoryBSlug = `catalog-test-cat-b-${Date.now()}`;
    const [categoryA] = await db
      .insert(categories)
      .values({ nameAr: "فئة أ", nameFr: "Categorie A", slug: categoryASlug })
      .returning({ id: categories.id });
    const [categoryB] = await db
      .insert(categories)
      .values({ nameAr: "فئة ب", nameFr: "Categorie B", slug: categoryBSlug })
      .returning({ id: categories.id });
    categoryAId = categoryA.id;
    categoryBId = categoryB.id;
    createdCategoryIds.push(categoryA.id, categoryB.id);
  });

  afterAll(async () => {
    for (const id of createdPromotionIds) {
      await db.delete(promotionItems).where(eq(promotionItems.promotionId, id));
      await db.delete(promotions).where(eq(promotions.id, id));
    }
    for (const id of createdProductIds) {
      await db.delete(products).where(eq(products.id, id));
    }
    for (const id of createdCategoryIds) {
      await db.delete(categories).where(eq(categories.id, id));
    }
  });

  it("scopes results to one category and excludes another", async () => {
    const inA = await makeProduct({ categoryId: categoryAId });
    const inB = await makeProduct({ categoryId: categoryBId });

    const result = await listCatalogProductsCore({ categorySlug: categoryASlug });
    expect(result.some((product) => product.id === inA)).toBe(true);
    expect(result.some((product) => product.id === inB)).toBe(false);
  });

  it("matches search against both the Arabic and the French name", async () => {
    const unique = Date.now();
    const arMatch = await makeProduct({ nameAr: `دفتر فريد ${unique}`, nameFr: "Cahier ordinaire" });
    const frMatch = await makeProduct({ nameAr: "منتج عادي", nameFr: `Unique Notebook ${unique}` });
    const noMatch = await makeProduct({ nameAr: "منتج آخر", nameFr: "Autre produit" });

    const byArabic = await listCatalogProductsCore({ search: "فريد" });
    expect(byArabic.some((product) => product.id === arMatch)).toBe(true);
    expect(byArabic.some((product) => product.id === noMatch)).toBe(false);

    const byFrench = await listCatalogProductsCore({ search: "Unique Notebook" });
    expect(byFrench.some((product) => product.id === frMatch)).toBe(true);
  });

  it("filters by base price range", async () => {
    const cheap = await makeProduct({ price: 200 });
    const mid = await makeProduct({ price: 800 });
    const expensive = await makeProduct({ price: 5000 });

    const result = await listCatalogProductsCore({ minPrice: 500, maxPrice: 1000 });
    expect(result.some((product) => product.id === mid)).toBe(true);
    expect(result.some((product) => product.id === cheap)).toBe(false);
    expect(result.some((product) => product.id === expensive)).toBe(false);
  });

  it("in-stock-only excludes a zero-stock, non-backorder product but keeps a zero-stock backorder one", async () => {
    const inStock = await makeProduct({ stockQty: 3 });
    const outOfStock = await makeProduct({ stockQty: 0, allowBackorder: false });
    const backorder = await makeProduct({ stockQty: 0, allowBackorder: true });

    const result = await listCatalogProductsCore({ inStockOnly: true });
    const ids = result.map((product) => product.id);
    expect(ids).toContain(inStock);
    expect(ids).toContain(backorder);
    expect(ids).not.toContain(outOfStock);
  });

  it("excludes an inactive product", async () => {
    const inactive = await makeProduct({ isActive: false });
    const result = await listCatalogProductsCore({});
    expect(result.some((product) => product.id === inactive)).toBe(false);
  });

  it("sorts by effective price, not base price — a promo can invert the base-price order", async () => {
    // Base prices would sort [cheaperBase, pricierBase]; a 90%-off promo on
    // pricierBase drops its effective price below cheaperBase, so
    // "price-asc" must invert the order relative to the base-price columns.
    const cheaperBase = await makeProduct({ price: 1000 });
    const pricierBase = await makeProduct({ price: 2000 });
    await makePromo(pricierBase, 90); // effective price: 200

    const ascending = await listCatalogProductsCore({ sort: "price-asc" });
    const indexOf = (id: string) => ascending.findIndex((product) => product.id === id);
    expect(indexOf(pricierBase)).toBeGreaterThanOrEqual(0);
    expect(indexOf(pricierBase)).toBeLessThan(indexOf(cheaperBase));

    const found = ascending.find((product) => product.id === pricierBase);
    expect(found?.effectivePrice).toBe(200);
    expect(found?.promo?.nameFr).toContain("Promo catalogue");
  });
});

describe("storefront service — getStorefrontProductBySlugCore (task 09 product detail)", () => {
  let categoryId: string;
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة المنتج", nameFr: "Categorie produit", slug: `pdp-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;
    createdCategoryIds.push(category.id);
  });

  afterAll(async () => {
    for (const id of createdProductIds) {
      await db.delete(products).where(eq(products.id, id));
    }
    for (const id of createdCategoryIds) {
      await db.delete(categories).where(eq(categories.id, id));
    }
  });

  it("returns null for an unknown slug", async () => {
    const result = await getStorefrontProductBySlugCore("does-not-exist-slug");
    expect(result).toBeNull();
  });

  it("returns null for an inactive product's slug", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const slug = `pdp-inactive-${unique}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج غير نشط",
        nameFr: `Produit inactif ${unique}`,
        slug,
        categoryId,
        price: 1000,
        sku: `PDPI-${unique}`,
        stockQty: 5,
        isActive: false,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);

    const result = await getStorefrontProductBySlugCore(slug);
    expect(result).toBeNull();
  });

  it("includes active variants with their own images and stock, ordered by creation", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const slug = `pdp-variants-${unique}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج بمتغيرات",
        nameFr: `Produit variantes ${unique}`,
        slug,
        categoryId,
        price: 1500,
        sku: `PDPV-${unique}`,
        stockQty: 8,
        isActive: true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);

    await db.insert(productImages).values([
      { productId: product.id, publicId: "product-photo-1", sort: 0 },
      { productId: product.id, publicId: "product-photo-2", sort: 1 },
    ]);

    const [variantA] = await db
      .insert(productVariants)
      .values({
        productId: product.id,
        nameAr: "أحمر",
        nameFr: "Rouge",
        colorHex: "#ff0000",
        sku: `PDPV-A-${unique}`,
        stockQty: 3,
        isActive: true,
      })
      .returning({ id: productVariants.id });
    const [variantB] = await db
      .insert(productVariants)
      .values({
        productId: product.id,
        nameAr: "أزرق",
        nameFr: "Bleu",
        colorHex: "#0000ff",
        sku: `PDPV-B-${unique}`,
        stockQty: null, // falls back to the parent product's own stock
        isActive: true,
      })
      .returning({ id: productVariants.id });
    const [inactiveVariant] = await db
      .insert(productVariants)
      .values({
        productId: product.id,
        nameAr: "أخضر",
        nameFr: "Vert",
        sku: `PDPV-C-${unique}`,
        stockQty: 0,
        isActive: false,
      })
      .returning({ id: productVariants.id });

    await db.insert(variantImages).values({ variantId: variantA.id, publicId: "variant-a-photo", sort: 0 });

    const result = await getStorefrontProductBySlugCore(slug);
    expect(result).not.toBeNull();
    expect(result?.images).toEqual(["product-photo-1", "product-photo-2"]);
    expect(result?.variants.map((v) => v.id)).toEqual([variantA.id, variantB.id]);
    expect(result?.variants.find((v) => v.id === inactiveVariant.id)).toBeUndefined();

    const red = result?.variants.find((v) => v.id === variantA.id);
    expect(red?.stockQty).toBe(3);
    expect(red?.images).toEqual(["variant-a-photo"]);
    expect(red?.colorHex).toBe("#ff0000");

    const blue = result?.variants.find((v) => v.id === variantB.id);
    expect(blue?.stockQty).toBeNull();
    expect(blue?.images).toEqual([]);
  });

  it("reports the effective (discounted) price and the base price", async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const slug = `pdp-discount-${unique}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج مخفض",
        nameFr: `Produit réduit ${unique}`,
        slug,
        categoryId,
        price: 1000,
        discountPrice: 750,
        sku: `PDPD-${unique}`,
        stockQty: 5,
        isActive: true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);

    const result = await getStorefrontProductBySlugCore(slug);
    expect(result?.basePrice).toBe(1000);
    expect(result?.effectivePrice).toBe(750);
  });
});

describe("storefront service — listCatalogBundlesCore / getStorefrontBundleBySlugCore (task 10 bundle pages)", () => {
  let categoryId: string;
  const createdProductIds: string[] = [];
  const createdBundleIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdPromotionIds: string[] = [];
  const createdCategoryIds: string[] = [];

  async function makeProduct(
    overrides: Partial<{
      price: number;
      discountPrice: number | null;
      stockQty: number;
      allowBackorder: boolean;
      isActive: boolean;
    }> = {},
  ) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج الصندوق",
        nameFr: `Produit boîte ${unique}`,
        slug: `bundle-page-test-product-${unique}`,
        categoryId,
        price: overrides.price ?? 1000,
        discountPrice: overrides.discountPrice,
        sku: `BOXP-${unique}`,
        stockQty: overrides.stockQty ?? 5,
        allowBackorder: overrides.allowBackorder ?? false,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: products.id });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function makeVariant(productId: string, stockQty: number | null) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        nameAr: "متغير الصندوق",
        nameFr: `Variante boîte ${unique}`,
        sku: `BOXV-${unique}`,
        stockQty,
        isActive: true,
      })
      .returning({ id: productVariants.id });
    createdVariantIds.push(variant.id);
    return variant.id;
  }

  async function makeBundle(
    items: { productId: string; variantId?: string; qty: number }[],
    overrides: Partial<{ isActive: boolean; price: number }> = {},
  ) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "صندوق الصفحة",
        nameFr: `Boîte page ${unique}`,
        slug: `bundle-page-test-bundle-${unique}`,
        price: overrides.price ?? 1500,
        sku: `BOXB-${unique}`,
        isActive: overrides.isActive ?? true,
      })
      .returning({ id: bundles.id });
    createdBundleIds.push(bundle.id);
    if (items.length) {
      await db.insert(bundleItems).values(items.map((item) => ({ bundleId: bundle.id, ...item })));
    }
    return bundle.id;
  }

  async function makePromo(productId: string, value: number) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date();
    const [promo] = await db
      .insert(promotions)
      .values({
        nameAr: "عرض الصندوق",
        nameFr: `Promo boîte ${unique}`,
        kind: "percent",
        value,
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 3_600_000),
        channel: "web",
        isActive: true,
      })
      .returning({ id: promotions.id });
    createdPromotionIds.push(promo.id);
    await db.insert(promotionItems).values({ promotionId: promo.id, productId, bundleId: null });
    return promo.id;
  }

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة الصندوق", nameFr: "Categorie boîte", slug: `bundle-page-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;
    createdCategoryIds.push(category.id);
  });

  afterAll(async () => {
    for (const id of createdPromotionIds) {
      await db.delete(promotionItems).where(eq(promotionItems.promotionId, id));
      await db.delete(promotions).where(eq(promotions.id, id));
    }
    for (const id of createdBundleIds) {
      await db.delete(bundleItems).where(eq(bundleItems.bundleId, id));
      await db.delete(bundles).where(eq(bundles.id, id));
    }
    for (const id of createdVariantIds) {
      await db.delete(productVariants).where(eq(productVariants.id, id));
    }
    for (const id of createdProductIds) {
      await db.delete(products).where(eq(products.id, id));
    }
    for (const id of createdCategoryIds) {
      await db.delete(categories).where(eq(categories.id, id));
    }
  });

  it("lists an active bundle with its item count and excludes an inactive one", async () => {
    const productId = await makeProduct();
    const activeId = await makeBundle([{ productId, qty: 1 }]);
    const inactiveId = await makeBundle([{ productId, qty: 1 }], { isActive: false });

    const result = await listCatalogBundlesCore();
    const active = result.find((bundle) => bundle.id === activeId);
    expect(active).toBeDefined();
    expect(active?.itemCount).toBe(1);
    expect(result.some((bundle) => bundle.id === inactiveId)).toBe(false);
  });

  it("derives maxSellable 0 (sold out) when a non-backorder component is out of stock, ignoring a backorder component's own ceiling", async () => {
    const scarce = await makeProduct({ stockQty: 0, allowBackorder: false });
    const unlimited = await makeProduct({ stockQty: 0, allowBackorder: true });
    const bundleId = await makeBundle([
      { productId: scarce, qty: 1 },
      { productId: unlimited, qty: 1 },
    ]);

    const result = await listCatalogBundlesCore();
    const bundle = result.find((b) => b.id === bundleId);
    expect(bundle?.maxSellable).toBe(0);
  });

  it("returns null for an unknown or inactive bundle slug", async () => {
    expect(await getStorefrontBundleBySlugCore("does-not-exist-bundle-slug")).toBeNull();

    const productId = await makeProduct();
    const inactiveId = await makeBundle([{ productId, qty: 1 }], { isActive: false });
    const [inactiveBundle] = await db.select({ slug: bundles.slug }).from(bundles).where(eq(bundles.id, inactiveId));
    expect(await getStorefrontBundleBySlugCore(inactiveBundle.slug)).toBeNull();
  });

  it("includes each component's product slug, variant name, qty, and current effective unit price", async () => {
    const plainProductId = await makeProduct({ price: 400 });
    const discountedProductId = await makeProduct({ price: 300, discountPrice: 200 });
    const variantId = await makeVariant(plainProductId, 2);

    const bundleId = await makeBundle([
      { productId: plainProductId, variantId, qty: 2 },
      { productId: discountedProductId, qty: 1 },
    ]);
    const [bundleRow] = await db.select({ slug: bundles.slug }).from(bundles).where(eq(bundles.id, bundleId));

    const result = await getStorefrontBundleBySlugCore(bundleRow.slug);
    expect(result).not.toBeNull();

    const variantItem = result?.items.find((item) => item.productId === plainProductId);
    expect(variantItem?.productSlug).toBeDefined();
    expect(variantItem?.qty).toBe(2);
    expect(variantItem?.unitPrice).toBe(400);
    expect(variantItem?.variantNameFr).toContain("Variante boîte");

    const discountedItem = result?.items.find((item) => item.productId === discountedProductId);
    expect(discountedItem?.unitPrice).toBe(200);

    // componentPriceSum = 400*2 (plain) + 200*1 (discounted) = 1000
    expect(result?.componentPriceSum).toBe(1000);
  });

  it("computes componentPriceSum from each component's promo-adjusted price, not its base price", async () => {
    const productId = await makeProduct({ price: 1000 });
    await makePromo(productId, 50); // effective: 500

    const bundleId = await makeBundle([{ productId, qty: 3 }], { price: 1200 });
    const [bundleRow] = await db.select({ slug: bundles.slug }).from(bundles).where(eq(bundles.id, bundleId));

    const result = await getStorefrontBundleBySlugCore(bundleRow.slug);
    expect(result?.componentPriceSum).toBe(1500); // 500 * 3
    expect(result?.effectivePrice).toBe(1200);
  });
});
