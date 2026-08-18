import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./client";
import { bundleSeeds, categorySeeds, productSeeds } from "./seed-data";
import {
  accounts,
  bundleImages,
  bundleItems,
  bundles,
  categories,
  orders,
  productImages,
  products,
  stockMovements,
  users,
} from "./schema";

const seedEnvSchema = z.object({
  SEED_ADMIN_EMAIL: z.string().email("SEED_ADMIN_EMAIL must be a valid email"),
  SEED_ADMIN_PASSWORD: z.string().min(8, "SEED_ADMIN_PASSWORD must be at least 8 characters"),
});

async function seedAdmin(env: z.infer<typeof seedEnvSchema>) {
  const [inserted] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: env.SEED_ADMIN_EMAIL,
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  if (!inserted) {
    console.log(`Admin user already exists (${env.SEED_ADMIN_EMAIL}), skipping.`);
    return;
  }

  await db.insert(accounts).values({
    userId: inserted.id,
    accountId: inserted.id,
    providerId: "credential",
    password: await hashPassword(env.SEED_ADMIN_PASSWORD),
  });

  console.log(`Created admin user (${env.SEED_ADMIN_EMAIL}).`);
}

/**
 * Wipes all catalog data (categories, products, bundles, and everything that
 * hangs off them) so the test catalog can be reseeded from scratch. `orders`
 * and `stock_movements` reference products without cascading, so they're
 * cleared first; everything else (images, variants, bundle items,
 * promotion_items) cascades from `bundles`/`products`/`categories`.
 */
async function resetCatalog() {
  await db.delete(orders);
  await db.delete(stockMovements);
  await db.delete(bundles);
  await db.delete(products);
  await db.delete(categories);
  console.log("Cleared existing catalog data.");
}

async function seedCategories() {
  await db.insert(categories).values([...categorySeeds]);

  const rows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(
      inArray(
        categories.slug,
        categorySeeds.map((c) => c.slug),
      ),
    );

  return new Map(rows.map((r) => [r.slug, r.id]));
}

async function seedProducts(categoryBySlug: Map<string, string>) {
  const inserted = await db
    .insert(products)
    .values(
      productSeeds.map((p) => ({
        nameAr: p.nameAr,
        nameFr: p.nameFr,
        descriptionAr: p.descriptionAr,
        descriptionFr: p.descriptionFr,
        slug: p.slug,
        categoryId: categoryBySlug.get(p.categorySlug)!,
        price: p.price,
        discountPrice: p.discountPrice,
        sku: p.sku,
        stockQty: p.stockQty,
        allowBackorder: p.allowBackorder ?? false,
      })),
    )
    .returning({ id: products.id, slug: products.slug });

  const imagesBySlug = new Map(productSeeds.map((p) => [p.slug, p.images]));

  // Real photos (Pexels, openly licensed for commercial use) uploaded to the
  // `papeterie/` Cloudinary folder as `<slug>-<n>` — not placeholders.
  const imageRows = inserted.flatMap((p) => {
    const count = imagesBySlug.get(p.slug) ?? 1;
    return Array.from({ length: count }, (_, i) => ({
      productId: p.id,
      publicId: `papeterie/${p.slug}-${i + 1}`,
      sort: i,
    }));
  });

  await db.insert(productImages).values(imageRows);

  return new Map(inserted.map((r) => [r.slug, r.id]));
}

async function seedBundles(productBySlug: Map<string, string>) {
  for (const b of bundleSeeds) {
    const [inserted] = await db
      .insert(bundles)
      .values({
        nameAr: b.nameAr,
        nameFr: b.nameFr,
        descriptionAr: b.descriptionAr,
        descriptionFr: b.descriptionFr,
        slug: b.slug,
        price: b.price,
        sku: b.sku,
      })
      .returning({ id: bundles.id });

    await db.insert(bundleItems).values(
      b.items.map((item) => ({
        bundleId: inserted.id,
        productId: productBySlug.get(item.productSlug)!,
        qty: item.qty,
      })),
    );

    await db.insert(bundleImages).values(
      Array.from({ length: b.images }, (_, i) => ({
        bundleId: inserted.id,
        publicId: `papeterie/${b.slug}-${i + 1}`,
        sort: i,
      })),
    );
  }

  console.log(`Created ${bundleSeeds.length} bundles.`);
}

async function main() {
  const env = seedEnvSchema.parse(process.env);

  await seedAdmin(env);
  await resetCatalog();
  const categoryBySlug = await seedCategories();
  const productBySlug = await seedProducts(categoryBySlug);
  await seedBundles(productBySlug);

  console.log(`Seed complete: ${categorySeeds.length} categories, ${productSeeds.length} products, ${bundleSeeds.length} bundles.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
