import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { accounts, categories, products, productVariants, sessions, stockMovements, users } from "@/src/db/schema";
import { auth } from "@/src/lib/auth";
import { evaluateSession } from "@/src/services/authz";
import { createProductCore, updateProductCore } from "@/src/services/products";

const messages = {
  invalidInput: "invalid",
  discountTooHigh: "discount-too-high",
  slugTaken: "slug-taken",
  priceBelowPromo: "price-below-promo",
};

describe("products service — createProductCore / updateProductCore", () => {
  let actorId: string;
  let categoryId: string;
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    const [actor] = await db
      .insert(users)
      .values({
        name: "Products Test Actor",
        email: `products-test-actor-${Date.now()}@example.com`,
        emailVerified: true,
        role: "admin",
      })
      .returning({ id: users.id });
    actorId = actor.id;

    const [category] = await db
      .insert(categories)
      .values({ nameAr: "فئة اختبار", nameFr: "Categorie test", slug: `products-test-cat-${Date.now()}` })
      .returning({ id: categories.id });
    categoryId = category.id;
  });

  afterAll(async () => {
    for (const id of createdProductIds) {
      await db.delete(stockMovements).where(eq(stockMovements.productId, id));
      await db.delete(productVariants).where(eq(productVariants.productId, id));
      await db.delete(products).where(eq(products.id, id));
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
    await db.delete(users).where(eq(users.id, actorId));
  });

  function baseInput(overrides: Record<string, unknown> = {}) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      nameAr: "منتج اختبار",
      nameFr: `Produit test ${unique}`,
      categoryId,
      price: 1000,
      lowStockThreshold: 5,
      allowBackorder: false,
      isActive: true,
      slug: `test-product-${unique}`,
      images: [],
      variants: [],
      stockQty: 10,
      ...overrides,
    };
  }

  it("rejects a discount price greater than or equal to the price", async () => {
    const result = await createProductCore(
      baseInput({ price: 1000, discountPrice: 1000 }),
      actorId,
      messages,
    );
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.discountTooHigh } });
  });

  it("creates a product, writes an initial restock stock_movements row, and assigns sequential variant SKUs", async () => {
    const result = await createProductCore(
      baseInput({
        stockQty: 7,
        variants: [
          { nameAr: "أحمر", nameFr: "Rouge", stockQty: 3, images: [] },
          { nameAr: "أزرق", nameFr: "Bleu", stockQty: 0, images: [] },
        ],
      }),
      actorId,
      messages,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdProductIds.push(result.data.id);

    const [product] = await db.select().from(products).where(eq(products.id, result.data.id)).limit(1);
    expect(product.sku).toMatch(/^P-\d{6}$/);
    expect(product.stockQty).toBe(7);

    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, result.data.id));
    // One movement for the product's own initial stock (7) and one for the
    // red variant's initial stock (3) — the blue variant starts at 0, which
    // is not a real stock change, so it gets no movement row.
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.reason === "restock")).toBe(true);
    expect(movements.find((m) => m.variantId === null)?.delta).toBe(7);
    expect(movements.find((m) => m.variantId !== null)?.delta).toBe(3);

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, result.data.id));
    expect(variants).toHaveLength(2);
    expect(new Set(variants.map((v) => v.sku)).size).toBe(2);
    for (const variant of variants) expect(variant.sku).toMatch(/^V-\d{6}$/);
  });

  it("rejects a duplicate slug with CONFLICT", async () => {
    const slug = `dup-slug-${Date.now()}`;

    const first = await createProductCore(baseInput({ slug }), actorId, messages);
    expect(first.ok).toBe(true);
    if (first.ok) createdProductIds.push(first.data.id);

    const second = await createProductCore(baseInput({ slug }), actorId, messages);
    expect(second).toEqual({ ok: false, error: { code: "CONFLICT", message: messages.slugTaken } });
  });

  it("updateProductCore also rejects a discount price greater than or equal to the price", async () => {
    const created = await createProductCore(baseInput({ stockQty: 4 }), actorId, messages);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductIds.push(created.data.id);

    const result = await updateProductCore(
      created.data.id,
      baseInput({ price: 500, discountPrice: 500 }),
      actorId,
      messages,
    );
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", message: messages.discountTooHigh } });
  });
});

/**
 * `requireUser()` (the real role gate every exported product service call
 * starts with) calls `next/headers`'s `headers()`, which throws outside a
 * real Next.js request scope and so cannot be invoked directly from Vitest —
 * the same constraint documented for `evaluateSession` in
 * `tests/services/authz.test.ts` (see progress-tracker.md's Task 03 notes).
 * `evaluateSession` is the pure gate `requireUser` wraps, so this exercises
 * the exact check every product/category mutation runs before touching the
 * database, using a real signed-in staff session rather than a fabricated one.
 */
describe("product mutations are blocked for a real staff session", () => {
  const authMessages = { unauthorized: "unauthorized", forbidden: "forbidden" };
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(sessions).where(eq(sessions.userId, id));
      await db.delete(accounts).where(eq(accounts.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("FORBIDDEN: a real staff session fails the admin-only gate that guards createProduct/updateProduct", async () => {
    const email = `products-test-staff-${Date.now()}@example.com`;
    const password = "correct-horse-battery";

    const [user] = await db
      .insert(users)
      .values({ name: "Test staff", email, emailVerified: true, role: "staff" })
      .returning({ id: users.id });
    createdUserIds.push(user.id);

    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(password),
    });

    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers(),
      returnHeaders: true,
    });
    const cookie = signInHeaders.getSetCookie().find((value) => value.includes("session_token"));
    if (!cookie) throw new Error("Sign-in did not return a session cookie");

    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie.split(";")[0] }) });
    expect(session?.user.role).toBe("staff");

    const result = evaluateSession(session, { permission: "catalog.manage" }, authMessages);
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN", message: authMessages.forbidden } });
  });
});
