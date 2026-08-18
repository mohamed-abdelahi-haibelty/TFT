import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "staff"]);

export const orderSource = pgEnum("order_source", ["web", "pos"]);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "arrived",
  "ready",
  "delivered",
  "cancelled",
  "voided",
]);

export const orderCity = pgEnum("order_city", ["ndb", "nkc", "other"]);

export const orderDelivery = pgEnum("order_delivery", ["pickup", "bus"]);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "bankily",
  "masrvi",
  "sedad",
  "other",
]);

export const orderEventType = pgEnum("order_event_type", [
  "created",
  "status_changed",
  "items_edited",
  "line_removed",
  "cancelled",
  "voided",
  "note_added",
]);

export const promotionKind = pgEnum("promotion_kind", ["percent", "fixed"]);

export const promotionChannel = pgEnum("promotion_channel", ["web", "pos", "both"]);

export const stockMovementReason = pgEnum("stock_movement_reason", [
  "web_sale",
  "pos_sale",
  "cancel_restock",
  "void_restock",
  "manual_adjust",
  "restock",
  "correction",
]);
