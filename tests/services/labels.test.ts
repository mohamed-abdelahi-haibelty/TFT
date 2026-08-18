import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import {
  bundles,
  categories,
  labelSheetSelections,
  productVariants,
  products,
  users,
} from "@/src/db/schema";
import {
  getBundleLabelDataCore,
  getLabelSheetSelectionCore,
  listLabelItemsCore,
  saveLabelSheetSelectionCore,
} from "@/src/services/labels";

const messages = { notFound: "not-found", invalidSelection: "invalid-selection" };

describe("labels service", () => {
  let actorId: string;
  let categoryId: string;
  let productId: string;
  let variantId: string;
  let bundleId: string;
  let inactiveProductId: string;

  beforeAll(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [actor] = await db
      .insert(users)
      .values({
        name: "Labels Test Actor",
        email: `labels-test-actor-${unique}@example.com`,
        emailVerified: true,
        role: "admin",
      })
      .returning({ id: users.id });
    actorId = actor.id;

    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار الملصقات", nameFr: `Categorie labels ${unique}`, slug: `labels-test-cat-${unique}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج اختبار الملصقات",
        nameFr: `Produit labels ${unique}`,
        slug: `labels-test-product-${unique}`,
        categoryId,
        price: 1500,
        sku: `LBL-P-${unique}`,
        stockQty: 10,
      })
      .returning({ id: products.id });
    productId = product.id;

    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        nameAr: "أزرق",
        nameFr: "Bleu",
        sku: `LBL-V-${unique}`,
      })
      .returning({ id: productVariants.id });
    variantId = variant.id;

    const [bundle] = await db
      .insert(bundles)
      .values({
        nameAr: "علبة اختبار",
        nameFr: `Boite labels ${unique}`,
        slug: `labels-test-bundle-${unique}`,
        price: 3000,
        sku: `LBL-B-${unique}`,
      })
      .returning({ id: bundles.id });
    bundleId = bundle.id;

    const [inactiveProduct] = await db
      .insert(products)
      .values({
        nameAr: "منتج معطّل",
        nameFr: `Produit inactif ${unique}`,
        slug: `labels-test-inactive-${unique}`,
        categoryId,
        price: 500,
        sku: `LBL-P-INACTIVE-${unique}`,
        stockQty: 0,
        isActive: false,
      })
      .returning({ id: products.id });
    inactiveProductId = inactiveProduct.id;
  });

  afterAll(async () => {
    await db.delete(labelSheetSelections).where(eq(labelSheetSelections.userId, actorId));
    await db.delete(productVariants).where(eq(productVariants.productId, productId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(products).where(eq(products.id, inactiveProductId));
    await db.delete(bundles).where(eq(bundles.id, bundleId));
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(users).where(eq(users.id, actorId));
  });

  describe("getBundleLabelDataCore", () => {
    it("returns the bundle's label fields", async () => {
      const result = await getBundleLabelDataCore(bundleId, messages);
      expect(result).toEqual({
        ok: true,
        data: {
          id: bundleId,
          nameAr: "علبة اختبار",
          nameFr: expect.stringContaining("Boite labels"),
          sku: expect.stringContaining("LBL-B-"),
          price: 3000,
          isActive: true,
        },
      });
    });

    it("returns NOT_FOUND for a missing bundle", async () => {
      const result = await getBundleLabelDataCore("00000000-0000-0000-0000-000000000000", messages);
      expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND", message: messages.notFound } });
    });
  });

  describe("listLabelItemsCore", () => {
    it("includes the active product, its active variant, and the active bundle, but not the inactive product", async () => {
      const items = await listLabelItemsCore();
      const keys = items.map((item) => `${item.type}:${item.id}`);

      expect(keys).toContain(`product:${productId}`);
      expect(keys).toContain(`variant:${variantId}`);
      expect(keys).toContain(`bundle:${bundleId}`);
      expect(keys).not.toContain(`product:${inactiveProductId}`);

      const variantItem = items.find((item) => item.id === variantId);
      expect(variantItem?.nameFr).toContain("Bleu");
      expect(variantItem?.categoryId).toBe(categoryId);

      const bundleItem = items.find((item) => item.id === bundleId);
      expect(bundleItem?.categoryId).toBeNull();
    });
  });

  describe("saveLabelSheetSelectionCore / getLabelSheetSelectionCore", () => {
    it("round-trips a selection for a user and overwrites it wholesale on the next save", async () => {
      const empty = await getLabelSheetSelectionCore(actorId);
      expect(empty).toEqual([]);

      const first = await saveLabelSheetSelectionCore(
        [
          { type: "product", id: productId },
          { type: "variant", id: variantId },
        ],
        actorId,
        messages,
      );
      expect(first.ok).toBe(true);

      const afterFirstSave = await getLabelSheetSelectionCore(actorId);
      expect(afterFirstSave).toEqual([
        { type: "product", id: productId },
        { type: "variant", id: variantId },
      ]);

      const second = await saveLabelSheetSelectionCore([{ type: "bundle", id: bundleId }], actorId, messages);
      expect(second.ok).toBe(true);

      const afterSecondSave = await getLabelSheetSelectionCore(actorId);
      expect(afterSecondSave).toEqual([{ type: "bundle", id: bundleId }]);
    });

    it("rejects a malformed selection with VALIDATION", async () => {
      const result = await saveLabelSheetSelectionCore([{ type: "product", id: "not-a-uuid" }], actorId, messages);
      expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.invalidSelection } });
    });
  });
});
