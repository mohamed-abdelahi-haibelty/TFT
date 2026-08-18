import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { categories, products } from "@/src/db/schema";
import { deleteCategoryCore } from "@/src/services/categories";

describe("categories service — deleteCategoryCore", () => {
  const messages = { hasProducts: "has-products" };
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار", nameFr: "Categorie test", slug: `cat-delete-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;

    const [product] = await db
      .insert(products)
      .values({
        nameAr: "منتج اختبار",
        nameFr: "Produit test",
        slug: `prod-delete-${Date.now()}`,
        categoryId,
        price: 100,
        sku: `TEST-DEL-${Date.now()}`,
      })
      .returning({ id: products.id });
    productId = product.id;
  });

  afterAll(async () => {
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(categories).where(eq(categories.id, categoryId));
  });

  it("blocks deleting a category that still has products", async () => {
    const result = await deleteCategoryCore(categoryId, messages);
    expect(result).toEqual({ ok: false, error: { code: "CONFLICT", message: messages.hasProducts } });
  });

  it("allows deleting a category once its products are gone", async () => {
    await db.delete(products).where(eq(products.id, productId));

    const result = await deleteCategoryCore(categoryId, messages);
    expect(result.ok).toBe(true);
  });
});
