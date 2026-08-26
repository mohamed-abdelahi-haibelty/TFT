import { desc, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bundles } from "./bundles";
import { productVariants, products } from "./catalog";
import { id, timestamps } from "./columns";
import {
  orderCity,
  orderDelivery,
  orderEventType,
  orderSource,
  orderStatus,
  paymentMethod,
} from "./enums";
import { users } from "./auth";

export const orders = pgTable(
  "orders",
  {
    id: id(),
    code: text("code").notNull().unique(),
    source: orderSource("source").notNull(),
    status: orderStatus("status").notNull(),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    city: orderCity("city"),
    delivery: orderDelivery("delivery"),
    busCompany: text("bus_company"),
    busNote: text("bus_note"),
    paymentMethod: paymentMethod("payment_method"),
    paymentNote: text("payment_note"),
    subtotal: integer("subtotal").notNull(),
    discountTotal: integer("discount_total").notNull().default(0),
    total: integer("total").notNull(),
    note: text("note"),
    /**
     * Client-minted key for one checkout attempt. Neither order-creation path
     * was idempotent: the classic mobile failure — request lands, response is
     * lost, customer retries — produced a duplicate pending order on the
     * storefront and a duplicate *delivered* sale at the register, double
     * stock decrement and double revenue included. A repeat carrying the same
     * key hits the unique index and returns the original order instead.
     *
     * Nullable, and Postgres allows many NULLs under a unique index, so
     * historical rows and any caller that doesn't send one are unaffected.
     */
    idempotencyKey: text("idempotency_key").unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    // `listOrdersAdmin` filters on `status` and sorts by `created_at desc`, and
    // the dashboard's pending-orders panel does `status IN (...)` ordered the
    // same way. A bare `status` index served neither ordering, so both paid for
    // a sort; this supersedes it outright, `status` being the leading column.
    index("orders_status_created_at_idx").on(table.status, desc(table.createdAt)),
    // Still needed on its own for the unfiltered list and the date-range
    // filters, which name no status at all.
    index("orders_created_at_idx").on(table.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // No onDelete: set null here would null one side of the product/bundle XOR
    // check while leaving the other null too, violating the constraint.
    productId: uuid("product_id").references(() => products.id),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    bundleId: uuid("bundle_id").references(() => bundles.id),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPrice: integer("unit_price").notNull(),
    qty: integer("qty").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    // Postgres does not index a foreign key for you (same note as
    // `product_images`), and this one was missed. Every order detail read,
    // `recomputeOrderTotals`, the dashboard's top-products join and the
    // `ON DELETE CASCADE` that fires when a failed sale deletes its order all
    // go through this column.
    index("order_items_order_id_idx").on(table.orderId),
    check("order_items_qty_positive", sql`${table.qty} >= 1`),
    check(
      "order_items_product_xor_bundle",
      sql`(${table.productId} IS NOT NULL AND ${table.bundleId} IS NULL) OR (${table.productId} IS NULL AND ${table.bundleId} IS NOT NULL)`,
    ),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: orderEventType("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_events_order_id_idx").on(table.orderId)],
);
