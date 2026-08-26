/**
 * Typed catalog of PostHog custom events. Never add names, phone numbers, or
 * free-text notes to any event's props — order code is not PII and is allowed.
 *
 * Where each one fires is a deliberate split, not an accident of convenience.
 * Views and interactions are captured client-side because the pages they
 * happen on are cached: reporting them from a server component would either
 * run once per revalidation, no matter how many people looked, or force the
 * route dynamic and wake Neon for every visitor. Money events are captured
 * server-side, after the write commits, because a client cannot be trusted to
 * report a sale and must not be able to invent one.
 */
export interface AnalyticsEventProps {
  /** `useTrackView` in components/store/product-interactive.tsx. */
  product_viewed: { slug: string };
  /** `useTrackView` in components/store/bundle-interactive.tsx. */
  bundle_viewed: { slug: string };
  /** `addToCart` in src/lib/cart.ts — the one path both detail pages take. */
  added_to_cart: { type: "product" | "bundle"; slug: string; qty: number };
  /** `createOrderCore` in src/services/orders.ts, on the genuine-create branch only. */
  order_submitted: { code: string; total: number; city: string; items_count: number };
  /** The confirmation handoff link in components/store/checkout-view.tsx. */
  whatsapp_opened: { code: string };
  /** `trackOrderAction` in src/services/tracking-actions.ts. Whether, never what. */
  order_tracked: { found: boolean };
  /** `completeSaleCore` in src/services/pos.ts, after the sale transaction commits. */
  pos_sale_completed: { total: number; items_count: number; payment_method: string };
}

export type AnalyticsEventName = keyof AnalyticsEventProps;
