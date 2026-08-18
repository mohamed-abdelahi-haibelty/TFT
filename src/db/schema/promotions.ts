import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { bundles } from "./bundles";
import { products } from "./catalog";
import { id, timestamps } from "./columns";
import { promotionChannel, promotionKind } from "./enums";

export const promotions = pgTable(
  "promotions",
  {
    id: id(),
    nameAr: text("name_ar").notNull(),
    nameFr: text("name_fr").notNull(),
    kind: promotionKind("kind").notNull(),
    value: integer("value").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    channel: promotionChannel("channel").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("promotions_ends_at_idx").on(table.endsAt),
    check("promotions_ends_after_starts", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "promotions_value_in_range",
      sql`(${table.kind} = 'percent' AND ${table.value} BETWEEN 1 AND 90) OR (${table.kind} = 'fixed' AND ${table.value} > 0)`,
    ),
  ],
);

export const promotionItems = pgTable(
  "promotion_items",
  {
    id: id(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    bundleId: uuid("bundle_id").references(() => bundles.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("promotion_items_product_id_idx").on(table.productId),
    index("promotion_items_bundle_id_idx").on(table.bundleId),
    unique("promotion_items_promotion_product_bundle_unique").on(
      table.promotionId,
      table.productId,
      table.bundleId,
    ),
    check(
      "promotion_items_product_xor_bundle",
      sql`(${table.productId} IS NOT NULL AND ${table.bundleId} IS NULL) OR (${table.productId} IS NULL AND ${table.bundleId} IS NOT NULL)`,
    ),
  ],
);
