import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

export const categories = pgTable("categories", {
  id: id(),
  nameAr: text("name_ar").notNull(),
  nameFr: text("name_fr").notNull(),
  slug: text("slug").notNull().unique(),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
});

export const products = pgTable(
  "products",
  {
    id: id(),
    nameAr: text("name_ar").notNull(),
    nameFr: text("name_fr").notNull(),
    descriptionAr: text("description_ar"),
    descriptionFr: text("description_fr"),
    slug: text("slug").notNull().unique(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    price: integer("price").notNull(),
    discountPrice: integer("discount_price"),
    sku: text("sku").notNull().unique(),
    stockQty: integer("stock_qty").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    allowBackorder: boolean("allow_backorder").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    isQuickPick: boolean("is_quick_pick").notNull().default(false),
    quickPickSort: integer("quick_pick_sort"),
    ...timestamps,
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_is_active_idx").on(table.isActive),
    // A backorder-enabled product is allowed to go negative (task 13: a
    // confirmed backorder line still decrements stock, visibly, past zero) —
    // every other product still can't.
    check(
      "products_stock_qty_non_negative",
      sql`${table.allowBackorder} = true OR ${table.stockQty} >= 0`,
    ),
  ],
);

export const productImages = pgTable("product_images", {
  id: id(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull(),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
});

// No non-negative check on `stockQty` here (unlike `products`): a variant's
// own `allowBackorder` isn't a column on this row, it's inherited from the
// parent product, and a CHECK constraint can't reach across tables — a
// backorder-enabled variant going negative (task 13) is enforced in the
// service layer instead, same as the non-backorder floor for a shared-stock
// variant (`stockQty: null`), which lives on the parent row.
export const productVariants = pgTable("product_variants", {
  id: id(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  nameAr: text("name_ar").notNull(),
  nameFr: text("name_fr").notNull(),
  colorHex: text("color_hex"),
  sku: text("sku").notNull().unique(),
  // null = use product stock
  stockQty: integer("stock_qty"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const variantImages = pgTable("variant_images", {
  id: id(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull(),
  sort: integer("sort").notNull().default(0),
  ...timestamps,
});
