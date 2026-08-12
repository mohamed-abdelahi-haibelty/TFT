/**
 * Typed catalog of PostHog custom events. Never add names, phone numbers, or
 * free-text notes to any event's props — order code is not PII and is allowed.
 */
export interface AnalyticsEventProps {
  // TODO(task 09): fire from the product detail page.
  product_viewed: { slug: string };
  // TODO(task 10): fire from the bundle detail page.
  bundle_viewed: { slug: string };
  // TODO(task 11): fire from the cart's "add" action.
  added_to_cart: { type: "product" | "bundle"; slug: string; qty: number };
  // TODO(task 11): fire server-side from POST /api/orders on success.
  order_submitted: { code: string; total: number; city: string; items_count: number };
  // TODO(task 11): fire when the WhatsApp handoff link is opened.
  whatsapp_opened: { code: string };
  // TODO(task 12): fire from the order tracking lookup result.
  order_tracked: { found: boolean };
  // TODO(task 14): fire server-side when a POS sale completes.
  pos_sale_completed: { total: number; items_count: number; payment_method: string };
}

export type AnalyticsEventName = keyof AnalyticsEventProps;
