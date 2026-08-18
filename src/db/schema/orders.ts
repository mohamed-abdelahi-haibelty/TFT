import { sql } from "drizzle-orm";
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
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("orders_status_idx").on(table.status),
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
