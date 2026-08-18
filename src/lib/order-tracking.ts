export type OrderStatusValue =
  | "pending"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "arrived"
  | "ready"
  | "delivered"
  | "cancelled"
  | "voided";

export type TrackingDelivery = "pickup" | "bus";

export type TrackingStepKey = "received" | "confirmed" | "preparing" | "shipped" | "arrived" | "ready" | "delivered";

const STEP_STATUS: Record<TrackingStepKey, OrderStatusValue> = {
  received: "pending",
  confirmed: "confirmed",
  preparing: "preparing",
  shipped: "shipped",
  arrived: "arrived",
  ready: "ready",
  delivered: "delivered",
};

// Task 12's two customer-facing paths: bus delivery (NKC/other) surfaces
// "shipped"/"arrived"; NDB pickup skips straight from "preparing" to
// "ready". Both converge on "delivered".
const BUS_STEPS: TrackingStepKey[] = ["received", "confirmed", "preparing", "shipped", "arrived", "delivered"];
const PICKUP_STEPS: TrackingStepKey[] = ["received", "confirmed", "preparing", "ready", "delivered"];

export type TrackingStep = { key: TrackingStepKey; reached: boolean; reachedAt: Date | null };

/** `cancelled`/`voided` are terminal, off-sequence states the caller renders separately — never passed in here as `currentStatus`. */
export function isTerminalCancelledStatus(status: OrderStatusValue): boolean {
  return status === "cancelled" || status === "voided";
}

/**
 * Builds the ordered, delivery-specific step list a customer sees, marking
 * every step up to and including the current status as reached and
 * attaching whatever date `statusDates` has for it (from `order_events`,
 * task 13 writes `status_changed` events keyed by the status a step maps
 * to). A status that doesn't appear in the chosen sequence (defensive —
 * shouldn't happen once task 13's state machine is the only writer) leaves
 * every step but "received" unreached rather than throwing.
 */
export function buildTrackingSteps(
  delivery: TrackingDelivery,
  currentStatus: OrderStatusValue,
  statusDates: Partial<Record<OrderStatusValue, Date>>,
): TrackingStep[] {
  const sequence = delivery === "bus" ? BUS_STEPS : PICKUP_STEPS;
  const currentIndex = sequence.findIndex((key) => STEP_STATUS[key] === currentStatus);

  return sequence.map((key, index) => {
    const status = STEP_STATUS[key];
    const reached = currentIndex >= 0 ? index <= currentIndex : key === "received";
    return { key, reached, reachedAt: reached ? (statusDates[status] ?? null) : null };
  });
}
