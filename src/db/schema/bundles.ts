import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { productVariants, products } from "./catalog";

export const bundles = pgTable("bundles", {
  id: id(),
  nameAr: text("name_ar").notNull(),
  nameFr: text("name_fr").notNull(),
  descriptionAr: text("description_ar"),
  descriptionFr: text("description_fr"),
  slug: text("slug").notNull().unique(),
  price: integer("price").notNull(),
  sku: text("sku").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const bundleImages = pgTable("bundle_images", {
  id: id(),
  bundleId: uuid("bundle_id")
    .notNull()
    .references(() => bundles.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull(),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
});

export const bundleItems = pgTable(
  "bundle_items",
  {
    id: id(),
    bundleId: uuid("bundle_id")
      .notNull()
      .references(() => bundles.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variantId: uuid("variant_id").references(() => productVariants.id),
    qty: integer("qty").notNull().default(1),
    ...timestamps,
  },
  (table) => [check("bundle_items_qty_positive", sql`${table.qty} >= 1`)],
);
