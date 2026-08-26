import { desc } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { productVariants, products } from "./catalog";
import { id } from "./columns";
import { stockMovementReason } from "./enums";
import { orders } from "./orders";

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    delta: integer("delta").notNull(),
    reason: stockMovementReason("reason").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_product_id_created_at_idx").on(table.productId, table.createdAt),
    // `listStockMovements` defaults to no product filter at all — the whole
    // ledger, newest first — which the composite above cannot serve, because
    // `product_id` leads it. This is the fastest-growing table in the schema
    // (one row per line per sale), so leaving that read as a full scan and
    // sort gets steadily more expensive for the life of the shop.
    index("stock_movements_created_at_idx").on(desc(table.createdAt)),
  ],
);
