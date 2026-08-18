import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/src/db/client";
import { orderEvents, orders } from "@/src/db/schema";
import { trackOrderCore, type TrackOrderMessages } from "@/src/services/tracking";

const messages: TrackOrderMessages = { notFound: "not found" };

describe("tracking service — trackOrderCore", () => {
  const createdOrderIds: string[] = [];

  function unique() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function makeOrder(overrides: Partial<typeof orders.$inferInsert> = {}) {
    const [order] = await db
      .insert(orders)
      .values({
        code: `TFT-TEST-${unique()}`.toUpperCase(),
        source: "web",
        status: "pending",
        customerName: "فاطمتو",
        customerPhone: "22222345678",
        city: "ndb",
        delivery: "pickup",
        subtotal: 1000,
        discountTotal: 0,
        total: 1000,
        ...overrides,
      })
      .returning();
    createdOrderIds.push(order.id);
    return order;
  }

  afterAll(async () => {
    for (const orderId of createdOrderIds) {
      await db.delete(orderEvents).where(eq(orderEvents.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
  });

  it("rejects a malformed pair with the generic not-found error", async () => {
    const result = await trackOrderCore({ code: "", phone: "" }, messages);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ code: "NOT_FOUND", message: "not found" });
  });

  it("rejects an unknown order code with the same generic error (no existence leak)", async () => {
    const result = await trackOrderCore({ code: "TFT-0000-999", phone: "22345678" }, messages);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("rejects a real code paired with the wrong phone, with the same generic error", async () => {
    const order = await makeOrder({ customerPhone: "22222345678" });
    await db.insert(orderEvents).values({ orderId: order.id, type: "created", payload: { source: "web" } });

    const result = await trackOrderCore({ code: order.code, phone: "34567890" }, messages);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ code: "NOT_FOUND", message: "not found" });
  });

  it("accepts the right code + phone pair, case- and prefix-insensitively, and reports the pending status", async () => {
    const createdAt = new Date("2026-01-05T09:00:00Z");
    const order = await makeOrder({ customerPhone: "22222345678", delivery: "bus", createdAt, updatedAt: createdAt });
    await db.insert(orderEvents).values({ orderId: order.id, type: "created", payload: { source: "web" }, createdAt });

    const result = await trackOrderCore({ code: order.code.toLowerCase(), phone: "+222 22 34 56 78" }, messages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.code).toBe(order.code);
    expect(result.data.status).toBe("pending");
    expect(result.data.delivery).toBe("bus");
    expect(result.data.statusDates.pending).toEqual(createdAt);
  });

  it("reads a status_changed event's payload.to as the reached date for a later status", async () => {
    const shippedAt = new Date("2026-01-07T08:00:00Z");
    const order = await makeOrder({
      customerPhone: "22222345678",
      delivery: "bus",
      status: "shipped",
      busCompany: "Compagnie X",
    });
    await db.insert(orderEvents).values([
      { orderId: order.id, type: "created", payload: { source: "web" } },
      { orderId: order.id, type: "status_changed", payload: { from: "preparing", to: "shipped" }, createdAt: shippedAt },
    ]);

    const result = await trackOrderCore({ code: order.code, phone: "22345678" }, messages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("shipped");
    expect(result.data.statusDates.shipped).toEqual(shippedAt);
    expect(result.data.busCompany).toBe("Compagnie X");
  });

  it("falls back to the order's updatedAt when the current status has no matching event", async () => {
    const updatedAt = new Date("2026-01-08T08:00:00Z");
    const order = await makeOrder({ customerPhone: "22222345678", status: "confirmed", updatedAt });

    const result = await trackOrderCore({ code: order.code, phone: "22345678" }, messages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.statusDates.confirmed).toEqual(updatedAt);
  });

  it("reports a cancelled order's status without exposing a reason", async () => {
    const order = await makeOrder({ customerPhone: "22222345678", status: "cancelled" });
    await db.insert(orderEvents).values([
      { orderId: order.id, type: "created", payload: { source: "web" } },
      { orderId: order.id, type: "cancelled", payload: { reason: "customer changed their mind" } },
    ]);

    const result = await trackOrderCore({ code: order.code, phone: "22345678" }, messages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("cancelled");
    // The service surfaces status + dates only — no `reason`/payload field exists on TrackOrderResult at all.
    expect(result.data).not.toHaveProperty("reason");
  });
});
