import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/src/db/client";
import { orderEvents, orders } from "@/src/db/schema";
import type { ServiceResult } from "@/src/lib/errors";
import type { OrderStatusValue, TrackingDelivery } from "@/src/lib/order-tracking";
import { normalizeMauritanianPhone } from "@/src/lib/phone";

const trackOrderSchema = z.object({
  code: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(1).max(20),
});

export type TrackOrderInput = z.infer<typeof trackOrderSchema>;

export type TrackOrderMessages = { notFound: string };

export type TrackOrderResult = {
  code: string;
  status: OrderStatusValue;
  delivery: TrackingDelivery;
  busCompany: string | null;
  busNote: string | null;
  statusDates: Partial<Record<OrderStatusValue, Date>>;
};

/**
 * Public order tracking (task 12) — same public-read posture as
 * `storefront.ts`, no permission gate. Called directly from the `/track`
 * server component (no API route needed, unlike `orders.ts`'s POST), so the
 * locale is already known and passed in rather than sniffed from a request
 * body.
 */
export async function trackOrder(input: unknown, locale: string): Promise<ServiceResult<TrackOrderResult>> {
  const t = await getTranslations({ locale, namespace: "track.errors" });
  return trackOrderCore(input, { notFound: t("notFound") });
}

/**
 * A single `NOT_FOUND` outcome covers a malformed pair, an unknown code, and
 * a right-code/wrong-phone mismatch alike — task 12's "no existence leak"
 * requirement means there is deliberately no separate validation error a
 * guesser could use as an oracle.
 */
export async function trackOrderCore(input: unknown, messages: TrackOrderMessages): Promise<ServiceResult<TrackOrderResult>> {
  const parsed = trackOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  }

  const normalizedPhone = normalizeMauritanianPhone(parsed.data.phone);
  if (!normalizedPhone) {
    return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  }

  const code = parsed.data.code.toUpperCase();
  const [order] = await db.select().from(orders).where(eq(orders.code, code));

  if (!order || order.customerPhone !== normalizedPhone) {
    return { ok: false, error: { code: "NOT_FOUND", message: messages.notFound } };
  }

  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id));

  // `status_changed` events (task 13's admin state machine) carry
  // `{ from, to }` in their payload; today only `created` ever gets
  // written, so every order still in `pending` shows just the "received"
  // date — expected until task 13 ships, not a bug here.
  const statusDates: Partial<Record<OrderStatusValue, Date>> = {};
  for (const event of events) {
    if (event.type === "created") {
      statusDates.pending = event.createdAt;
    } else if (event.type === "status_changed") {
      const to = (event.payload as { to?: unknown } | null)?.to;
      if (typeof to === "string") statusDates[to as OrderStatusValue] = event.createdAt;
    } else if (event.type === "cancelled" || event.type === "voided") {
      statusDates[event.type] = event.createdAt;
    }
  }
  const status = order.status as OrderStatusValue;
  if (!statusDates[status]) statusDates[status] = order.updatedAt;

  return {
    ok: true,
    data: {
      code: order.code,
      status,
      delivery: (order.delivery ?? "pickup") as TrackingDelivery,
      busCompany: order.busCompany,
      busNote: order.busNote,
      statusDates,
    },
  };
}
